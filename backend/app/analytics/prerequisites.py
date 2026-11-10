"""Knowledge-graph analysis: how much does a weak prerequisite drag a topic down?

For every declared link P -> T we estimate the *specific* dependency:
students of the same general level (rest-of-subject score, baseline, same
class) are compared — does knowing P still predict success in T? This
separates real methodological dependencies from 'strong students are strong
everywhere'. We also scan undeclared pairs for hidden dependencies.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import pp, r
from .items import apply_exclusions
from .topics import topic_table

STRONG, MODERATE = 0.12, 0.08


def _residualize(y: np.ndarray, X: np.ndarray) -> np.ndarray:
    beta, *_ = np.linalg.lstsq(X, y, rcond=None)
    return y - X @ beta


def _demean(df: pd.DataFrame, by: pd.Series) -> pd.DataFrame:
    return df - df.groupby(by.to_numpy()).transform("mean")


def analyze(ds, subject_id: str) -> dict:
    apply_exclusions(ds)

    def build():
        s = ds.topic_scores()
        s = s[s["subject_id"] == subject_id]
        wide = s.pivot_table(index="student_id", columns="topic_id", values="pct")
        meta = s.groupby("student_id").agg(class_id=("class_id", "first"), baseline=("baseline_score", "first"))
        wide = wide.dropna()
        meta = meta.loc[wide.index]
        if meta["baseline"].isna().all():
            meta["baseline"] = 0.0
        meta["baseline"] = meta["baseline"].fillna(meta["baseline"].mean())
        topics = ds.subject_topics(subject_id)
        order = {t: i for i, t in enumerate(topics["topic_id"])}
        tt = {x["topic_id"]: x for x in topic_table(ds, subject_id)}
        declared = {(p, t) for t, ps in zip(topics["topic_id"], topics["prereq_list"]) for p in ps}
        cols = list(wide.columns)
        total = wide.sum(axis=1)
        dm_wide = _demean(wide, meta["class_id"])
        dm_base = _demean(meta[["baseline"]], meta["class_id"])["baseline"].to_numpy()
        dm_total = _demean(total.to_frame("t"), meta["class_id"])["t"].to_numpy()

        def edge(p, t):
            rest = dm_total - dm_wide[p].to_numpy() - dm_wide[t].to_numpy()
            X = np.column_stack([np.ones(len(rest)), rest, dm_base])
            ry = _residualize(dm_wide[t].to_numpy(), X)
            rx = _residualize(dm_wide[p].to_numpy(), X)
            pc = float(np.corrcoef(rx, ry)[0, 1]) if rx.std() > 0 and ry.std() > 0 else 0.0
            # adjusted gap in topic T between students who mastered P vs not, within rest-score quintiles
            rest_raw = (total - wide[p] - wide[t]).rank(method="first")
            q = pd.qcut(rest_raw, 5, labels=False)
            mp = wide[p] >= 0.6
            gaps, wts = [], []
            for k in range(5):
                m = q == k
                a, b = wide.loc[m & mp, t], wide.loc[m & ~mp, t]
                if len(a) >= 10 and len(b) >= 10:
                    gaps.append(a.mean() - b.mean())
                    wts.append(min(len(a), len(b)))
            gap = float(np.average(gaps, weights=wts)) if gaps else np.nan
            n = len(rx)
            se = 1 / np.sqrt(max(n - 4, 1))
            strength = "strong" if pc >= STRONG else "moderate" if pc >= MODERATE else "none"
            return dict(prereq_id=p, topic_id=t, partial_corr=r(pc, 3), ci=[r(pc - 1.96 * se, 3), r(pc + 1.96 * se, 3)],
                        adjusted_gap=pp(gap), strength=strength,
                        p_given_not=pp(wide.loc[~mp, t].ge(0.6).mean()) if (~mp).any() else None,
                        p_given_yes=pp(wide.loc[mp, t].ge(0.6).mean()) if mp.any() else None,
                        prereq_not_mastered=pp(1 - mp.mean()))

        edges = []
        for p, t in sorted(declared, key=lambda e: (order.get(e[1], 0), order.get(e[0], 0))):
            if p in cols and t in cols:
                e = edge(p, t)
                e["declared"] = True
                edges.append(e)
        hidden = []
        for i, p in enumerate(cols):
            for t in cols:
                if order.get(p, 0) < order.get(t, 0) and (p, t) not in declared:
                    e = edge(p, t)
                    if e["partial_corr"] is not None and e["partial_corr"] >= STRONG * 1.25:
                        e["declared"] = False
                        hidden.append(e)
        hidden.sort(key=lambda e: -e["partial_corr"])

        # root causes: weak topic whose strong prerequisite is also weak
        root_causes = []
        for e in edges:
            tgt, src = tt.get(e["topic_id"]), tt.get(e["prereq_id"])
            if not tgt or not src or e["strength"] != "strong":
                continue
            if tgt["status"] in ("critical", "risk") and src["status"] in ("critical", "risk"):
                root_causes.append(dict(topic_id=e["topic_id"], topic_name=tgt["name"], root_id=e["prereq_id"],
                                        root_name=src["name"], partial_corr=e["partial_corr"],
                                        adjusted_gap=e["adjusted_gap"], root_not_mastered=e["prereq_not_mastered"]))
        root_causes.sort(key=lambda x: -(x["adjusted_gap"] or 0))

        # foundation weight: how much downstream mastery depends on each topic (used by the hours optimizer)
        influence = {t: 0.0 for t in cols}
        for e in edges:
            if e["strength"] != "none":
                influence[e["prereq_id"]] += max(e["partial_corr"] or 0, 0)

        nodes = [dict(topic_id=t["topic_id"], name=t["name"], name_kz=t["name_kz"], section=t["section"],
                      section_kz=t["section_kz"], order=int(t["order"]),
                      mean_pct=tt.get(t["topic_id"], {}).get("mean_pct"),
                      status=tt.get(t["topic_id"], {}).get("status"),
                      influence=r(influence.get(t["topic_id"], 0), 3))
                 for _, t in topics.iterrows()]
        return dict(nodes=nodes, edges=edges, hidden=hidden[:8], root_causes=root_causes,
                    nominal=[e for e in edges if e["strength"] == "none"])

    return ds.cached(("prereq", subject_id), build)
