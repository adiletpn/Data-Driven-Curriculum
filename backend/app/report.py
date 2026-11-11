"""Structured analytical report (RU/KZ) for printing / PDF export."""
from __future__ import annotations

import datetime as dt

from .analytics import hours as hours_mod
from .analytics import insights as insights_mod
from .analytics import items as items_mod
from .analytics import schools as schools_mod
from .analytics import textbooks as textbooks_mod
from .analytics import topics as topics_mod

T = {
    "ru": dict(
        title="Аналитический отчёт об эффективности учебной программы",
        summary="Краткие итоги", findings="Ключевые выводы и рекомендации", topics="Сложные темы",
        textbooks="Эффективность учебников", hours="Рекомендации по распределению часов",
        quality="Качество тестовых материалов", schools="Школы, которым нужна поддержка",
        method="Методология и ограничения",
        cols_topics=["Тема", "Раздел", "Средний балл, %", "Усвоили, %", "Статус"],
        cols_tb=["Учебник", "Школ", "Сырой средний, %", "Скорректированный, %", "Эффект vs эталон, п.п. [95% ДИ]"],
        cols_hours=["Тема", "План, ч", "Рекомендация, ч", "Изменение", "Отдача, п.п./ч", "Прогноз усвоения, %"],
        cols_quality=["Задание", "Тема", "Проблема", "Что сделать"],
        cols_schools=["Школа", "Район", "Факт, %", "Ожидалось, %", "Добавленная ценность, п.п.", "Слабые темы"],
        status={"critical": "критично", "risk": "риск", "ok": "норма", "strong": "сильная"},
        method_text=[
            "Усвоение темы — доля верных ответов ученика по заданиям темы; «усвоил» — не менее 60%.",
            "Перед анализом проводится аудит заданий (различающая способность, анализ дистракторов). "
            "Задания с вероятно неверным ключом или случайными ответами исключаются.",
            "Учебники сравниваются регрессией с поправкой на входную диагностику, тип населённого пункта, язык обучения "
            "и фактические часы; стандартные ошибки кластеризованы по школам (учебник выбирает школа).",
            "Отдача от часов оценивается по естественным отклонениям классов от плана: кривая с убывающей отдачей "
            "(логарифм часов) с поправками, сглаживание эмпирическим Байесом, бутстрэп по школам. Перераспределение "
            "ограничено ±30% от плана, чтобы не выходить за пределы наблюдаемых данных.",
            "Ограничения: данные наблюдательные, а не экспериментальные — неучтённые факторы (квалификация учителя, "
            "дополнительные занятия) могут влиять на оценки. Рекомендации стоит проверять пилотом на части школ.",
        ],
        generated="Сформировано", subject="Предмет", students="учеников", schools_n="школ",
        mean="Средний балл", mastered="Доля усвоенных тем", critical="Критичных тем",
        gain="Эффект перераспределения часов в слабых темах", pp="п.п.", avg_all="в среднем по предмету",
        equiv="эквивалентно дополнительным часам", none="Нет",
    ),
    "kz": dict(
        title="Оқу бағдарламасының тиімділігі туралы талдамалық есеп",
        summary="Қысқаша қорытынды", findings="Негізгі қорытындылар мен ұсыныстар", topics="Күрделі тақырыптар",
        textbooks="Оқулықтардың тиімділігі", hours="Сағаттарды бөлу бойынша ұсыныстар",
        quality="Тест материалдарының сапасы", schools="Қолдауды қажет ететін мектептер",
        method="Әдістеме және шектеулер",
        cols_topics=["Тақырып", "Бөлім", "Орташа балл, %", "Меңгерді, %", "Мәртебе"],
        cols_tb=["Оқулық", "Мектеп", "Шикі орташа, %", "Түзетілген, %", "Эталонмен айырма, п.т. [95% СА]"],
        cols_hours=["Тақырып", "Жоспар, сағ", "Ұсыныс, сағ", "Өзгеріс", "Қайтарым, п.т./сағ", "Болжам, %"],
        cols_quality=["Тапсырма", "Тақырып", "Мәселе", "Не істеу керек"],
        cols_schools=["Мектеп", "Аудан", "Нақты, %", "Күтілген, %", "Қосылған құн, п.т.", "Әлсіз тақырыптар"],
        status={"critical": "сыни", "risk": "тәуекел", "ok": "қалыпты", "strong": "күшті"},
        method_text=[
            "Тақырыпты меңгеру — оқушының тақырып тапсырмаларына берген дұрыс жауаптарының үлесі; «меңгерді» — кемінде 60%.",
            "Талдау алдында тапсырмаларға аудит жүргізіледі (айыру қабілеті, дистракторлар талдауы). Кілті қате болуы "
            "мүмкін немесе жауаптары кездейсоқ тапсырмалар алынып тасталады.",
            "Оқулықтар бастапқы диагностика, елді мекен түрі, оқыту тілі және нақты сағаттар ескерілген регрессиямен "
            "салыстырылады; стандартты қателер мектептер бойынша кластерленген.",
            "Сағаттардың қайтарымы сыныптардың жоспардан табиғи ауытқулары бойынша бағаланады: кемімелі қайтарым қисығы, "
            "эмпирикалық Байес, мектептер бойынша бутстрэп. Қайта бөлу жоспардың ±30%-ымен шектелген.",
            "Шектеулер: деректер бақылаулық, эксперименттік емес — ескерілмеген факторлар (мұғалім біліктілігі, қосымша "
            "сабақтар) әсер етуі мүмкін. Ұсыныстарды мектептердің бір бөлігінде пилоттық түрде тексерген жөн.",
        ],
        generated="Құрастырылды", subject="Пән", students="оқушы", schools_n="мектеп",
        mean="Орташа балл", mastered="Меңгерілген тақырыптар үлесі", critical="Сыни тақырыптар",
        gain="Әлсіз тақырыптардағы сағаттарды қайта бөлу әсері", pp="п.т.", avg_all="пән бойынша орташа",
        equiv="қосымша сағатқа тең", none="Жоқ",
    ),
}


