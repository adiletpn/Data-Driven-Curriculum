"""Early warning: which students will most likely fail a topic BEFORE it is taught.

For every topic with prerequisites we fit a logistic model on the whole region:
    P(not mastering T) ~ results on its prerequisites + entry diagnostic
Quality is measured honestly out-of-sample: the model is trained on half of the schools and evaluated (AUC)
on the other half. Students are shown by anonymous ID only.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
import statsmodels.api as sm

from .common import r
from .items import apply_exclusions


def _auc(y, p) -> float:
    y, p = np.asarray(y), np.asarray(p)
    pos, neg = p[y == 1], p[y == 0]
    if len(pos) == 0 or len(neg) == 0:
        return float("nan")
    ranks = pd.Series(np.concatenate([pos, neg])).rank().to_numpy()
    return float((ranks[: len(pos)].sum() - len(pos) * (len(pos) + 1) / 2) / (len(pos) * len(neg)))


def _features(wide: pd.DataFrame, base: pd.Series, prereqs: list[str]) -> pd.DataFrame:
    X = wide[prereqs].copy()
    X["baseline"] = (base - base.mean()) / (base.std() or 1)
    return sm.add_constant(X, has_constant="add")


def models(ds, subject_id: str) -> dict:
    apply_exclusions(ds)

    def build():
        s = ds.topic_scores()
        s = s[s["subject_id"] == subject_id]
        wide = s.pivot_table(index="student_id", columns="topic_id", values="pct")
        meta = s.groupby("student_id").agg(school_id=("school_id", "first"), class_id=("class_id", "first"),
                                           baseline=("baseline_score", "first"))
        base = meta["baseline"].fillna(meta["baseline"].mean()) if meta["baseline"].notna().any() else meta["baseline"].fillna(0)
        topics = ds.subject_topics(subject_id)
        schools = np.array(sorted(meta["school_id"].unique()))
        rng = np.random.default_rng(1)
        train_sch = set(rng.choice(schools, len(schools) // 2, replace=False))
        out = {}
        for _, t in topics.iterrows():
            pre = [p for p in t["prereq_list"] if p in wide.columns]
            if not pre or t["topic_id"] not in wide.columns:
                continue
            d = wide[pre + [t["topic_id"]]].dropna()
            y = (d[t["topic_id"]] < 0.6).astype(float)
            X = _features(d, base.loc[d.index], pre)
            tr = meta.loc[d.index, "school_id"].isin(train_sch).to_numpy()
            try:
                m_tr = sm.Logit(y[tr], X[tr]).fit(disp=0)
                auc = _auc(y[~tr], m_tr.predict(X[~tr]))
                m = sm.Logit(y, X).fit(disp=0)
            except Exception:
                continue
            out[t["topic_id"]] = dict(model=m, prereqs=pre, auc=auc, base_rate=float(y.mean()))
        return dict(models=out, wide=wide, meta=meta, base=base)

    return ds.cached(("risk_models", subject_id), build)


def school_risk(ds, subject_id: str, school_id: str, threshold: float = 0.6, limit: int = 60) -> dict:
    M = models(ds, subject_id)
    wide, meta, base = M["wide"], M["meta"], M["base"]
    ids = meta.index[meta["school_id"] == school_id]
    topics = ds.subject_topics(subject_id).set_index("topic_id")
    rows = []
    for tid, mm in M["models"].items():
        d = wide.loc[ids, mm["prereqs"]].dropna()
        if d.empty:
            continue
        p = mm["model"].predict(_features(d, base.loc[d.index], mm["prereqs"]))
        for sid, risk in p.items():
            if risk < threshold:
                continue
            weakest = min(mm["prereqs"], key=lambda q: wide.loc[sid, q])
            rows.append(dict(student_id=sid, class_id=meta.loc[sid, "class_id"], topic_id=tid,
                             topic_name=topics.loc[tid, "name"], topic_name_kz=topics.loc[tid, "name_kz"],
                             order=int(topics.loc[tid, "order"]), risk=r(risk * 100, 0),
                             cause_id=weakest, cause_name=topics.loc[weakest, "name"],
                             cause_name_kz=topics.loc[weakest, "name_kz"], cause_pct=r(wide.loc[sid, weakest] * 100, 0)))
    df = pd.DataFrame(rows)
    by_student = []
    if not df.empty:
        for sid, g in df.sort_values(["order"]).groupby("student_id", sort=False):
            g = g.sort_values("risk", ascending=False)
            by_student.append(dict(student_id=sid, class_id=g["class_id"].iloc[0], max_risk=float(g["risk"].max()),
                                   n_topics=int(len(g)), topics=g.head(3).to_dict("records")))
        by_student.sort(key=lambda x: (-x["n_topics"], -x["max_risk"]))
    causes = (df.groupby(["cause_id", "cause_name", "cause_name_kz"])["student_id"].nunique().sort_values(ascending=False)
              .reset_index().rename(columns={"student_id": "students"}).head(5).to_dict("records") if not df.empty else [])
    aucs = [m["auc"] for m in M["models"].values() if np.isfinite(m["auc"])]
    return dict(school_id=school_id, subject_id=subject_id, n_students=int(len(ids)),
                n_at_risk=len(by_student), threshold=threshold, students=by_student[:limit],
                top_causes=causes, model_auc=r(float(np.mean(aucs)), 3) if aucs else None,
                n_models=len(M["models"]))
