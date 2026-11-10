"""Proof that the methods work: compare analytics output with the planted ground truth.

Only available for the synthetic dataset (where the truth is known).
"""
from __future__ import annotations

import numpy as np
from scipy import stats

from .common import r
from .hours import optimize
from .items import audit
from .prerequisites import analyze as prereq
from .textbooks import compare
from .topics import topic_table


def _corr(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    m = np.isfinite(a) & np.isfinite(b)
    if m.sum() < 3:
        return None
    return r(np.corrcoef(a[m], b[m])[0, 1], 3)


def _spearman(a, b):
    if len(a) < 3:
        return None
    return r(stats.spearmanr(a, b).statistic, 3)


def run(ds) -> dict | None:
    gt = ds.ground_truth
    if not gt:
        return None

    def build():
        subjects = list(ds.subjects["subject_id"])
        out = dict(textbooks=[], hours=[], items={}, dependencies=[], topics=[], language=[], summary={})

        # ---- textbooks: adjusted vs naive vs truth ----
        true_tb = {(x["subject_id"], x["section"], x["textbook_id"]): x["effect_pp"] for x in gt["textbook_effects"]}
        for sj in subjects:
            c = compare(ds, sj)
            ref = c["reference"]
            for sec in c["sections"][1:]:
                for b in c["textbooks"]:
                    if b == ref or (sj, sec["section"], b) not in true_tb:
                        continue
                    adj = sec["adjusted"][b]
                    naive = sec["naive"][b]["mean"] - sec["naive"][ref]["mean"]
                    t = true_tb[(sj, sec["section"], b)]
                    out["textbooks"].append(dict(
                        subject_id=sj, section=sec["section"], textbook_id=b, reference=ref, true=t,
                        adjusted=adj["effect_vs_ref"], ci=adj["ci"], naive=r(naive, 1),
                        covered=bool(adj["ci"][0] is not None and adj["ci"][0] <= t <= adj["ci"][1]),
                        sign_ok=bool(np.sign(adj["effect_vs_ref"]) == np.sign(t) or abs(t) < 1),
                        naive_sign_ok=bool(np.sign(naive) == np.sign(t) or abs(t) < 1)))
            for h in c["heterogeneity"]:
                if h["dimension"] == "language":
                    planted = [x for x in gt.get("language_interaction", []) if x["subject_id"] == sj]
                    out["language"].append(dict(subject_id=sj, planted=bool(planted), p=h["p_interaction"],
                                                detected=bool(h["p_interaction"] is not None and h["p_interaction"] < 0.05)))
        tb = out["textbooks"]
        mae_adj = np.mean([abs(x["adjusted"] - x["true"]) for x in tb]) if tb else None
        mae_naive = np.mean([abs(x["naive"] - x["true"]) for x in tb]) if tb else None

        # ---- hours: estimated marginal return vs true ----
        true_h = {x["topic_id"]: x["pp_per_hour"] for x in gt["hours_marginal"]}
        policy = []
        for sj in subjects:
            o = optimize(ds, sj)
            for x in o["topics"]:
                out["hours"].append(dict(subject_id=sj, topic_id=x["topic_id"], name=x["name"],
                                         true=true_h.get(x["topic_id"]), estimated=x["marginal_pp_per_hour"],
                                         ci=x["marginal_ci"], delta=x["delta"]))
            # realised TRUE gain (first-order, true marginal returns) of our plan vs a common heuristic
            # ("move hours from the strongest to the weakest topics") and vs the oracle, same budget & bounds
            rows = {x["topic_id"]: x for x in o["topics"]}
            n = len(rows)
            moved = o["hours_moved"]
            ours = sum(x["delta"] * true_h[t] for t, x in rows.items()) / n

            def simulate(score):
                alloc = {t: 0 for t in rows}
                for _ in range(moved):
                    up = max((t for t in rows if rows[t]["planned"] + alloc[t] < rows[t]["hi"]), key=score, default=None)
                    down = min((t for t in rows if rows[t]["planned"] + alloc[t] > rows[t]["lo"] and t != up),
                               key=score, default=None)
                    if up is None or down is None:
                        break
                    alloc[up] += 1
                    alloc[down] -= 1
                return sum(d * true_h[t] for t, d in alloc.items()) / n

            mastery = {t: rows[t]["mean_pct"] for t in rows}
            heuristic = simulate(lambda t: -mastery[t])
            oracle = simulate(lambda t: true_h[t])
            policy.append(dict(subject_id=sj, hours_moved=moved, ours=r(ours, 3), heuristic=r(heuristic, 3),
                               oracle=r(oracle, 3), efficiency=r(ours / oracle, 2) if oracle else None))
        hh = out["hours"]

        # ---- test items ----
        truth_bad = {x["item_id"]: x["defect"] for x in gt["defective_items"]}
        flagged = {x["item_id"] for x in audit(ds)["items"] if x["critical"]}
        tp = len(flagged & set(truth_bad))
        out["items"] = dict(planted=sorted(truth_bad), flagged=sorted(flagged), true_positive=tp,
                            precision=r(tp / len(flagged), 2) if flagged else None,
                            recall=r(tp / len(truth_bad), 2) if truth_bad else None,
                            wrong_key_found=sorted(i for i, d in truth_bad.items() if d == "wrong_key" and i in flagged))

        # ---- dependencies ----
        true_dep = {(x["prereq_id"], x["topic_id"]): x["rho"] for x in gt["dependencies"]}
        for sj in subjects:
            for e in prereq(ds, sj)["edges"]:
                out["dependencies"].append(dict(subject_id=sj, prereq_id=e["prereq_id"], topic_id=e["topic_id"],
                                                true_rho=true_dep.get((e["prereq_id"], e["topic_id"])),
                                                excess=e["excess"], strength=e["strength"]))
        dd = [x for x in out["dependencies"] if x["true_rho"] is not None]

        # ---- topic difficulty ----
        true_m = {x["topic_id"]: x["expected_pct"] for x in gt["topic_mastery"]}
        for sj in subjects:
            for t in topic_table(ds, sj):
                out["topics"].append(dict(subject_id=sj, topic_id=t["topic_id"], true=true_m.get(t["topic_id"]),
                                          estimated=t["mean_pct"]))

        out["policy"] = policy
        out["summary"] = dict(
            textbook_mae_adjusted=r(mae_adj, 2), textbook_mae_naive=r(mae_naive, 2),
            textbook_ci_coverage=r(np.mean([x["covered"] for x in tb]), 2) if tb else None,
            textbook_sign_accuracy=r(np.mean([x["sign_ok"] for x in tb]), 2) if tb else None,
            textbook_naive_sign_accuracy=r(np.mean([x["naive_sign_ok"] for x in tb]), 2) if tb else None,
            hours_corr=_corr([x["estimated"] for x in hh], [x["true"] for x in hh]),
            hours_spearman=_spearman([x["estimated"] for x in hh], [x["true"] for x in hh]),
            hours_policy_ours=r(np.mean([p["ours"] for p in policy]), 3),
            hours_policy_heuristic=r(np.mean([p["heuristic"] for p in policy]), 3),
            items_precision=out["items"]["precision"], items_recall=out["items"]["recall"],
            dependency_spearman=_spearman([x["excess"] for x in dd], [x["true_rho"] for x in dd]),
            difficulty_corr=_corr([x["estimated"] for x in out["topics"]], [x["true"] for x in out["topics"]]),
            language_detected=all(x["detected"] == x["planted"] for x in out["language"]) if out["language"] else None,
        )
        return out

    return ds.cached("validation", build)