def _f(x, nd=1):
    return "—" if x is None else f"{x:.{nd}f}".replace(".", ",")


def build_report(ds, subject_id: str, lang: str = "ru") -> dict:
    lang = "kz" if lang == "kz" else "ru"
    L = T[lang]
    nm = "name_kz" if lang == "kz" else "name"
    subj = ds.subjects.set_index("subject_id").loc[subject_id]
    ov = topics_mod.subject_overview(ds, subject_id)
    tt = topics_mod.topic_table(ds, subject_id)
    tb = textbooks_mod.compare(ds, subject_id)
    hr = hours_mod.optimize(ds, subject_id)
    va = schools_mod.value_added(ds, subject_id)
    aud = items_mod.audit(ds, subject_id)
    ins = insights_mod.build(ds, subject_id)
    titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()

    weak = sorted([t for t in tt if t["status"] in ("critical", "risk")], key=lambda t: t["mean_pct"])
    overall = tb["sections"][0]
    comp = {c["textbook_id"]: c for c in tb["composition"]}
    sections = [
        dict(kind="kpis", title=L["summary"], items=[
            dict(label=L["mean"], value=f"{_f(ov['mean_pct'])}%"),
            dict(label=L["mastered"], value=f"{_f(ov['mastered_share'])}%"),
            dict(label=L["critical"], value=str(ov["critical_topics"])),
            dict(label=L["gain"], value=f"+{_f(hr['weak_topics_gain_pp'], 2)} {L['pp']}",
                 note=f"{L['avg_all']}: +{_f(hr['expected_gain_pp'], 2)} [{_f(hr['gain_ci'][0], 2)}; {_f(hr['gain_ci'][1], 2)}]; "
                      f"{L['equiv']}: +{hr['equivalent_extra_hours'] or '—'}"),
        ]),
        dict(kind="findings", title=L["findings"], items=[
            dict(severity=i["severity"], title=i[f"title_{lang}"], text=i[f"text_{lang}"]) for i in ins]),
        dict(kind="table", title=L["topics"], columns=L["cols_topics"],
             rows=[[t[nm], t["section_kz" if lang == "kz" else "section"], _f(t["mean_pct"]), _f(t["mastered_share"]),
                    L["status"][t["status"]]] for t in weak] or [[L["none"], "", "", "", ""]]),
        dict(kind="table", title=L["textbooks"], columns=L["cols_tb"],
             rows=[[titles.get(b, b), str(comp[b]["n_schools"]), _f(overall["naive"][b]["mean"]),
                    _f(overall["adjusted"][b]["mean"]),
                    ("—" if b == tb["reference"] else
                     f"{_f(overall['adjusted'][b]['effect_vs_ref'])} [{_f(overall['adjusted'][b]['ci'][0])}; {_f(overall['adjusted'][b]['ci'][1])}]")]
                   for b in overall["ranking"]]),
        dict(kind="table", title=L["hours"], columns=L["cols_hours"],
             rows=[[x["name_kz" if lang == "kz" else "name"], str(x["planned"]), str(x["recommended"]),
                    (f"+{x['delta']}" if x["delta"] > 0 else str(x["delta"])), _f(x["marginal_pp_per_hour"], 2),
                    f"{_f(x['predicted_plan'])} → {_f(x['predicted_rec'])}"]
                   for x in hr["topics"] if x["delta"] != 0] or [[L["none"], "", "", "", "", ""]]),
        dict(kind="table", title=L["quality"], columns=L["cols_quality"],
             rows=[[x["item_id"], x["topic_name"], "; ".join(x["flag_labels"]), x["suggestion"] or ""]
                   for x in aud["items"] if x["critical"]] or [[L["none"], "", "", ""]]),
        dict(kind="table", title=L["schools"], columns=L["cols_schools"],
             rows=[[s["name"], s["district"], _f(s["actual"]), _f(s["expected"]), _f(s["value_added"]),
                    ", ".join(w["name"] for w in s["weak_topics"])]
                   for s in reversed([s for s in va["schools"] if s["category"] == "below"])][:10]
             or [[L["none"], "", "", "", "", ""]]),
        dict(kind="list", title=L["method"], items=L["method_text"]),
    ]
    return dict(
        title=L["title"], subject=subj.get("name_kz" if lang == "kz" else "name", subj["name"]),
        grade=int(subj.get("grade", 0) or 0), lang=lang,
        meta=f"{L['generated']}: {dt.date.today().strftime('%d.%m.%Y')} · {ov['n_students']} {L['students']} · "
             f"{ov['n_schools']} {L['schools_n']}",
        source=ds.source, sections=sections,
    )


