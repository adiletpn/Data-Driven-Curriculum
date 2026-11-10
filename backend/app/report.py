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
        gain="Ожидаемый эффект перераспределения часов", gain_unit="п.п. к среднему усвоению",
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
        gain="Сағаттарды қайта бөлудің күтілетін әсері", gain_unit="п.т. орташа меңгеруге",
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
            dict(label=L["gain"], value=f"+{_f(hr['expected_gain_pp'], 2)} {L['gain_unit']}",
                 note=f"95%: [{_f(hr['gain_ci'][0], 2)}; {_f(hr['gain_ci'][1], 2)}]; {L['equiv']}: +{hr['equivalent_extra_hours'] or '—'}"),
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
