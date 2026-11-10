"""Topic mastery analysis and difficulty classification."""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import cluster_mean_ci, pp, r
from .items import apply_exclusions

STATUS_ORDER = {"critical": 0, "risk": 1, "ok": 2, "strong": 3}


def classify(mean_pct: float, mastered_share: float) -> str:
    if mastered_share < 0.45 or mean_pct < 0.55:
        return "critical"
    if mastered_share < 0.6 or mean_pct < 0.65:
        return "risk"
    if mastered_share > 0.8:
        return "strong"
    return "ok"


def topic_table(ds, subject_id: str, filters: dict | None = None) -> list[dict]:
    apply_exclusions(ds)
    key = ("topic_table", subject_id, tuple(sorted((filters or {}).items())))

    def build():
        s = ds.topic_scores()
        s = s[s["subject_id"] == subject_id]
        for k, v in (filters or {}).items():
            if v and k in s:
                s = s[s[k] == v]
        topics = ds.subject_topics(subject_id)
        out = []
        for _, t in topics.iterrows():
            st = s[s["topic_id"] == t["topic_id"]]
            if st.empty:
                continue
            m, lo, hi = cluster_mean_ci(st["pct"], st["school_id"])
            mastered = float(st["mastered"].mean())
            class_means = st.groupby("class_id")["pct"].mean()
            school_means = st.groupby("school_id")["pct"].mean()
            by = {}
            for col in ["locality", "language", "textbook_id"]:
                if col in st:
                    by[col] = {str(k): pp(v) for k, v in st.groupby(col)["pct"].mean().items()}
            hist, _ = np.histogram(st["pct"], bins=np.linspace(0, 1, 11))
            out.append(dict(
                topic_id=t["topic_id"], name=t["name"], name_kz=t["name_kz"],
                section=t["section"], section_kz=t["section_kz"], order=int(t["order"]),
                planned_hours=r(t["planned_hours"], 1), actual_hours=r(st.groupby("class_id")["hours"].first().mean(), 1),
                prerequisites=t["prereq_list"],
                mean_pct=pp(m), ci=[pp(lo), pp(hi)], mastered_share=pp(mastered),
                not_mastered_students=int((~st["mastered"]).sum()), n_students=int(len(st)),
                n_schools=int(st["school_id"].nunique()),
                class_spread=pp(class_means.std()), school_min=pp(school_means.min()), school_max=pp(school_means.max()),
                by=by, histogram=[int(x) for x in hist],
                status=classify(m, mastered),
            ))
        # difficulty rank (1 = hardest)
        for rank, row in enumerate(sorted(out, key=lambda x: x["mean_pct"]), start=1):
            row["difficulty_rank"] = rank
        return out

    return ds.cached(key, build)


def section_table(ds, subject_id: str) -> list[dict]:
    rows = topic_table(ds, subject_id)
    df = pd.DataFrame(rows)
    out = []
    for sec, g in df.groupby("section", sort=False):
        w = g["n_students"]
        out.append(dict(section=sec, section_kz=g["section_kz"].iloc[0],
                        mean_pct=r(np.average(g["mean_pct"], weights=w), 1),
                        mastered_share=r(np.average(g["mastered_share"], weights=w), 1),
                        topics=list(g["topic_id"]), planned_hours=r(g["planned_hours"].sum(), 1),
                        worst_topic=g.sort_values("mean_pct").iloc[0]["topic_id"]))
    return out


def subject_overview(ds, subject_id: str) -> dict:
    apply_exclusions(ds)
    s = ds.topic_scores()
    s = s[s["subject_id"] == subject_id]
    rows = topic_table(ds, subject_id)
    student = s.groupby("student_id")["pct"].mean()
    return dict(
        subject_id=subject_id,
        n_students=int(s["student_id"].nunique()), n_schools=int(s["school_id"].nunique()),
        n_classes=int(s["class_id"].nunique()), n_topics=len(rows),
        n_textbooks=int(s["textbook_id"].nunique()),
        mean_pct=pp(student.mean()),
        mastered_share=pp(s["mastered"].mean()),
        critical_topics=sum(1 for x in rows if x["status"] == "critical"),
        risk_topics=sum(1 for x in rows if x["status"] == "risk"),
        excluded_items=sorted(set(ds.items.loc[ds.items["topic_id"].isin([x["topic_id"] for x in rows]), "item_id"])
                              & ds.excluded_items),
        distribution=[int(x) for x in np.histogram(student, bins=np.linspace(0, 1, 11))[0]],
    )