TS = {
    "ru": dict(title="Карточка школы", summary="Итоги", focus="Темы-приоритеты на следующую четверть",
               strengths="Сильные стороны", topics="Темы: школа и регион", hours="Рекомендации по часам для учебника",
               risk="Ученики в зоне риска", how="Как читать карточку",
               cols_topics=["Тема", "Школа, %", "Регион, %", "Разница, п.п."],
               cols_hours=["Тема", "План, ч", "Рекомендация, ч"],
               cols_risk=["Главный пробел (базовая тема)", "Учеников"],
               k_actual="Средний балл", k_expected="Ожидалось для такого состава", k_va="Добавленная ценность",
               k_rank="Честное место", k_risk="В зоне риска", of="из",
               how_text=["«Ожидалось» — прогноз для учеников с таким же входным уровнем, языком обучения, типом школы и учебником.",
                         "«Добавленная ценность» — насколько школа лучше или хуже этого прогноза; это честнее, чем сравнивать средние баллы.",
                         "Список учеников в зоне риска доступен в платформе (анонимные ID): для каждого указана тема и причина."]),
    "kz": dict(title="Мектеп картасы", summary="Қорытынды", focus="Келесі тоқсандағы басым тақырыптар",
               strengths="Күшті жақтары", topics="Тақырыптар: мектеп және аймақ", hours="Оқулық бойынша сағат ұсыныстары",
               risk="Тәуекел аймағындағы оқушылар", how="Картаны қалай оқу керек",
               cols_topics=["Тақырып", "Мектеп, %", "Аймақ, %", "Айырма, п.т."],
               cols_hours=["Тақырып", "Жоспар, сағ", "Ұсыныс, сағ"],
               cols_risk=["Негізгі олқылық (базалық тақырып)", "Оқушылар"],
               k_actual="Орташа балл", k_expected="Осындай құрам үшін күтілген", k_va="Қосылған құн",
               k_rank="Әділ орын", k_risk="Тәуекел аймағында", of="/",
               how_text=["«Күтілген» — бастапқы деңгейі, оқыту тілі, мектеп түрі және оқулығы бірдей оқушыларға болжам.",
                         "«Қосылған құн» — мектеп осы болжамнан қаншалықты жақсы не нашар; бұл орташа балдарды салыстырудан әділ.",
                         "Тәуекел аймағындағы оқушылар тізімі платформада қолжетімді (анонимді ID)."]),
}


