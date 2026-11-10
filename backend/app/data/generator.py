"""Synthetic dataset generator with a planted, recoverable ground truth.

Generative model (per student i, topic t):

    theta_i  = school_effect + rural_penalty + N(0, 0.9)              general ability
    d_it     = class_effect + textbook_effect(section) + language_x_textbook
               + [learn_t(h_ct) - learn_t(plan_t)]
               + sum_p rho_tp * d_ip                                   prerequisite carry-over
               + N(0, 0.55)
    s_it     = theta_i + learn_t(plan_t) - b_t + d_it                  topic skill (logit)
    learn_t(h) = L_t * (1 - exp(-h / tau_t))                           diminishing returns of hours
    P(item j correct) = 0.2 + 0.8 * sigmoid(a_j * (s_it - delta_j))   guessing floor for 4 options

Textbooks are chosen by schools non-randomly (strong urban schools prefer the
'Альфа' books), which makes the naive comparison misleading on purpose.
"""
from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import pandas as pd

from . import curriculum as C

OPTIONS = np.array(list("ABCD"))


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def _learn(topic: dict, hours):
    return topic["L"] * (1.0 - np.exp(-np.asarray(hours, dtype=float) / topic["tau"]))


@dataclass
class _SubjectSim:
    subject_id: str
    topics: list
    class_ids: np.ndarray          # class id per student row
    student_ids: np.ndarray
    theta: np.ndarray
    class_effect: np.ndarray       # per student (copied from class)
    textbook: np.ndarray           # per student
    language: np.ndarray           # per student
    hours: dict                    # topic -> hours per student (copied from class)
    eps: dict                      # topic -> noise per student


def _section_effect(textbook_id: str, section: str) -> float:
    eff = C.TEXTBOOK_SECTION_EFFECTS.get(textbook_id, {})
    return eff.get(section, eff.get("_default", 0.0))


def _skills(sim: _SubjectSim, textbook_override: str | None = None, hours_bump: tuple | None = None):
    """Recompute latent skills with the stored random draws (enables counterfactuals)."""
    tb = sim.textbook if textbook_override is None else np.full_like(sim.textbook, textbook_override)
    d, s = {}, {}
    for t in sim.topics:
        h = sim.hours[t["id"]].astype(float)
        if hours_bump and hours_bump[0] == t["id"]:
            h = h + hours_bump[1]
        tb_eff = np.array([_section_effect(x, t["section"]) for x in tb])
        lang_eff = np.array([C.TEXTBOOK_LANGUAGE_INTERACTION.get((x, l), 0.0) for x, l in zip(tb, sim.language)])
        carry = np.zeros(len(tb))
        for p, rho in t["rho"].items():
            carry += rho * d[p]
        d[t["id"]] = (sim.class_effect + tb_eff + lang_eff
                      + (_learn(t, h) - _learn(t, t["hours"])) + carry + sim.eps[t["id"]])
        s[t["id"]] = sim.theta + _learn(t, t["hours"]) - t["b"] + d[t["id"]]
    return s


def _expected_topic_pct(sim, items_by_topic, skills):
    """Expected share of correct answers per topic (using only non-defective items)."""
    out = {}
    for t in sim.topics:
        its = [it for it in items_by_topic[t["id"]] if it["defect"] is None]
        p = np.mean([0.2 + 0.8 * _sigmoid(it["a"] * (skills[t["id"]] - it["delta"])) for it in its], axis=0)
        out[t["id"]] = p
    return out


