"""Fair textbook comparison.

Schools choose textbooks non-randomly (strong urban schools often pick the
same book), so raw averages compare *schools*, not *books*. We estimate the
textbook effect with a regression that holds constant the student's entry
level (baseline diagnostic), rural/urban, language of instruction and the
hours actually spent, with standard errors clustered by school (the textbook
is chosen per school, so the effective sample size is the number of schools).
"""
from __future__ import annotations

from itertools import combinations

import numpy as np
import pandas as pd

from .common import ClusterOLS, cluster_mean_ci, pp, r, significance_label, zscore
from .items import apply_exclusions

OVERALL = "__overall__"


def _student_frame(ds, subject_id: str, topic_ids: list[str] | None = None) -> pd.DataFrame:
    s = ds.topic_scores()
    s = s[s["subject_id"] == subject_id]
    if topic_ids is not None:
        s = s[s["topic_id"].isin(topic_ids)]
    plan = ds.topics.set_index("topic_id")["planned_hours"]
    s = s.assign(plan=s["topic_id"].map(plan))
    g = s.groupby("student_id").agg(
        y=("pct", "mean"), school_id=("school_id", "first"), class_id=("class_id", "first"),
        textbook_id=("textbook_id", "first"), locality=("locality", "first"), language=("language", "first"),
        baseline=("baseline_score", "first"), hours=("hours", "sum"), plan=("plan", "sum"))
    g["hours_ratio"] = g["hours"] / g["plan"].replace(0, np.nan)
    return g.reset_index()


def _design(df: pd.DataFrame, books: list[str], ref: str, interactions: tuple = ()):
    X = pd.DataFrame(index=df.index)
    for b in books:
        if b != ref:
            X[f"tb[{b}]"] = (df["textbook_id"] == b).astype(float)
    if df["baseline"].notna().mean() > 0.5:
        X["baseline_z"] = zscore(df["baseline"].fillna(df["baseline"].mean()))
    if df["locality"].nunique() > 1:
        X["rural"] = (df["locality"] == "rural").astype(float)
    if df["language"].nunique() > 1:
        X["lang_kz"] = (df["language"] == "kz").astype(float)
    if df["hours_ratio"].notna().all() and df["hours_ratio"].std() > 0:
        X["hours_ratio"] = df["hours_ratio"]
    for var in interactions:
        if var in X:
            for b in books:
                if b != ref:
                    X[f"tb[{b}]:{var}"] = X[f"tb[{b}]"] * X[var]
    return X


def _fit_section(df: pd.DataFrame, books: list[str], ref: str) -> dict:
    X = _design(df, books, ref)
    m = ClusterOLS(df["y"], X, df["school_id"])
    base_pred = (m.X.drop(columns=[c for c in m.X.columns if c.startswith("tb[")]) @
                 m.params.drop([c for c in m.params.index if c.startswith("tb[")])).mean()
    adjusted, naive = {}, {}
    for b in books:
        sub = df[df["textbook_id"] == b]
        nm, nlo, nhi = cluster_mean_ci(sub["y"], sub["school_id"])
        naive[b] = dict(mean=pp(nm), ci=[pp(nlo), pp(nhi)])
        c = m.contrast({f"tb[{b}]": 1.0}) if b != ref else dict(est=0.0, lo=np.nan, hi=np.nan, p=np.nan)
        adjusted[b] = dict(mean=pp(base_pred + c["est"]), effect_vs_ref=pp(c["est"]),
                           ci=[pp(c["lo"]), pp(c["hi"])], p=r(c["p"], 4))
    pairs = []
    for a, b in combinations(books, 2):
        w = {}
        if a != ref:
            w[f"tb[{a}]"] = 1.0
        if b != ref:
            w[f"tb[{b}]"] = w.get(f"tb[{b}]", 0) - 1.0
        c = m.contrast(w)
        na, nb = naive[a]["mean"], naive[b]["mean"]
        pairs.append(dict(a=a, b=b, diff=pp(c["est"]), ci=[pp(c["lo"]), pp(c["hi"])], p=r(c["p"], 4),
                          significance=significance_label(c["p"]),
                          naive_diff=r(na - nb, 1) if na is not None and nb is not None else None))
    ranked = sorted(books, key=lambda b: -(adjusted[b]["mean"] or -1e9))
    naive_ranked = sorted(books, key=lambda b: -(naive[b]["mean"] or -1e9))
    best, second = ranked[0], ranked[1] if len(ranked) > 1 else None
    best_sig = all(
        (p["p"] is not None and p["p"] < 0.05 and ((p["a"] == best and p["diff"] > 0) or (p["b"] == best and p["diff"] < 0)))
        for p in pairs if best in (p["a"], p["b"]))
    flips = [p for p in pairs if p["naive_diff"] is not None and p["diff"] is not None
             and np.sign(p["naive_diff"]) != np.sign(p["diff"]) and abs(p["naive_diff"]) >= 1.0]
    return dict(naive=naive, adjusted=adjusted, pairs=pairs, ranking=ranked, naive_ranking=naive_ranked,
                best=best, best_significant=bool(best_sig and len(books) > 1),
                simpson=bool(naive_ranked[0] != ranked[0] or flips), flips=flips,
                n_students=int(m.n), n_schools=int(m.n_clusters), r2=r(m.res.rsquared, 3),
                controls=[c for c in m.X.columns if not c.startswith("tb[") and c != "const"])


