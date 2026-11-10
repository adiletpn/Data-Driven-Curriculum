"""Test quality audit (classical test theory + distractor analysis).

Before blaming a topic or a textbook we check the measuring instrument itself:
an item with a wrong answer key or an ambiguous wording distorts every
downstream conclusion. Critical items are excluded from mastery estimates.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .common import r

FLAG_LABELS = {
    "wrong_key": "Вероятно неверный ключ ответа",
    "no_discrimination": "Задание не различает сильных и слабых учеников",
    "negative_discrimination": "Отрицательная различающая способность",
    "too_easy": "Слишком лёгкое (решают почти все)",
    "too_hard": "Слишком сложное (уровень угадывания)",
}
CRITICAL = {"wrong_key", "no_discrimination", "negative_discrimination"}


def _cronbach_alpha(mat: np.ndarray) -> float:
    k = mat.shape[1]
    if k < 2:
        return np.nan
    var_items = mat.var(axis=0, ddof=1).sum()
    var_total = mat.sum(axis=1).var(ddof=1)
    return float(k / (k - 1) * (1 - var_items / var_total)) if var_total > 0 else np.nan


def audit(ds, subject_id: str | None = None) -> dict:
    def build():
        g = ds.graded.merge(ds.topics[["topic_id", "subject_id"]], on="topic_id")
        out_items, out_topics = [], []
        for sj, gs in g.groupby("subject_id"):
            wide = gs.pivot_table(index="student_id", columns="item_id", values="correct", aggfunc="first")
            total = wide.mean(axis=1)
            n_items = wide.notna().sum(axis=1)
            items = ds.items[ds.items["item_id"].isin(wide.columns)].merge(
                ds.topics[["topic_id", "name"]], on="topic_id")
            for _, it in items.iterrows():
                col = wide[it["item_id"]]
                ok = col.notna()
                rest = (total * n_items - col.fillna(0)) / (n_items - 1)  # rest-of-subject score
                p = float(col[ok].mean())
                disc = float(np.corrcoef(col[ok], rest[ok])[0, 1]) if col[ok].std() > 0 else 0.0
                terc = pd.qcut(rest[ok].rank(method="first"), 3, labels=["low", "mid", "high"])
                answers = gs[gs["item_id"] == it["item_id"]].set_index("student_id")["answer"] if "answer" in gs else None
                options = []
                flags = []
                key = str(it.get("correct_option", "")) if "correct_option" in it else ""
                if answers is not None:
                    a = answers.reindex(terc.index).fillna("").astype(str)
                    for opt in sorted(set(a.unique()) - {""}):
                        sel = a == opt
                        options.append(dict(option=opt, is_key=opt == key,
                                            share=r(sel.mean(), 3),
                                            share_low=r(sel[terc == "low"].mean(), 3),
                                            share_high=r(sel[terc == "high"].mean(), 3)))
                    key_high = next((o["share_high"] for o in options if o["is_key"]), 0) or 0
                    rival = max((o for o in options if not o["is_key"]), key=lambda o: o["share_high"] or 0, default=None)
                    if disc < 0 and rival and (rival["share_high"] or 0) > key_high:
                        flags.append("wrong_key")
                if not flags:
                    if disc < -0.05:
                        flags.append("negative_discrimination")
                    elif disc < 0.12:
                        flags.append("no_discrimination")
                if p > 0.95:
                    flags.append("too_easy")
                if p < 0.3:
                    flags.append("too_hard")
                suggestion = None
                if "wrong_key" in flags:
                    suggestion = f"Сильные ученики чаще выбирают «{rival['option']}», а не ключ «{key}». Проверьте ключ."
                elif "no_discrimination" in flags or "negative_discrimination" in flags:
                    suggestion = "Ответы почти случайны: проверьте формулировку и варианты ответа."
                elif "too_easy" in flags:
                    suggestion = "Задание почти ничего не измеряет: усложните или замените."
                out_items.append(dict(
                    item_id=it["item_id"], topic_id=it["topic_id"], topic_name=it["name"], subject_id=sj,
                    p_value=r(p, 3), discrimination=r(disc, 3),
                    difficulty_logit=r(np.log((1 - p) / p) if 0 < p < 1 else np.nan, 2),
                    n=int(ok.sum()), key=key, flags=flags,
                    flag_labels=[FLAG_LABELS[f] for f in flags],
                    critical=bool(set(flags) & CRITICAL), suggestion=suggestion, options=options))
            # reliability per topic test, before and after excluding critical items
            crit = {x["item_id"] for x in out_items if x["critical"] and x["subject_id"] == sj}
            for tid, its in items.groupby("topic_id"):
                cols = [c for c in its["item_id"] if c in wide.columns]
                mat = wide[cols].dropna().to_numpy()
                clean = [c for c in cols if c not in crit]
                mat2 = wide[clean].dropna().to_numpy()
                out_topics.append(dict(topic_id=tid, subject_id=sj, n_items=len(cols),
                                       alpha=r(_cronbach_alpha(mat), 3),
                                       alpha_clean=r(_cronbach_alpha(mat2), 3) if len(clean) != len(cols) else None,
                                       n_critical=len(cols) - len(clean)))
        return dict(items=out_items, topics=out_topics)

    res = ds.cached("audit", build)
    if subject_id:
        return dict(items=[x for x in res["items"] if x["subject_id"] == subject_id],
                    topics=[x for x in res["topics"] if x["subject_id"] == subject_id])
    return res


def apply_exclusions(ds) -> None:
    """Exclude critical items from all mastery estimates (idempotent)."""
    if getattr(ds, "_exclusions_applied", False):
        return
    res = audit(ds)
    ds.excluded_items = {x["item_id"] for x in res["items"] if x["critical"]}
    ds._exclusions_applied = True