def generate(out_dir: str | Path, seed: int = 42, n_schools: int = 60) -> dict:
    rng = np.random.default_rng(seed)
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    # ---------------- schools ----------------
    schools = []
    for k in range(n_schools):
        district = C.DISTRICTS[0] if k < 14 else C.DISTRICTS[1 + (k % (len(C.DISTRICTS) - 1))]
        urban = district == "г. Тараз" or rng.random() < 0.2
        lang = "kz" if rng.random() < 0.62 else "ru"
        eff = rng.normal(0, 0.3) + (0.0 if urban else -0.35)
        schools.append(dict(school_id=f"S{k + 1:03d}", name=f"Школа №{k + 1}", district=district,
                            locality="urban" if urban else "rural", language=lang, _eff=eff))
    sch = pd.DataFrame(schools)

    # ---------------- students & classes ----------------
    students, classes = [], []
    stud_rows = []  # (student_id, school_idx, class_label, theta)
    sid = 0
    for si, s in sch.iterrows():
        n_cls = rng.choice([1, 2, 2, 3], p=[0.2, 0.4, 0.2, 0.2]) if s["locality"] == "urban" else rng.choice([1, 2], p=[0.6, 0.4])
        for c in range(n_cls):
            label = f"7{'АБВ'[c]}"
            n = int(rng.integers(16, 31) if s["locality"] == "urban" else rng.integers(10, 24))
            for _ in range(n):
                sid += 1
                theta = s["_eff"] + rng.normal(0, 0.9)
                baseline = float(np.clip(round(55 + 14 * (theta + rng.normal(0, 0.45))), 0, 100))
                students.append(dict(student_id=f"U{sid:05d}", school_id=s["school_id"], class_label=label,
                                     baseline_score=baseline))
                stud_rows.append((f"U{sid:05d}", si, label, theta))
    stu = pd.DataFrame(students)

    truth_items, items_rows, hours_rows, resp_frames = [], [], [], []
    sims = {}
    for subj in C.SUBJECTS:
        sj = subj["subject_id"]
        topics = [t for t in C.TOPICS if t["s"] == sj]
        tbs = [t["textbook_id"] for t in C.TEXTBOOKS if t["subject_id"] == sj]

        # school-level textbook choice (confounded by school strength)
        school_tb = {}
        for _, s in sch.iterrows():
            if s["locality"] == "rural":
                grp = "rural"
            else:
                grp = "urban_strong" if s["_eff"] > 0.05 else "urban_weak"
            school_tb[s["school_id"]] = rng.choice(tbs, p=C.TEXTBOOK_CHOICE[sj][grp])

        # classes (one per school x class_label x subject)
        cls_index = {}
        for (school_idx, label), _g in pd.DataFrame(stud_rows, columns=["sid", "si", "label", "theta"]).groupby(["si", "label"]):
            s = sch.iloc[school_idx]
            cid = f"{sj}-{s['school_id']}-{label}"
            cls_index[(school_idx, label)] = cid
            classes.append(dict(class_id=cid, school_id=s["school_id"], subject_id=sj, class_label=label,
                                textbook_id=school_tb[s["school_id"]], _eff=rng.normal(0, 0.15)))
        cls_df = pd.DataFrame([c for c in classes if c["subject_id"] == sj]).set_index("class_id")

        # actual hours per class per topic (teachers deviate from the plan)
        cls_hours = {}
        for cid in cls_df.index:
            for t in topics:
                h = int(max(2, round(t["hours"] * rng.uniform(0.65, 1.35))))
                cls_hours[(cid, t["id"])] = h
                hours_rows.append(dict(class_id=cid, topic_id=t["id"], hours=h))

        sr = pd.DataFrame(stud_rows, columns=["sid", "si", "label", "theta"])
        class_of = np.array([cls_index[(a, b)] for a, b in zip(sr["si"], sr["label"])])
        sim = _SubjectSim(
            subject_id=sj, topics=topics, class_ids=class_of, student_ids=sr["sid"].to_numpy(),
            theta=sr["theta"].to_numpy(),
            class_effect=cls_df.loc[class_of, "_eff"].to_numpy(),
            textbook=cls_df.loc[class_of, "textbook_id"].to_numpy(),
            language=sch.iloc[sr["si"].to_numpy()]["language"].to_numpy(),
            hours={t["id"]: np.array([cls_hours[(c, t["id"])] for c in class_of]) for t in topics},
            eps={t["id"]: rng.normal(0, 0.55, len(sr)) for t in topics},
        )
        sims[sj] = sim
        skills = _skills(sim)

        # items + responses
        items_by_topic = {}
        for t in topics:
            items_by_topic[t["id"]] = []
            for q in range(1, C.ITEMS_PER_TOPIC + 1):
                iid = f"{t['id']}-Q{q}"
                defect = C.DEFECTIVE_ITEMS.get(iid)
                a = rng.uniform(0.9, 1.9)
                delta = rng.normal(0, 0.55)
                if defect == "noise":
                    a = 0.05
                if defect == "trivial":
                    delta = -4.5
                true_key = rng.choice(OPTIONS)
                distractors = [o for o in OPTIONS if o != true_key]
                popular = rng.choice(distractors)
                published = popular if defect == "wrong_key" else true_key
                it = dict(item_id=iid, topic_id=t["id"], a=a, delta=delta, true_key=true_key,
                          popular=popular, published=published, defect=defect)
                items_by_topic[t["id"]].append(it)
                items_rows.append(dict(item_id=iid, topic_id=t["id"], correct_option=published, n_options=4))
                truth_items.append(dict(item_id=iid, defect=defect, true_key=true_key, published_key=published))

                p = 0.2 + 0.8 * _sigmoid(a * (skills[t["id"]] - delta))
                ok = rng.random(len(p)) < p
                others = [o for o in distractors if o != popular]
                wrong = np.where(rng.random(len(p)) < 0.55, popular, rng.choice(others, len(p)))
                ans = np.where(ok, true_key, wrong)
                skip = rng.random(len(p)) < 0.01  # a few missing answers
                ans = np.where(skip, "", ans)
                resp_frames.append(pd.DataFrame(dict(student_id=sim.student_ids, class_id=sim.class_ids,
                                                     item_id=iid, answer=ans)))
        sim.items_by_topic = items_by_topic

    # ---------------- write tables ----------------
    pd.DataFrame(C.SUBJECTS).to_csv(out_dir / "subjects.csv", index=False)
    topics_df = pd.DataFrame([dict(topic_id=t["id"], subject_id=t["s"], section=t["section"], section_kz=t["section_kz"],
                                   name=t["name"], name_kz=t["name_kz"], order=i + 1, planned_hours=t["hours"],
                                   prerequisites=";".join(t["prereqs"])) for i, t in enumerate(C.TOPICS)])
    topics_df.to_csv(out_dir / "topics.csv", index=False)
    pd.DataFrame(C.TEXTBOOKS).to_csv(out_dir / "textbooks.csv", index=False)
    sch.drop(columns="_eff").to_csv(out_dir / "schools.csv", index=False)
    stu.to_csv(out_dir / "students.csv", index=False)
    pd.DataFrame(classes).drop(columns="_eff").to_csv(out_dir / "classes.csv", index=False)
    pd.DataFrame(hours_rows).to_csv(out_dir / "hours.csv", index=False)
    pd.DataFrame(items_rows).to_csv(out_dir / "items.csv", index=False)
    resp = pd.concat(resp_frames, ignore_index=True)
    resp.to_csv(out_dir / "responses.csv", index=False)

    truth = _ground_truth(sims, truth_items)
    (out_dir / "ground_truth.json").write_text(json.dumps(truth, ensure_ascii=False, indent=2))
    return {"students": len(stu), "schools": len(sch), "classes": len(classes), "responses": len(resp)}


