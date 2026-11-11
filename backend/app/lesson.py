"""Methodological guide for a weak topic, assembled from the platform's own evidence (RU/KZ).

The template version needs no external service. When an LLM is configured, the same evidence is passed to it
to produce a richer guide with example tasks — the model only expands, the numbers come from the analytics.
"""
from __future__ import annotations

import json

from .analytics import hours as hours_mod
from .analytics import items as items_mod
from .analytics import prerequisites as prereq_mod
from .analytics import textbooks as textbooks_mod
from .analytics import topics as topics_mod


def _f(x, nd=0):
    return "—" if x is None else f"{x:.{nd}f}".replace(".", ",")


def evidence(ds, subject_id: str, topic_id: str) -> dict:
    tt = {t["topic_id"]: t for t in topics_mod.topic_table(ds, subject_id)}
    t = tt[topic_id]
    graph = prereq_mod.analyze(ds, subject_id)
    pre = sorted([e for e in graph["edges"] if e["topic_id"] == topic_id and e["strength"] != "none"],
                 key=lambda e: -(e["adjusted_gap"] or 0))
    hr = next((x for x in hours_mod.optimize(ds, subject_id)["topics"] if x["topic_id"] == topic_id), None)
    heat = next((x for x in textbooks_mod.compare(ds, subject_id)["heatmap"] if x["topic_id"] == topic_id), None)
    its = [x for x in items_mod.audit(ds, subject_id)["items"] if x["topic_id"] == topic_id and not x["critical"]]
    its.sort(key=lambda x: x["p_value"])
    hard = []
    for x in its[:3]:
        wrong = max((o for o in x["options"] if not o["is_key"]), key=lambda o: o["share"] or 0, default=None)
        hard.append(dict(item_id=x["item_id"], solved=round(x["p_value"] * 100), key=x["key"],
                         popular_wrong=wrong["option"] if wrong else None,
                         popular_wrong_share=round((wrong["share"] or 0) * 100) if wrong else None))
    return dict(topic=dict(id=topic_id, name=t["name"], name_kz=t["name_kz"], section=t["section"],
                           mean_pct=t["mean_pct"], mastered=t["mastered_share"], status=t["status"],
                           by=t["by"], planned_hours=t["planned_hours"]),
                prerequisites=[dict(id=e["prereq_id"], name=tt[e["prereq_id"]]["name"], name_kz=tt[e["prereq_id"]]["name_kz"],
                                    gap=e["adjusted_gap"], not_mastered=e["prereq_not_mastered"]) for e in pre[:2]],
                hours=dict(planned=hr["planned"], recommended=hr["recommended"], marginal=hr["marginal_pp_per_hour"],
                           reasons=hr["reasons"]) if hr else None,
                best_textbook=ds.textbooks.set_index("textbook_id")["title"].get(heat["best"]) if heat else None,
                hard_items=hard)


T = {
    "ru": dict(title="Методические рекомендации", diag="1. Входная проверка базы", base="2. Повторение базовой темы",
               main="3. Основной материал", errors="4. Разбор типичных ошибок", groups="5. Работа по группам",
               control="6. Контроль усвоения", evidence="Почему так (данные платформы)"),
    "kz": dict(title="Әдістемелік ұсыныстар", diag="1. Базаны кіріс тексеру", base="2. Базалық тақырыпты қайталау",
               main="3. Негізгі материал", errors="4. Типтік қателерді талдау", groups="5. Топтармен жұмыс",
               control="6. Меңгеруді бақылау", evidence="Неліктен (платформа деректері)"),
}