def compare(ds, subject_id: str) -> dict:
    apply_exclusions(ds)

    def build():
        topics = ds.subject_topics(subject_id)
        books = [b for b in ds.textbooks.loc[ds.textbooks["subject_id"] == subject_id, "textbook_id"]
                 if b in set(ds.classes.loc[ds.classes["subject_id"] == subject_id, "textbook_id"])]
        ref = books[0]
        meta = ds.textbooks.set_index("textbook_id")
        full = _student_frame(ds, subject_id)

        # composition: who uses which book (explains confounding)
        composition = []
        for b in books:
            sub = full[full["textbook_id"] == b]
            composition.append(dict(
                textbook_id=b, title=meta.loc[b, "title"], publisher=meta.loc[b, "publisher"] if "publisher" in meta else "",
                n_schools=int(sub["school_id"].nunique()), n_students=int(len(sub)),
                rural_share=pp((sub["locality"] == "rural").mean()), kz_share=pp((sub["language"] == "kz").mean()),
                baseline_mean=r(sub["baseline"].mean(), 1), low_power=bool(sub["school_id"].nunique() < 6)))

        sections = [(OVERALL, "Весь предмет", "Барлық пән", list(topics["topic_id"]))]
        for sec, g in topics.groupby("section", sort=False):
            sections.append((sec, sec, g["section_kz"].iloc[0], list(g["topic_id"])))
        results = []
        for key, name, name_kz, tids in sections:
            df = _student_frame(ds, subject_id, tids)
            res = _fit_section(df, books, ref)
            res.update(section=key, name=name, name_kz=name_kz, topics=tids)
            results.append(res)

        # topic-level heatmap (adjusted effect vs reference, pp)
        heat = []
        for _, t in topics.iterrows():
            df = _student_frame(ds, subject_id, [t["topic_id"]])
            m = ClusterOLS(df["y"], _design(df, books, ref), df["school_id"])
            base = (m.X.drop(columns=[c for c in m.X.columns if c.startswith("tb[")]) @
                    m.params.drop([c for c in m.params.index if c.startswith("tb[")])).mean()
            row = dict(topic_id=t["topic_id"], name=t["name"], name_kz=t["name_kz"], section=t["section"], cells={})
            for b in books:
                c = m.contrast({f"tb[{b}]": 1.0}) if b != ref else dict(est=0.0, p=np.nan)
                row["cells"][b] = dict(adjusted=pp(base + c["est"]), effect=pp(c["est"]), p=r(c["p"], 4))
            best = max(books, key=lambda b: row["cells"][b]["adjusted"] or -1)
            row["best"] = best
            heat.append(row)

        # heterogeneity: does a book work differently in kz/ru or rural/urban schools?
        heterogeneity = []
        for var, label in [("lang_kz", "language"), ("rural", "locality")]:
            for key, name, name_kz, tids in sections[:1]:
                df = _student_frame(ds, subject_id, tids)
                X = _design(df, books, ref, interactions=(var,))
                if var not in X:
                    continue
                m = ClusterOLS(df["y"], X, df["school_id"])
                p = m.wald([c for c in m.params.index if c.endswith(f":{var}")])
                groups = {}
                col = "language" if var == "lang_kz" else "locality"
                for gval in sorted(df[col].dropna().unique()):
                    sub = df[df[col] == gval]
                    if sub["school_id"].nunique() < 4:
                        continue
                    sm_ = ClusterOLS(sub["y"], _design(sub, books, ref), sub["school_id"])
                    base = (sm_.X.drop(columns=[c for c in sm_.X.columns if c.startswith("tb[")]) @
                            sm_.params.drop([c for c in sm_.params.index if c.startswith("tb[")])).mean()
                    groups[gval] = {}
                    for b in books:
                        c = sm_.contrast({f"tb[{b}]": 1.0}) if b != ref else dict(est=0.0, lo=np.nan, hi=np.nan)
                        nsch = int(sub.loc[sub["textbook_id"] == b, "school_id"].nunique())
                        groups[gval][b] = dict(adjusted=pp(base + c["est"]) if nsch else None,
                                               effect=pp(c["est"]) if nsch else None, n_schools=nsch)
                heterogeneity.append(dict(dimension=label, p_interaction=r(p, 4),
                                          significance=significance_label(p), groups=groups))

        # profile-based recommendation: which book fits which school profile
        df = _student_frame(ds, subject_id)
        X = _design(df, books, ref, interactions=("lang_kz", "rural"))
        m = ClusterOLS(df["y"], X, df["school_id"])
        profiles = []
        for loc in sorted(df["locality"].unique()):
            for lang in sorted(df["language"].unique()):
                n_sch = int(df[(df["locality"] == loc) & (df["language"] == lang)]["school_id"].nunique())
                if n_sch == 0:
                    continue
                preds = {}
                for b in books:
                    w = {"const": 1.0}
                    if "rural" in m.params.index:
                        w["rural"] = float(loc == "rural")
                    if "lang_kz" in m.params.index:
                        w["lang_kz"] = float(lang == "kz")
                    if b != ref:
                        w[f"tb[{b}]"] = 1.0
                        w[f"tb[{b}]:rural"] = float(loc == "rural")
                        w[f"tb[{b}]:lang_kz"] = float(lang == "kz")
                    preds[b] = m.contrast(w)
                best = max(books, key=lambda b: preds[b]["est"])
                others = [b for b in books if b != best]
                margin = None
                if others:
                    runner = max(others, key=lambda b: preds[b]["est"])
                    w = {}
                    if best != ref:
                        w[f"tb[{best}]"] = 1.0
                        w[f"tb[{best}]:rural"] = float(loc == "rural")
                        w[f"tb[{best}]:lang_kz"] = float(lang == "kz")
                    if runner != ref:
                        for k, v in {f"tb[{runner}]": 1.0, f"tb[{runner}]:rural": float(loc == "rural"),
                                     f"tb[{runner}]:lang_kz": float(lang == "kz")}.items():
                            w[k] = w.get(k, 0) - v
                    c = m.contrast(w)
                    margin = dict(runner_up=runner, diff=pp(c["est"]), ci=[pp(c["lo"]), pp(c["hi"])], p=r(c["p"], 4))
                profiles.append(dict(locality=loc, language=lang, n_schools=n_sch, best=best, margin=margin,
                                     predicted={b: pp(preds[b]["est"]) for b in books}))

        return dict(subject_id=subject_id, textbooks=books, reference=ref, composition=composition,
                    sections=results, heatmap=heat, heterogeneity=heterogeneity, profiles=profiles)

    return ds.cached(("textbooks", subject_id), build)
