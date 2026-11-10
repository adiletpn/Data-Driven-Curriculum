"""Evidence-based allocation of teaching hours.

1. Classes naturally deviate from the plan (some spend 5 h on a topic, some
   9 h). Per topic we fit, across classes,
        class_mastery = a + beta * ln(hours) + controls(baseline, textbook, language, locality)
   — a diminishing-returns curve: every extra hour helps less.
2. Noisy topic slopes are shrunk towards the average slope (empirical Bayes)
   and negative slopes are floored at zero (more teaching never hurts).
3. With a fixed total number of hours we greedily give each next hour to the
   topic with the largest weighted marginal gain. For concave curves greedy
   allocation is optimal. Changes are bounded (±flex of the plan) so we never
   extrapolate far outside what was observed in real classes.
4. Uncertainty: the whole pipeline is bootstrapped over schools.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

from .common import pp, r, zscore
from .items import apply_exclusions
from .prerequisites import analyze as prereq_analyze
from .topics import topic_table

N_BOOT = 200


def _class_frame(ds, subject_id: str, filters: dict | None) -> pd.DataFrame:
    s = ds.topic_scores()
    s = s[s["subject_id"] == subject_id]
    c = (s.groupby(["class_id", "topic_id"])
         .agg(y=("pct", "mean"), n=("pct", "size"), hours=("hours", "first"), school_id=("school_id", "first"),
              textbook_id=("textbook_id", "first"), language=("language", "first"),
              locality=("locality", "first"), baseline=("baseline_score", "mean"))
         .reset_index())
    for k, v in (filters or {}).items():
        if v and k in c:
            c = c[c[k] == v]
    c = c[c["hours"] > 0]
    c["lnh"] = np.log(c["hours"].astype(float))
    return c


def _controls(df: pd.DataFrame) -> pd.DataFrame:
    X = pd.DataFrame(index=df.index)
    if df["baseline"].notna().mean() > 0.5:
        X["baseline"] = zscore(df["baseline"].fillna(df["baseline"].mean()))
    for b in sorted(df["textbook_id"].unique())[1:]:
        X[f"tb_{b}"] = (df["textbook_id"] == b).astype(float)
    if df["language"].nunique() > 1:
        X["kz"] = (df["language"] == "kz").astype(float)
    if df["locality"].nunique() > 1:
        X["rural"] = (df["locality"] == "rural").astype(float)
    return X.loc[:, X.std() > 0] if len(X.columns) else X


def _fit_topic(df: pd.DataFrame):
    """Weighted LS of class mastery on ln(hours) + controls. Returns (beta, se, intercept_at_mean, resid adj)."""
    X = _controls(df)
    X.insert(0, "lnh", df["lnh"])
    X.insert(0, "const", 1.0)
    w = df["n"].to_numpy(float)
    Xm, y = X.to_numpy(float), df["y"].to_numpy(float)
    sw = np.sqrt(w)
    beta, *_ = np.linalg.lstsq(Xm * sw[:, None], y * sw, rcond=None)
    resid = y - Xm @ beta
    dof = max(len(y) - Xm.shape[1], 1)
    sigma2 = float(np.sum(w * resid ** 2) / dof / np.mean(w))
    try:
        cov = sigma2 * np.linalg.inv((Xm * w[:, None]).T @ Xm / np.mean(w))
        se = float(np.sqrt(max(cov[1, 1], 0)))
    except np.linalg.LinAlgError:
        se = np.nan
    # outcome adjusted for controls (for the scatter on the curve chart)
    ctrl = Xm[:, 2:] @ beta[2:] if Xm.shape[1] > 2 else 0
    y_adj = y - ctrl + (np.average(Xm[:, 2:], axis=0, weights=w) @ beta[2:] if Xm.shape[1] > 2 else 0)
    return float(beta[1]), se, y_adj


def _estimate(c: pd.DataFrame, topics: pd.DataFrame, prior: dict | None = None):
    """Per-topic slope (shrunk) and level at planned hours."""
    est = {}
    for _, t in topics.iterrows():
        d = c[c["topic_id"] == t["topic_id"]]
        if len(d) < 6 or d["lnh"].std() == 0:
            est[t["topic_id"]] = dict(beta_raw=np.nan, se=np.nan, n_classes=len(d), level=d["y"].mean() if len(d) else np.nan,
                                      y_adj=None, d=d)
            continue
        b, se, y_adj = _fit_topic(d)
        w = d["n"].to_numpy(float)
        level = float(np.average(y_adj, weights=w) + b * (math.log(t["planned_hours"]) - np.average(d["lnh"], weights=w)))
        est[t["topic_id"]] = dict(beta_raw=b, se=se, n_classes=len(d), level=level, y_adj=y_adj, d=d)
    # Empirical Bayes with a covariate-informed prior: the expected slope depends on how far the topic is
    # from mastery (topics near the ceiling cannot gain much). centre_t = a + b * (1 - level_t)
    ok = [(k, v) for k, v in est.items() if np.isfinite(v["beta_raw"]) and np.isfinite(v["se"])]
    centres = {}
    if len(ok) >= 4:
        bs = np.array([v["beta_raw"] for _, v in ok])
        ses = np.array([v["se"] for _, v in ok])
        gap = np.array([1 - v["level"] for _, v in ok])
        w = 1 / np.maximum(ses, 1e-4) ** 2
        Z = np.column_stack([np.ones(len(bs)), gap])
        coef = np.linalg.lstsq(Z * np.sqrt(w)[:, None], bs * np.sqrt(w), rcond=None)[0]
        fitted = Z @ coef
        tau2 = max(float(np.var(bs - fitted) - np.mean(ses ** 2)), 1e-4)
        for (k, v), f in zip(ok, fitted):
            centres[k] = float(f)
        mean_b = float(np.average(bs, weights=w))
    elif ok:
        bs = np.array([v["beta_raw"] for _, v in ok])
        mean_b, tau2 = float(bs.mean()), 1e-4
    else:
        mean_b, tau2 = 0.0, 1e-4
    for tid, v in est.items():
        if prior and tid in prior and np.isfinite(prior[tid]):
            centre, tau2_ = prior[tid], max(tau2 / 2, 1e-4)  # subgroup: shrink towards the full-sample slope
        else:
            centre, tau2_ = centres.get(tid, mean_b), tau2
        if np.isfinite(v["beta_raw"]) and np.isfinite(v["se"]):
            k = tau2_ / (tau2_ + v["se"] ** 2)
            v["beta"] = max(k * v["beta_raw"] + (1 - k) * centre, 0.0)
            v["shrinkage"] = 1 - k
        else:
            v["beta"] = max(centre, 0.0)
            v["shrinkage"] = 1.0
    return est


def _mastery(level, beta, plan, h):
    return float(np.clip(level + beta * (math.log(max(h, 0.5)) - math.log(plan)), 0.01, 0.995))


def _allocate(levels, betas, plans, weights, lo, hi, total):
    """Greedy optimal allocation for concave curves (integer hours)."""
    alloc = dict(lo)
    remaining = int(total - sum(lo.values()))
    if remaining < 0:
        return alloc
    for _ in range(remaining):
        best, best_gain = None, -1.0
        for t in alloc:
            if alloc[t] >= hi[t]:
                continue
            g = weights[t] * (_mastery(levels[t], betas[t], plans[t], alloc[t] + 1) -
                              _mastery(levels[t], betas[t], plans[t], alloc[t]))
            if g > best_gain:
                best, best_gain = t, g
        if best is None:
            break
        alloc[best] += 1
    return alloc


def optimize(ds, subject_id: str, mode: str = "balanced", flex: float = 0.3, total: int | None = None,
             filters: dict | None = None, custom: dict | None = None) -> dict:
    apply_exclusions(ds)
    filters = {k: v for k, v in (filters or {}).items() if v}
    topics = ds.subject_topics(subject_id)
    plans = {t: float(h) for t, h in zip(topics["topic_id"], topics["planned_hours"])}

    key_fit = ("hours_fit", subject_id, tuple(sorted(filters.items())))

    def fit():
        c_all = _class_frame(ds, subject_id, None)
        full = ds.cached(("hours_prior", subject_id), lambda: _estimate(c_all, topics)) if filters else None
        c = _class_frame(ds, subject_id, filters)
        prior = {k: v["beta"] for k, v in full.items()} if full else None
        est = _estimate(c, topics, prior)
        # bootstrap over schools
        rng = np.random.default_rng(7)
        schools = c["school_id"].unique()
        boot = []
        groups = {s: g for s, g in c.groupby("school_id")}
        for _ in range(N_BOOT):
            pick = rng.choice(schools, len(schools), replace=True)
            cb = pd.concat([groups[s] for s in pick], ignore_index=True)
            eb = _estimate(cb, topics, prior)
            boot.append({t: (v["beta"], v["level"]) for t, v in eb.items()})
        return est, boot, c

    est, boot, c = ds.cached(key_fit, fit)

    tt = {x["topic_id"]: x for x in topic_table(ds, subject_id, filters or None)}
    pre = prereq_analyze(ds, subject_id)
    influence = {n["topic_id"]: n["influence"] or 0 for n in pre["nodes"]}

    tids = [t for t in topics["topic_id"] if t in est and np.isfinite(est[t]["level"])]
    levels = {t: est[t]["level"] for t in tids}
    betas = {t: est[t]["beta"] for t in tids}
    if mode == "foundation":
        weights = {t: 1 + 2.5 * influence.get(t, 0) for t in tids}
    elif mode == "equity":
        gaps = {t: max(100 - (tt.get(t, {}).get("mastered_share") or 50), 5) for t in tids}
        mg = np.mean(list(gaps.values()))
        weights = {t: gaps[t] / mg for t in tids}
    else:
        mode = "balanced"
        weights = {t: 1.0 for t in tids}
    lo = {t: max(1, math.ceil(plans[t] * (1 - flex))) for t in tids}
    hi = {t: max(lo[t], math.floor(plans[t] * (1 + flex))) for t in tids}
    plan_total = int(round(sum(plans[t] for t in tids)))
    total = int(total or plan_total)
    if custom:
        rec = {t: int(custom.get(t, plans[t])) for t in tids}
    else:
        rec = _allocate(levels, betas, plans, weights, lo, hi, total)

    def avg_gain(lv, bt, alloc):
        return float(np.mean([_mastery(lv[t], bt[t], plans[t], alloc[t]) - _mastery(lv[t], bt[t], plans[t], plans[t])
                              for t in tids]))

    gain = avg_gain(levels, betas, rec)
    boot_gains = [avg_gain({t: b[t][1] for t in tids}, {t: b[t][0] for t in tids}, rec) for b in boot
                  if all(np.isfinite(b[t][1]) for t in tids)]
    g_lo, g_hi = (np.percentile(boot_gains, [2.5, 97.5]) if boot_gains else (np.nan, np.nan))
    p_positive = float(np.mean(np.array(boot_gains) > 0)) if boot_gains else np.nan

    # "worth N extra hours": how many additional hours on top of the plan give the same gain
    equiv = None
    if gain > 0 and not custom:
        for extra in range(1, int(plan_total * 0.5)):
            alt = _allocate(levels, betas, plans, {t: 1.0 for t in tids},
                            {t: int(plans[t]) for t in tids}, {t: int(plans[t] * 3) for t in tids}, plan_total + extra)
            if avg_gain(levels, betas, alt) >= gain:
                equiv = extra
                break

    # students expected to newly master topics (rough: change in mastery share ~ change in mean)
    rows = []
    for t in tids:
        e = est[t]
        top = tt.get(t, {})
        m_plan = _mastery(levels[t], betas[t], plans[t], plans[t])
        m_rec = _mastery(levels[t], betas[t], plans[t], rec[t])
        bb = np.array([b[t][0] for b in boot])
        marginal = betas[t] / plans[t]
        ci_marg = (np.percentile(bb, [2.5, 97.5]) / plans[t]) if len(bb) else (np.nan, np.nan)
        delta = rec[t] - plans[t]
        reasons = []
        if marginal * 100 < 0.35 and (top.get("mean_pct") or 0) >= 78:
            reasons.append("saturated")
        if marginal * 100 >= 1.6:
            reasons.append("high_return")
        if top.get("status") in ("critical", "risk"):
            reasons.append("weak_topic")
        if influence.get(t, 0) >= 0.3:
            reasons.append("foundation")
        if np.isfinite(e["se"]) and e["shrinkage"] > 0.6:
            reasons.append("uncertain")
        p_pos = float(np.mean(bb > 1e-6)) if len(bb) else np.nan
        hs = sorted(set(list(range(max(1, lo[t] - 1), hi[t] + 2))))
        curve = [dict(h=h, m=pp(_mastery(levels[t], betas[t], plans[t], h)),
                      lo=pp(np.clip(np.percentile([_mastery(b[t][1], b[t][0], plans[t], h) for b in boot], 5), 0, 1)),
                      hi=pp(np.clip(np.percentile([_mastery(b[t][1], b[t][0], plans[t], h) for b in boot], 95), 0, 1)))
                 for h in hs]
        scatter = []
        if e["y_adj"] is not None:
            d = e["d"]
            scatter = [dict(h=int(h), m=pp(y)) for h, y in zip(d["hours"], e["y_adj"])]
        rows.append(dict(
            topic_id=t, name=top.get("name", t), name_kz=top.get("name_kz", t), section=top.get("section"),
            status=top.get("status"), mean_pct=top.get("mean_pct"), mastered_share=top.get("mastered_share"),
            planned=int(plans[t]), recommended=int(rec[t]), delta=int(delta), lo=lo[t], hi=hi[t],
            marginal_pp_per_hour=r(marginal * 100, 2), marginal_ci=[r(ci_marg[0] * 100, 2), r(ci_marg[1] * 100, 2)],
            prob_hours_help=r(p_pos, 2), beta_raw=r(e["beta_raw"], 4), shrinkage=r(e["shrinkage"], 2),
            n_classes=int(e["n_classes"]), predicted_plan=pp(m_plan), predicted_rec=pp(m_rec),
            predicted_change=r((m_rec - m_plan) * 100, 2), weight=r(weights[t], 2), reasons=reasons,
            hours_range_observed=[int(e["d"]["hours"].min()), int(e["d"]["hours"].max())] if len(e["d"]) else None,
            curve=curve, scatter=scatter))

    moves = sorted([x for x in rows if x["delta"] != 0], key=lambda x: -x["delta"])
    return dict(
        subject_id=subject_id, mode=mode, flex=flex, filters=filters, total_hours=total, plan_total=plan_total,
        n_classes=int(c["class_id"].nunique()), n_schools=int(c["school_id"].nunique()),
        expected_gain_pp=r(gain * 100, 2), gain_ci=[r(g_lo * 100, 2), r(g_hi * 100, 2)],
        prob_improvement=r(p_positive, 3), equivalent_extra_hours=equiv,
        hours_moved=int(sum(max(x["delta"], 0) for x in rows)),
        topics=rows, increases=[x["topic_id"] for x in moves if x["delta"] > 0],
        decreases=[x["topic_id"] for x in moves if x["delta"] < 0], custom=bool(custom))