def build_school_report(ds, subject_id: str, school_id: str, lang: str = "ru") -> dict:
    from .analytics import risk as risk_mod
    lang = "kz" if lang == "kz" else "ru"
    L = TS[lang]
    kz = lang == "kz"
    subj = ds.subjects.set_index("subject_id").loc[subject_id]
    va_all = schools_mod.value_added(ds, subject_id)
    sch = next(s for s in va_all["schools"] if s["school_id"] == school_id)
    region = {t["topic_id"]: t for t in topics_mod.topic_table(ds, subject_id)}
    mine = topics_mod.topic_table(ds, subject_id, {"school_id": school_id})
    rows = sorted([(t, t["mean_pct"] - region[t["topic_id"]]["mean_pct"]) for t in mine], key=lambda x: x[1])
    hrs = hours_mod.optimize(ds, subject_id, filters={"textbook_id": sch["textbook_id"]})
    rk = risk_mod.school_risk(ds, subject_id, school_id)
    titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()
    nm = "name_kz" if kz else "name"
    focus = [dict(severity="warning", title=t[nm], text=(f"Мектеп {_f(t['mean_pct'])}%, аймақ {_f(region[t['topic_id']]['mean_pct'])}% "
                                                          f"({_f(g)} п.т.)" if kz else
                                                          f"Школа {_f(t['mean_pct'])}%, регион {_f(region[t['topic_id']]['mean_pct'])}% ({_f(g)} п.п.)"))
             for t, g in rows[:3] if g < 0]
    strengths = [dict(severity="positive", title=t[nm], text=f"+{_f(g)} {'п.т.' if kz else 'п.п.'}") for t, g in rows[::-1][:3] if g > 0]
    sections = [
        dict(kind="kpis", title=L["summary"], items=[
            dict(label=L["k_actual"], value=f"{_f(sch['actual'])}%"),
            dict(label=L["k_expected"], value=f"{_f(sch['expected'])}%"),
            dict(label=L["k_va"], value=f"{'+' if (sch['value_added'] or 0) > 0 else ''}{_f(sch['value_added'])} {'п.т.' if kz else 'п.п.'}"),
            dict(label=L["k_rank"], value=f"{sch['rank']} {L['of']} {len(va_all['schools'])}",
                 note=f"{L['k_risk']}: {rk['n_at_risk']} {L['of']} {rk['n_students']}"),
        ]),
        dict(kind="findings", title=L["focus"], items=focus or [dict(severity="positive", title="—", text="")]),
        dict(kind="findings", title=L["strengths"], items=strengths or [dict(severity="info", title="—", text="")]),
        dict(kind="table", title=L["topics"], columns=L["cols_topics"],
             rows=[[t[nm], _f(t["mean_pct"]), _f(region[t["topic_id"]]["mean_pct"]), f"{'+' if g > 0 else ''}{_f(g)}"]
                   for t, g in sorted(rows, key=lambda x: region[x[0]["topic_id"]]["order"])]),
        dict(kind="table", title=f"{L['hours']} «{titles.get(sch['textbook_id'])}»", columns=L["cols_hours"],
             rows=[[x["name_kz" if kz else "name"], str(x["planned"]), f"{x['recommended']} ({'+' if x['delta'] > 0 else ''}{x['delta']})"]
                   for x in hrs["topics"] if x["delta"]]),
        dict(kind="table", title=f"{L['risk']}: {rk['n_at_risk']} {L['of']} {rk['n_students']}", columns=L["cols_risk"],
             rows=[[c["cause_name_kz" if kz else "cause_name"], str(c["students"])] for c in rk["top_causes"]] or [["—", ""]]),
        dict(kind="list", title=L["how"], items=L["how_text"]),
    ]
    loc = {"urban": "қала" if kz else "город", "rural": "ауыл" if kz else "село"}.get(sch["locality"], sch["locality"])
    return dict(title=f"{L['title']}: {sch['name']}",
                subject=subj.get("name_kz" if kz else "name", subj["name"]), grade=int(subj.get("grade", 0) or 0), lang=lang,
                meta=f"{sch['district']} · {loc} · {titles.get(sch['textbook_id'])} · {sch['n_students']} "
                     f"{'оқушы' if kz else 'учеников'} · {dt.date.today().strftime('%d.%m.%Y')}",
                source=ds.source, sections=sections)
