"""School value-added and equity gaps.

Value-added: how much better/worse a school's students do than expected for
students with the same entry level, school type, language and textbook.
Estimates are shrunk towards zero for small schools (empirical Bayes), so a
school with 12 students cannot top the ranking by luck.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import ClusterOLS, cluster_mean_ci, pp, r, zscore
from .items import apply_exclusions


def _student_scores(ds, subject_id):
    s = ds.topic_scores()
    s = s[s["subject_id"] == subject_id]
    return (s.groupby("student_id")
            .agg(y=("pct", "mean"), school_id=("school_id", "first"), textbook_id=("textbook_id", "first"),
                 locality=("locality", "first"), language=("language", "first"), district=("district", "first"),
                 baseline=("baseline_score", "first"))
            .reset_index())


def value_added(ds, subject_id: str) -> dict:
    apply_exclusions(ds)

    def build():
        df = _student_scores(ds, subject_id)
        X = pd.DataFrame(index=df.index)
        if df["baseline"].notna().mean() > 0.5:
            X["baseline"] = zscore(df["baseline"].fillna(df["baseline"].mean()))
        X["rural"] = (df["locality"] == "rural").astype(float)
        X["kz"] = (df["language"] == "kz").astype(float)
        for b in sorted(df["textbook_id"].unique())[1:]:
            X[f"tb_{b}"] = (df["textbook_id"] == b).astype(float)
        m = ClusterOLS(df["y"], X, df["school_id"])
        df = df.loc[m.y.index].copy()
        df["expected"] = m.res.fittedvalues
        df["resid"] = df["y"] - df["expected"]
        g = df.groupby("school_id").agg(n=("resid", "size"), va=("resid", "mean"), var=("resid", "var"),
                                        actual=("y", "mean"), expected=("expected", "mean"),
                                        locality=("locality", "first"), language=("language", "first"),
                                        district=("district", "first"), textbook_id=("textbook_id", "first"))
        sigma2 = float(df["resid"].var())
        tau2 = max(float(g["va"].var() - (sigma2 / g["n"]).mean()), 1e-5)
        g["shrink"] = tau2 / (tau2 + sigma2 / g["n"])
        g["va_eb"] = g["va"] * g["shrink"]
        g["se"] = np.sqrt(g["shrink"] * sigma2 / g["n"])
        g["lo"], g["hi"] = g["va_eb"] - 1.96 * g["se"], g["va_eb"] + 1.96 * g["se"]
        names = ds.schools.set_index("school_id")["name"]

        # per school: topics where the school lags its expectation the most
        s = ds.topic_scores()
        s = s[s["subject_id"] == subject_id]
        topic_mean = s.groupby("topic_id")["pct"].mean()
        sch_topic = s.groupby(["school_id", "topic_id"])["pct"].mean().unstack()
        tnames = ds.topics.set_index("topic_id")["name"]
        rows = []
        for sid, x in g.iterrows():
            # weakness relative to the school's own overall level
            gap = ((sch_topic.loc[sid] - topic_mean) - (x["actual"] - topic_mean.mean())).dropna().sort_values()
            weak = [dict(topic_id=t, name=tnames.get(t, t), gap=pp(v)) for t, v in gap.head(3).items() if v < -0.03]
            cls = "above" if x["lo"] > 0 else "below" if x["hi"] < 0 else "typical"
            rows.append(dict(school_id=sid, name=names.get(sid, sid), district=x["district"], locality=x["locality"],
                             language=x["language"], textbook_id=x["textbook_id"], n_students=int(x["n"]),
                             actual=pp(x["actual"]), expected=pp(x["expected"]),
                             value_added=pp(x["va_eb"]), ci=[pp(x["lo"]), pp(x["hi"])], raw_value_added=pp(x["va"]),
                             category=cls, weak_topics=weak))
        rows.sort(key=lambda x: -x["value_added"])
        for i, row in enumerate(rows, 1):
            row["rank"] = i
        # naive ranking vs fair ranking: how many schools move a lot
        naive_rank = {x["school_id"]: i for i, x in enumerate(sorted(rows, key=lambda x: -x["actual"]), 1)}
        for row in rows:
            row["naive_rank"] = naive_rank[row["school_id"]]
        moved = sum(1 for x in rows if abs(x["rank"] - x["naive_rank"]) >= len(rows) // 4)
        districts = (pd.DataFrame(rows).groupby("district")
                     .apply(lambda d: pd.Series(dict(value_added=np.average(d["value_added"], weights=d["n_students"]),
                                                     actual=np.average(d["actual"], weights=d["n_students"]),
                                                     n_schools=len(d), n_students=int(d["n_students"].sum()))),
                            include_groups=False)
                     .reset_index())
        return dict(schools=rows, n_above=sum(x["category"] == "above" for x in rows),
                    n_below=sum(x["category"] == "below" for x in rows), rank_shifts=moved,
                    districts=[dict(district=d["district"], value_added=r(d["value_added"], 1), actual=r(d["actual"], 1),
                                    n_schools=int(d["n_schools"]), n_students=int(d["n_students"]))
                               for _, d in districts.sort_values("value_added", ascending=False).iterrows()])

    return ds.cached(("va", subject_id), build)


def equity(ds, subject_id: str) -> dict:
    """Urban/rural and kz/ru gaps per topic, raw and adjusted for entry level."""
    apply_exclusions(ds)

    def build():
        s = ds.topic_scores()
        s = s[s["subject_id"] == subject_id]
        topics = ds.subject_topics(subject_id)
        out = []
        for dim, a, b in [("locality", "urban", "rural"), ("language", "ru", "kz")]:
            if s[dim].nunique() < 2:
                continue
            rows = []
            for _, t in topics.iterrows():
                st = s[s["topic_id"] == t["topic_id"]]
                ma, la, ha = cluster_mean_ci(st.loc[st[dim] == a, "pct"], st.loc[st[dim] == a, "school_id"])
                mb, lb, hb = cluster_mean_ci(st.loc[st[dim] == b, "pct"], st.loc[st[dim] == b, "school_id"])
                X = pd.DataFrame({"grp": (st[dim] == b).astype(float)}, index=st.index)
                if st["baseline_score"].notna().mean() > 0.5:
                    X["baseline"] = zscore(st["baseline_score"].fillna(st["baseline_score"].mean()))
                m = ClusterOLS(st["pct"], X, st["school_id"])
                c = m.contrast({"grp": 1.0})
                rows.append(dict(topic_id=t["topic_id"], name=t["name"], name_kz=t["name_kz"],
                                 a=pp(ma), b=pp(mb), raw_gap=r((mb - ma) * 100, 1),
                                 adjusted_gap=pp(c["est"]), ci=[pp(c["lo"]), pp(c["hi"])], p=r(c["p"], 4)))
            raw = np.mean([x["raw_gap"] for x in rows])
            adj = np.mean([x["adjusted_gap"] for x in rows])
            widest = sorted(rows, key=lambda x: x["adjusted_gap"])[:3]
            out.append(dict(dimension=dim, a=a, b=b, mean_raw_gap=r(raw, 1), mean_adjusted_gap=r(adj, 1),
                            explained_by_entry=r(1 - adj / raw, 2) if raw and np.sign(raw) == np.sign(adj) and abs(adj) <= abs(raw) else None,
                            widest=[x["topic_id"] for x in widest], topics=rows))
        return out

    return ds.cached(("equity", subject_id), build)


def district_map(ds, subject_id: str) -> list[dict]:
    """Per-district indicators for the region map."""
    apply_exclusions(ds)

    def build():
        s = ds.topic_scores()
        s = s[s["subject_id"] == subject_id]
        va = {d["district"]: d for d in value_added(ds, subject_id)["districts"]}
        sch_cat = pd.DataFrame(value_added(ds, subject_id)["schools"]).groupby("district")["category"]
        region_topic = s.groupby("topic_id")["pct"].mean()
        names = ds.topics.set_index("topic_id")
        out = []
        for dist, g in s.groupby("district"):
            student = g.groupby("student_id")["pct"].mean()
            gap = (g.groupby("topic_id")["pct"].mean() - region_topic).sort_values()
            worst = gap.index[0]
            cats = sch_cat.get_group(dist) if dist in sch_cat.groups else pd.Series(dtype=str)
            out.append(dict(
                district=dist, n_schools=int(g["school_id"].nunique()), n_students=int(g["student_id"].nunique()),
                mean_pct=pp(student.mean()), mastered_share=pp(g["mastered"].mean()),
                value_added=va.get(dist, {}).get("value_added"),
                rural_share=pp((g.drop_duplicates("school_id")["locality"] == "rural").mean()),
                kz_share=pp((g.drop_duplicates("school_id")["language"] == "kz").mean()),
                below=int((cats == "below").sum()), above=int((cats == "above").sum()),
                worst_topic=dict(topic_id=worst, name=names.loc[worst, "name"],
                                 name_kz=names.loc[worst, "name_kz"] if "name_kz" in names else names.loc[worst, "name"],
                                 gap=pp(gap.iloc[0]))))
        return sorted(out, key=lambda x: x["district"])

    return ds.cached(("districts", subject_id), build)
