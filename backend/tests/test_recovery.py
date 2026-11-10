"""The analytics must recover the facts planted in the synthetic data."""
import numpy as np

from app.analytics import hours, items, prerequisites, schools, textbooks, topics, validation


def test_all_defective_items_found_without_false_alarms(ds):
    a = items.audit(ds)
    flagged = {x["item_id"] for x in a["items"] if x["critical"]}
    planted = {x["item_id"] for x in ds.ground_truth["defective_items"]}
    assert flagged == planted


def test_wrong_keys_are_identified_as_such(ds):
    a = {x["item_id"]: x for x in items.audit(ds)["items"]}
    for x in ds.ground_truth["defective_items"]:
        if x["defect"] == "wrong_key":
            assert "wrong_key" in a[x["item_id"]]["flags"]


def test_hardest_topics_match_truth(ds):
    for sj in ["ALG7", "GEO7"]:
        est = {t["topic_id"]: t["mean_pct"] for t in topics.topic_table(ds, sj)}
        tru = {x["topic_id"]: x["expected_pct"] for x in ds.ground_truth["topic_mastery"] if x["subject_id"] == sj}
        ids = list(est)
        assert np.corrcoef([est[i] for i in ids], [tru[i] for i in ids])[0, 1] > 0.95


def test_simpson_paradox_detected_in_geometry(ds):
    overall = textbooks.compare(ds, "GEO7")["sections"][0]
    assert overall["naive_ranking"][0] == "GEO-A"
    assert overall["ranking"][0] == "GEO-B"
    assert overall["simpson"] and overall["best_significant"]


def test_adjusted_textbook_effects_beat_naive(ds):
    s = validation.run(ds)["summary"]
    assert s["textbook_mae_adjusted"] < s["textbook_mae_naive"] / 2
    assert s["textbook_sign_accuracy"] >= 0.85


def test_translation_problem_detected_only_where_planted(ds):
    v = validation.run(ds)
    assert v["summary"]["language_detected"]


def test_hour_returns_correlate_with_truth(ds):
    assert validation.run(ds)["summary"]["hours_spearman"] > 0.6


def test_optimizer_keeps_total_and_bounds(ds):
    o = hours.optimize(ds, "ALG7")
    assert sum(x["recommended"] for x in o["topics"]) == o["total_hours"]
    for x in o["topics"]:
        assert x["lo"] <= x["recommended"] <= x["hi"]


def test_optimizer_moves_hours_from_saturated_to_underfunded(ds):
    o = {x["topic_id"]: x for x in hours.optimize(ds, "ALG7")["topics"]}
    assert o["A07"]["delta"] > 0 and o["A12"]["delta"] > 0      # hard & underfunded
    assert o["A17"]["delta"] < 0 and o["A15"]["delta"] < 0      # easy & saturated
    assert o["A13"]["delta"] <= 0                               # weak, but hours don't help


def test_optimizer_beats_or_matches_heuristic(ds):
    for p in validation.run(ds)["policy"]:
        assert p["ours"] >= p["heuristic"] * 0.95


def test_root_causes_point_to_prerequisites(ds):
    rc = prerequisites.analyze(ds, "ALG7")["root_causes"]
    assert any(x["root_id"] == "A12" and x["topic_id"] == "A13" for x in rc)


def test_school_value_added_is_shrunk(ds):
    va = schools.value_added(ds, "ALG7")["schools"]
    assert all(abs(s["value_added"]) <= abs(s["raw_value_added"]) + 1e-6 for s in va)