def _ground_truth(sims: dict, truth_items: list) -> dict:
    """Compute the planted facts in the same units the analytics reports (percentage points)."""
    out = {"textbook_effects": [], "hours_marginal": [], "topic_mastery": [], "defective_items": [],
           "dependencies": [], "language_interaction": []}
    for sj, sim in sims.items():
        base = _expected_topic_pct(sim, sim.items_by_topic, _skills(sim))
        for t in sim.topics:
            out["topic_mastery"].append(dict(topic_id=t["id"], subject_id=sj,
                                             expected_pct=round(float(base[t["id"]].mean() * 100), 2)))
            for p, rho in t["rho"].items():
                out["dependencies"].append(dict(topic_id=t["id"], prereq_id=p, rho=rho))
        # textbook average treatment effects per section (counterfactual, same students)
        tbs = [t["textbook_id"] for t in C.TEXTBOOKS if t["subject_id"] == sj]
        cf = {tb: _expected_topic_pct(sim, sim.items_by_topic, _skills(sim, textbook_override=tb)) for tb in tbs}
        sections = list(dict.fromkeys(t["section"] for t in sim.topics))
        ref = tbs[0]
        for sec in sections:
            sec_topics = [t["id"] for t in sim.topics if t["section"] == sec]
            for tb in tbs[1:]:
                diff = np.mean([cf[tb][x] - cf[ref][x] for x in sec_topics], axis=0)
                out["textbook_effects"].append(dict(subject_id=sj, section=sec, textbook_id=tb, reference=ref,
                                                    effect_pp=round(float(diff.mean() * 100), 2)))
        # language x textbook: effect of the reference book in kz vs ru schools
        for (tb, lang), v in C.TEXTBOOK_LANGUAGE_INTERACTION.items():
            if tb.startswith(sj[:3]):
                out["language_interaction"].append(dict(subject_id=sj, textbook_id=tb, language=lang, logit=v))
        # marginal value of one extra hour (direct effect on the topic itself)
        for t in sim.topics:
            bumped = _expected_topic_pct(sim, sim.items_by_topic, _skills(sim, hours_bump=(t["id"], 1)))
            gain = float((bumped[t["id"]] - base[t["id"]]).mean() * 100)
            out["hours_marginal"].append(dict(topic_id=t["id"], subject_id=sj, pp_per_hour=round(gain, 3),
                                              planned_hours=t["hours"], tau=t["tau"]))
    out["defective_items"] = [x for x in truth_items if x["defect"]]
    return out


if __name__ == "__main__":
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else str(Path(__file__).resolve().parents[2] / "data" / "synthetic")
    print(generate(target))
