"""Pilot planner: how to PROVE that a recommended change works before rolling it out region-wide.

Design: matched-pair cluster-randomised pilot. Schools are paired by textbook, locality, language and entry
level; within each pair a coin decides which school applies the change (e.g. +2 hours on a topic) and which
keeps the old plan. Sample size uses the observed intra-class correlation of school results and the variance
explained by the entry diagnostic (ANCOVA), so the estimate is realistic for THIS region.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd
from scipy import stats

from .common import r
from .hours import optimize
from .items import apply_exclusions


def _residualize(s: pd.DataFrame) -> pd.DataFrame:
    """Remove what pair-matching and the analysis model will account for anyway: entry level of the student and
    of the school, textbook, locality and language. What is left is the noise the pilot has to beat."""
    base = s["baseline_score"].fillna(s["baseline_score"].mean()) if s["baseline_score"].notna().mean() > 0.5 else None
    X = pd.DataFrame(index=s.index)
    if base is not None:
        X["b"] = base
        X["sb"] = base.groupby(s["school_id"]).transform("mean")
    for col in ("textbook_id", "locality", "language"):
        if s[col].nunique() > 1:
            X = X.join(pd.get_dummies(s[col], prefix=col, drop_first=True, dtype=float))
    X.insert(0, "const", 1.0)
    beta, *_ = np.linalg.lstsq(X.to_numpy(float), s["pct"].to_numpy(float), rcond=None)
    out = s.copy()
    out["pct"] = s["pct"].to_numpy(float) - X.to_numpy(float) @ beta
    return out


def _variance_components(s: pd.DataFrame):
    """ICC of school means (one-way ANOVA estimator) on residualized scores, and R^2 of the adjustment."""
    raw_var = float(s["pct"].var())
    s = _residualize(s)
    g = s.groupby("school_id")["pct"]
    k = g.ngroups
    n_i = g.size()
    n_bar = (n_i.sum() - (n_i ** 2).sum() / n_i.sum()) / max(k - 1, 1)
    msb = (n_i * (g.mean() - s["pct"].mean()) ** 2).sum() / max(k - 1, 1)
    msw = ((s["pct"] - g.transform("mean")) ** 2).sum() / max(len(s) - k, 1)
    s2b = max((msb - msw) / n_bar, 0.0)
    icc = s2b / (s2b + msw) if s2b + msw > 0 else 0.0
    res_var = float(s["pct"].var())
    r2 = max(0.0, 1 - res_var / raw_var) if raw_var > 0 else 0.0
    return float(icc), res_var, r2, float(n_i.mean())


def plan(ds, subject_id: str, topic_id: str | None = None, effect_pp: float | None = None,
         power: float = 0.8, alpha: float = 0.05, seed: int = 2026) -> dict:
    apply_exclusions(ds)
    opt = optimize(ds, subject_id)
    candidates = sorted([x for x in opt["topics"] if x["delta"] > 0], key=lambda x: -x["predicted_change"])
    if topic_id is None:
        topic_id = candidates[0]["topic_id"] if candidates else opt["topics"][0]["topic_id"]
    rec = next(x for x in opt["topics"] if x["topic_id"] == topic_id)
    if effect_pp is None:
        effect_pp = max(rec["predicted_change"], 0.5)
    delta = effect_pp / 100

    s = ds.topic_scores()
    s = s[(s["subject_id"] == subject_id) & (s["topic_id"] == topic_id)]
    icc, var, r2, m = _variance_components(s)
    var_adj = var  # already residualized
    deff = 1 + (m - 1) * icc
    za, zb = stats.norm.ppf(1 - alpha / 2), stats.norm.ppf(power)
    per_arm = math.ceil(2 * (za + zb) ** 2 * var_adj * deff / (delta ** 2 * m))
    per_arm = max(per_arm, 3)

    def power_at(n_per_arm):
        se = math.sqrt(2 * var_adj * deff / (n_per_arm * m))
        return float(stats.norm.cdf(delta / se - za))

    n_total = int(s["school_id"].nunique())

    # matched pairs among schools that need it most (low mastery of the topic first)
    sch = (s.groupby("school_id").agg(mastery=("pct", "mean"), n=("pct", "size"), baseline=("baseline_score", "mean"))
           .join(ds.context[ds.context["subject_id"] == subject_id].drop_duplicates("school_id")
                 .set_index("school_id")[["textbook_id", "locality", "language", "district"]], how="left"))
    sch = sch[sch["n"] >= 8]
    names = ds.schools.set_index("school_id")["name"]
    rng = np.random.default_rng(seed)
    pairs = []
    for _, g in sch.groupby(["textbook_id", "locality", "language"]):
        g = g.sort_values("baseline")
        idx = list(g.index)
        for i in range(0, len(idx) - 1, 2):
            a, b = idx[i], idx[i + 1]
            if rng.random() < 0.5:
                a, b = b, a
            pairs.append(dict(pilot=a, control=b, need=float(1 - (g.loc[a, "mastery"] + g.loc[b, "mastery"]) / 2)))
    pairs.sort(key=lambda p: -p["need"])
    chosen = pairs[:per_arm]
    n_available = 2 * len(pairs)  # schools that have a comparable partner
    curve = [dict(schools=2 * n, power=r(power_at(n), 3)) for n in range(3, max(per_arm * 2, 12) + 1, max(1, per_arm // 8))]
    mde_all = (za + zb) * math.sqrt(2 * var_adj * deff / (max(len(pairs), 1) * m)) * 100

    def card(sid):
        x = sch.loc[sid]
        return dict(school_id=sid, name=names.get(sid, sid), district=x["district"], textbook_id=x["textbook_id"],
                    locality=x["locality"], language=x["language"], students=int(x["n"]),
                    mastery=r(x["mastery"] * 100, 1), baseline=r(x["baseline"], 1))

    return dict(
        subject_id=subject_id, topic_id=topic_id, topic_name=rec["name"], topic_name_kz=rec["name_kz"],
        change=dict(planned=rec["planned"], recommended=rec["recommended"], delta=rec["delta"]),
        candidates=[dict(topic_id=x["topic_id"], name=x["name"], name_kz=x["name_kz"], delta=x["delta"],
                         predicted_change=x["predicted_change"]) for x in candidates],
        effect_pp=r(effect_pp, 2), power=power, alpha=alpha,
        icc=r(icc, 3), r2_baseline=r(r2, 3), students_per_school=r(m, 1), design_effect=r(deff, 2),
        schools_per_arm=per_arm, schools_total=2 * per_arm, schools_available=n_available, schools_in_region=n_total,
        feasible=bool(per_arm <= len(pairs)),
        mde_all_schools=r(mde_all, 2), power_curve=curve,
        pairs=[dict(pilot=card(p["pilot"]), control=card(p["control"])) for p in chosen],
    )