def template(ev: dict, lang: str) -> str:
    L = T[lang]
    kz = lang == "kz"
    t = ev["topic"]
    name = t["name_kz"] if kz else t["name"]
    pre = ev["prerequisites"]
    h = ev["hours"]
    lines = [f"# {L['title']}: «{name}»", ""]
    if kz:
        lines += [f"Тақырыпты оқушылардың **{_f(t['mastered'])}%** меңгерген (орташа балл {_f(t['mean_pct'])}%).", ""]
    else:
        lines += [f"Тему усвоили **{_f(t['mastered'])}%** учеников (средний балл {_f(t['mean_pct'])}%).", ""]
    lines += [f"## {L['diag']}"]
    if pre:
        p = pre[0]
        pn = p["name_kz"] if kz else p["name"]
        lines += [(f"- Сабақ басында «{pn}» бойынша 5–7 минуттық мини-тест өткізіңіз: аймақта оны оқушылардың "
                   f"{_f(p['not_mastered'])}%-ы меңгермеген." if kz else
                   f"- В начале урока — мини-тест на 5–7 минут по теме «{pn}»: в регионе её не усвоили "
                   f"{_f(p['not_mastered'])}% учеников."), ""]
        lines += [f"## {L['base']}",
                  (f"- Бірдей деңгейдегі, «{pn}» меңгерген оқушылар «{name}» тақырыбын {_f(p['gap'], 1)} п.т. жақсы орындайды. "
                   f"Мини-тест нәтижесі бойынша 1 сабақты базаны қайталауға бөліңіз." if kz else
                   f"- Ученики одного уровня, усвоившие «{pn}», решают «{name}» на {_f(p['gap'], 1)} п.п. лучше. "
                   f"По итогам мини-теста выделите 1 урок на повторение базы."), ""]
    else:
        lines += ["- " + ("Тақырып алдында қысқа диагностика өткізіңіз." if kz else "Проведите короткую диагностику перед темой."), ""]
    lines += [f"## {L['main']}"]
    if h:
        if h["recommended"] > h["planned"]:
            lines += ["- " + (f"Тақырыпқа {h['planned']} емес, **{h['recommended']} сағат** жоспарлаңыз: әр қосымша сағат "
                               f"шамамен +{_f(h['marginal'], 1)} п.т. береді." if kz else
                               f"Запланируйте **{h['recommended']} ч** вместо {h['planned']}: каждый дополнительный час "
                               f"даёт около +{_f(h['marginal'], 1)} п.п.")]
        elif "saturated" in h["reasons"] or h["recommended"] < h["planned"]:
            lines += ["- " + ("Қосымша сағат бұл тақырыпқа аз әсер етеді — уақытты базалық тақырыпқа жұмсаңыз." if kz else
                               "Лишние часы на эту тему почти не помогают — время лучше вложить в базовую тему.")]
    if ev["best_textbook"]:
        lines += ["- " + (f"Түсіндіру мен есептер үшін «{ev['best_textbook']}» материалдарын пайдаланыңыз — осы тақырып бойынша нәтижесі ең жоғары."
                          if kz else f"Для объяснения и задач используйте материалы «{ev['best_textbook']}» — по этой теме у него лучший результат.")]
    lines += [""]
    if ev["hard_items"]:
        lines += [f"## {L['errors']}"]
        for x in ev["hard_items"]:
            if x["popular_wrong"]:
                lines += ["- " + (f"{x['item_id']} тапсырмасын тек {x['solved']}% шешеді, {x['popular_wrong_share']}% «{x['popular_wrong']}» "
                                  f"нұсқасын таңдайды (дұрысы «{x['key']}»). Осы қатені сабақта талдаңыз." if kz else
                                  f"Задание {x['item_id']} решают только {x['solved']}%, {x['popular_wrong_share']}% выбирают «{x['popular_wrong']}» "
                                  f"(верно «{x['key']}»). Разберите эту ошибку на уроке.")]
        lines += [""]
    lines += [f"## {L['groups']}",
              ("- **А тобы** — базалық тақырыпты меңгермегендер: алдымен базаны қалпына келтіру.\n"
               "- **Ә тобы** — базасы бар, бірақ тақырыпта қиналатындар: үлгі бойынша жаттығулар.\n"
               "- **Б тобы** — меңгергендер: күрделі есептер және консультант рөлі." if kz else
               "- **Группа А** — не усвоили базовую тему: сначала восстановить базу.\n"
               "- **Группа Б** — база есть, но тема не идёт: тренировка по образцу.\n"
               "- **Группа В** — усвоили: задачи повышенной сложности и роль консультанта."), "",
              f"## {L['control']}",
              ("- Тақырып соңында 6 тапсырмадан тұратын мини-тест; меңгеру критерийі — кемінде 60%." if kz else
               "- В конце темы — мини-тест из 6 заданий; критерий усвоения — не менее 60%."),
              ("- Нәтижелерді платформаға жүктеңіз — келесі тоқсанда әсері көрінеді." if kz else
               "- Загрузите результаты в платформу — в следующей четверти будет виден эффект.")]
    return "\n".join(lines)


def build(ds, subject_id: str, topic_id: str, lang: str = "ru") -> dict:
    lang = "kz" if lang == "kz" else "ru"
    ev = evidence(ds, subject_id, topic_id)
    text = template(ev, lang)
    from .ai import available, provider
    if available():
        try:
            from .ai import _ask_openai_compatible
            prompt = (("Қазақ тілінде" if lang == "kz" else "На русском языке") +
                      " дополни методические рекомендации для учителя: добавь 4–6 примеров заданий разного уровня по теме "
                      "(с ответами) и 2–3 приёма объяснения. Не меняй числа и выводы из данных. Формат — Markdown.\n\n"
                      f"ДАННЫЕ: {json.dumps(ev, ensure_ascii=False)}\n\nЧЕРНОВИК:\n{text}")
            if provider() == "openai":
                return dict(markdown=_ask_openai_compatible("Ты — опытный методист по математике в Казахстане.",
                                                            [{"role": "user", "content": prompt}]),
                            source="llm", evidence=ev)
        except Exception:
            pass
    return dict(markdown=text, source="template", evidence=ev)
