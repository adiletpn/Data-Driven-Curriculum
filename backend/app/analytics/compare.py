"""Side-by-side comparison of two schools: where one does better than the other, and what differs in how they
teach (hours spent per topic, textbook). Topic differences are tested (Welch t-test on student results);
the overall comparison is shown both raw and fair (value-added, i.e. adjusted for the student intake)."""
from __future__ import annotations

import numpy as np
from scipy import stats

from .common import pp, r
from .items import apply_exclusions
from .schools import value_added
from .textbooks import compare as tb_compare


def _f(x, nd=1):
    return "—" if x is None else f"{x:.{nd}f}".replace(".", ",")


def compare_schools(ds, subject_id: str, a: str, b: str) -> dict:
    apply_exclusions(ds)
    s = ds.topic_scores()
    s = s[s["subject_id"] == subject_id]
    va = {x["school_id"]: x for x in value_added(ds, subject_id)["schools"]}
    if a not in va or b not in va:
        raise KeyError("school not found")
    topics = ds.subject_topics(subject_id)
    heat = {x["topic_id"]: x for x in tb_compare(ds, subject_id)["heatmap"]}
    titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()
    base = s.groupby("school_id")["baseline_score"].mean()

    rows = []
    for _, t in topics.iterrows():
        tid = t["topic_id"]
        xa = s.loc[(s["school_id"] == a) & (s["topic_id"] == tid)]
        xb = s.loc[(s["school_id"] == b) & (s["topic_id"] == tid)]
        if xa.empty or xb.empty:
            continue
        diff = xa["pct"].mean() - xb["pct"].mean()
        p = float(stats.ttest_ind(xa["pct"], xb["pct"], equal_var=False).pvalue) if len(xa) > 2 and len(xb) > 2 else np.nan
        ha, hb = xa.groupby("class_id")["hours"].first().mean(), xb.groupby("class_id")["hours"].first().mean()
        rows.append(dict(topic_id=tid, name=t["name"], name_kz=t["name_kz"], section=t["section"],
                         a=pp(xa["pct"].mean()), b=pp(xb["pct"].mean()), diff=pp(diff), p=r(p, 4),
                         significant=bool(np.isfinite(p) and p < 0.05),
                         hours_a=r(ha, 1), hours_b=r(hb, 1), best_textbook=heat.get(tid, {}).get("best")))

    A, B = va[a], va[b]

    def reasons(row, winner, loser):
        w, l = (A, B) if winner == a else (B, A)
        hw, hl = (row["hours_a"], row["hours_b"]) if winner == a else (row["hours_b"], row["hours_a"])
        out_ru, out_kz = [], []
        if hw is not None and hl is not None and hw - hl >= 1:
            out_ru.append(f"тратит на тему {_f(hw)} ч против {_f(hl)}")
            out_kz.append(f"тақырыпқа {_f(hw)} сағ жұмсайды, екіншісі {_f(hl)}")
        if w["textbook_id"] != l["textbook_id"] and row["best_textbook"] == w["textbook_id"]:
            out_ru.append(f"учебник «{titles.get(w['textbook_id'])}» сильнее по этой теме")
            out_kz.append(f"«{titles.get(w['textbook_id'])}» оқулығы осы тақырыпта күштірек")
        return out_ru, out_kz

    better_a = sorted([x for x in rows if x["significant"] and x["diff"] > 0], key=lambda x: -x["diff"])
    better_b = sorted([x for x in rows if x["significant"] and x["diff"] < 0], key=lambda x: x["diff"])
    for x in better_a:
        x["why_ru"], x["why_kz"] = reasons(x, a, b)
    for x in better_b:
        x["why_ru"], x["why_kz"] = reasons(x, b, a)

    def card(v, sid):
        return dict(school_id=sid, name=v["name"], district=v["district"], locality=v["locality"], language=v["language"],
                    textbook_id=v["textbook_id"], textbook=titles.get(v["textbook_id"], v["textbook_id"]),
                    n_students=v["n_students"], actual=v["actual"], expected=v["expected"], value_added=v["value_added"],
                    ci=v["ci"], rank=v["rank"], category=v["category"], baseline=r(base.get(sid), 1))

    raw_gap = (A["actual"] or 0) - (B["actual"] or 0)
    fair_gap = (A["value_added"] or 0) - (B["value_added"] or 0)
    notes_ru, notes_kz = [], []
    if abs(raw_gap) >= 2 and np.sign(raw_gap) != np.sign(fair_gap) or abs(raw_gap - fair_gap) >= 4:
        stronger = A if (base.get(a, 0) or 0) > (base.get(b, 0) or 0) else B
        notes_ru.append(f"Разница в «сырых» баллах ({_f(raw_gap)} п.п.) во многом объясняется составом учеников: "
                        f"у школы «{stronger['name']}» выше входной уровень. С учётом этого разница — {_f(fair_gap)} п.п.")
        notes_kz.append(f"«Шикі» балдардағы айырма ({_f(raw_gap)} п.т.) көбіне оқушылар құрамымен түсіндіріледі: "
                        f"«{stronger['name']}» мектебінде бастапқы деңгей жоғары. Оны ескергенде айырма — {_f(fair_gap)} п.т.")
    return dict(subject_id=subject_id, a=card(A, a), b=card(B, b), topics=rows, better_a=better_a, better_b=better_b,
                raw_gap=r(raw_gap, 1), fair_gap=r(fair_gap, 1), notes_ru=notes_ru, notes_kz=notes_kz)
