"""Key findings engine: turns analytics into prioritized, bilingual, evidence-backed statements."""
from __future__ import annotations

from .hours import optimize
from .items import audit
from .prerequisites import analyze as prereq
from .schools import equity, value_added
from .textbooks import compare
from .topics import topic_table

SEVERITY_ORDER = {"critical": 0, "warning": 1, "positive": 2, "info": 3}


def _f(x, nd=1):
    if x is None:
        return "—"
    return f"{x:.{nd}f}".replace(".", ",")


def _tb_title(ds, tb):
    t = ds.textbooks.set_index("textbook_id")
    return t.loc[tb, "title"] if tb in t.index else tb


def build(ds, subject_id: str) -> list[dict]:
    def make():
        out = []

        def add(**kw):
            kw.setdefault("severity", "info")
            out.append(kw)

        topics = topic_table(ds, subject_id)
        tmap = {t["topic_id"]: t for t in topics}

        # 1. hardest topics
        crit = sorted([t for t in topics if t["status"] == "critical"], key=lambda x: x["mastered_share"])
        if crit:
            names = ", ".join(f"«{t['name']}» ({_f(t['mastered_share'], 0)}%)" for t in crit[:3])
            names_kz = ", ".join(f"«{t['name_kz']}» ({_f(t['mastered_share'], 0)}%)" for t in crit[:3])
            n_students = sum(t["not_mastered_students"] for t in crit)
            add(id="critical_topics", category="topics", severity="critical", link="/topics",
                title_ru=f"{len(crit)} тем(ы) в критической зоне",
                title_kz=f"{len(crit)} тақырып сыни аймақта",
                text_ru=f"Меньше половины учеников усвоили: {names}. Это {n_students} случаев неусвоения.",
                text_kz=f"Оқушылардың жартысынан азы меңгерген: {names_kz}. Барлығы {n_students} меңгермеу жағдайы.",
                evidence=[dict(topic_id=t["topic_id"], mastered_share=t["mastered_share"], ci=t["ci"]) for t in crit])

        # 2. root causes in the knowledge graph
        pr = prereq(ds, subject_id)
        for rc in pr["root_causes"][:2]:
            a, b = tmap.get(rc["root_id"], {}), tmap.get(rc["topic_id"], {})
            add(id=f"root_{rc['root_id']}_{rc['topic_id']}", category="graph", severity="warning", link="/graph",
                title_ru=f"Корень проблемы «{b.get('name')}» — в теме «{a.get('name')}»",
                title_kz=f"«{b.get('name_kz')}» мәселесінің түбірі — «{a.get('name_kz')}» тақырыбында",
                text_ru=(f"Ученики одного общего уровня, усвоившие «{a.get('name')}», решают «{b.get('name')}» "
                         f"на {_f(rc['adjusted_gap'])} п.п. лучше. Не усвоили базовую тему {_f(rc['root_not_mastered'], 0)}% учеников — "
                         f"начинать нужно с неё."),
                text_kz=(f"Жалпы деңгейі бірдей, «{a.get('name_kz')}» тақырыбын меңгерген оқушылар «{b.get('name_kz')}» "
                         f"тақырыбын {_f(rc['adjusted_gap'])} п.т. жақсы орындайды. Негізгі тақырыпты оқушылардың "
                         f"{_f(rc['root_not_mastered'], 0)}%-ы меңгермеген — содан бастау керек."),
                evidence=rc)
        for e in pr["nominal"][:1]:
            a, b = tmap.get(e["prereq_id"], {}), tmap.get(e["topic_id"], {})
            add(id=f"nominal_{e['prereq_id']}_{e['topic_id']}", category="graph", severity="info", link="/graph",
                title_ru="Формальная связь тем не подтверждается данными",
                title_kz="Тақырыптардың формалды байланысы деректермен расталмайды",
                text_ru=(f"В программе «{a.get('name')}» указана как основа для «{b.get('name')}», но при равном общем уровне "
                         f"её знание почти не влияет на результат (частная корреляция {_f(e['partial_corr'], 2)}). "
                         f"Порядок изучения можно сделать гибче."),
                text_kz=(f"Бағдарламада «{a.get('name_kz')}» «{b.get('name_kz')}» үшін негіз ретінде көрсетілген, бірақ "
                         f"жалпы деңгей бірдей болғанда оның әсері шамалы (жартылай корреляция {_f(e['partial_corr'], 2)}). "
                         f"Оқу ретін икемдірек етуге болады."),
                evidence=e)

        # 3. textbooks
        tb = compare(ds, subject_id)
        overall = tb["sections"][0]
        best = overall["best"]
        if overall["simpson"]:
            nb = overall["naive_ranking"][0]
            comp = {c["textbook_id"]: c for c in tb["composition"]}
            cn, cb = comp.get(nb, {}), comp.get(best, {})
            why_ru, why_kz = [], []
            if (cn.get("baseline_mean") or 0) > (cb.get("baseline_mean") or 0) + 1:
                why_ru.append(f"входной балл {_f(cn['baseline_mean'])} против {_f(cb['baseline_mean'])}")
                why_kz.append(f"бастапқы балл {_f(cn['baseline_mean'])}, ал екіншісінде {_f(cb['baseline_mean'])}")
            if (cn.get("rural_share") or 0) + 10 < (cb.get("rural_share") or 0):
                why_ru.append(f"сельских школ {_f(cn['rural_share'], 0)}% против {_f(cb['rural_share'], 0)}%")
                why_kz.append(f"ауыл мектептері {_f(cn['rural_share'], 0)}%, ал екіншісінде {_f(cb['rural_share'], 0)}%")
            reason_ru = ("у его школ более сильный контингент (" + ", ".join(why_ru) + ")") if why_ru else "контингент его школ отличается"
            reason_kz = ("оның мектептерінің контингенті күштірек (" + ", ".join(why_kz) + ")") if why_kz else "оның мектептерінің контингенті өзгеше"
            add(id="simpson", category="textbooks", severity="critical", link="/textbooks",
                title_ru="Простое сравнение средних баллов вводит в заблуждение",
                title_kz="Орташа балдарды жай салыстыру адастырады",
                text_ru=(f"По «сырым» средним лучшим выглядит «{_tb_title(ds, nb)}», но {reason_ru}. "
                         f"После учёта входного уровня, типа школы и языка обучения лучший результат даёт «{_tb_title(ds, best)}»."),
                text_kz=(f"«Шикі» орташа бойынша «{_tb_title(ds, nb)}» үздік болып көрінеді, бірақ {reason_kz}. Бастапқы деңгей, мектеп түрі және оқыту тілі ескерілгенде ең жақсы нәтижені "
                         f"«{_tb_title(ds, best)}» береді."),
                evidence=dict(naive=overall["naive"], adjusted=overall["adjusted"]))
        if overall["best_significant"]:
            diffs = [p for p in overall["pairs"] if best in (p["a"], p["b"])]
            m = min(abs(p["diff"]) for p in diffs)
            add(id="best_textbook", category="textbooks", severity="positive", link="/textbooks",
                title_ru=f"«{_tb_title(ds, best)}» — статистически лучший учебник",
                title_kz=f"«{_tb_title(ds, best)}» — статистикалық тұрғыдан ең тиімді оқулық",
                text_ru=f"Преимущество не меньше {_f(m)} п.п. при сопоставимых учениках и школах (p < 0,05).",
                text_kz=f"Салыстырмалы оқушылар мен мектептерде артықшылығы кемінде {_f(m)} п.т. (p < 0,05).",
                evidence=overall["pairs"])
        for sec in tb["sections"][1:]:
            sig = [p for p in sec["pairs"] if p["p"] is not None and p["p"] < 0.01 and abs(p["diff"]) >= 6]
            if sig and sec["best"] != best:
                add(id=f"section_{sec['section']}", category="textbooks", severity="info", link="/textbooks",
                    title_ru=f"Раздел «{sec['name']}»: сильнее «{_tb_title(ds, sec['best'])}»",
                    title_kz=f"«{sec['name_kz']}» бөлімі: «{_tb_title(ds, sec['best'])}» күштірек",
                    text_ru=f"Даже если основной учебник другой, материалы этого раздела стоит брать из «{_tb_title(ds, sec['best'])}».",
                    text_kz=f"Негізгі оқулық басқа болса да, бұл бөлімнің материалдарын «{_tb_title(ds, sec['best'])}» оқулығынан алған жөн.",
                    evidence=sec["adjusted"])
        weak_sections = []
        for sec in tb["sections"][1:]:
            for p in sec["pairs"]:
                if p["p"] is not None and p["p"] < 0.01 and abs(p["diff"]) >= 8:
                    loser = p["b"] if p["diff"] > 0 else p["a"]
                    weak_sections.append((sec, loser, abs(p["diff"])))
        for sec, loser, d in sorted(weak_sections, key=lambda x: -x[2])[:1]:
            add(id=f"weak_section_{loser}", category="textbooks", severity="warning", link="/textbooks",
                title_ru=f"Слабое место «{_tb_title(ds, loser)}» — раздел «{sec['name']}»",
                title_kz=f"«{_tb_title(ds, loser)}» оқулығының әлсіз тұсы — «{sec['name_kz']}» бөлімі",
                text_ru=f"Отставание до {_f(d)} п.п. Школам на этом учебнике нужны дополнительные материалы по разделу.",
                text_kz=f"Артта қалу {_f(d)} п.т. дейін. Бұл оқулықпен оқитын мектептерге бөлім бойынша қосымша материал қажет.",
                evidence=sec["adjusted"])
        for h in tb["heterogeneity"]:
            if h["dimension"] == "language" and h["p_interaction"] is not None and h["p_interaction"] < 0.05:
                kz = h["groups"].get("kz", {})
                ru = h["groups"].get("ru", {})
                ref = tb["reference"]
                worst, worst_gap = None, 0
                for b in tb["textbooks"]:
                    if b in kz and b in ru and kz[b]["adjusted"] is not None and ru[b]["adjusted"] is not None:
                        rel_kz = kz[b]["adjusted"] - max(v["adjusted"] or 0 for v in kz.values())
                        rel_ru = ru[b]["adjusted"] - max(v["adjusted"] or 0 for v in ru.values())
                        if rel_kz - rel_ru < worst_gap:
                            worst, worst_gap = b, rel_kz - rel_ru
                if worst:
                    add(id="language_gap", category="textbooks", severity="critical", link="/textbooks",
                        title_ru=f"Казахскоязычная версия «{_tb_title(ds, worst)}» работает хуже русскоязычной",
                        title_kz=f"«{_tb_title(ds, worst)}» оқулығының қазақ тіліндегі нұсқасы орыс тіліндегіден нашар",
                        text_ru=(f"В казахскоязычных школах учебник отстаёт от лидера на {_f(abs(worst_gap))} п.п. больше, чем в "
                                 f"русскоязычных (p = {_f(h['p_interaction'], 3)}). Рекомендуем экспертизу перевода и терминологии."),
                        text_kz=(f"Қазақ тілінде оқытатын мектептерде оқулық көшбасшыдан орыс тіліндегі мектептерге қарағанда "
                                 f"{_f(abs(worst_gap))} п.т. көбірек қалады (p = {_f(h['p_interaction'], 3)}). Аударма мен "
                                 f"терминологияға сараптама жүргізу ұсынылады."),
                        evidence=h)
        for c in tb["composition"]:
            if c["low_power"]:
                add(id=f"low_power_{c['textbook_id']}", category="textbooks", severity="info", link="/textbooks",
                    title_ru=f"Мало данных по «{c['title']}»", title_kz=f"«{c['title']}» бойынша деректер аз",
                    text_ru=f"Учебник используют только {c['n_schools']} школ(ы) — выводы по нему предварительные.",
                    text_kz=f"Оқулықты тек {c['n_schools']} мектеп пайдаланады — қорытындылар алдын ала сипатта.",
                    evidence=c)

        # 4. hours
        opt = optimize(ds, subject_id)
        inc = [x for x in opt["topics"] if x["delta"] > 0]
        dec = [x for x in opt["topics"] if x["delta"] < 0]
        if inc:
            top = sorted(inc, key=lambda x: -x["predicted_change"])[:3]
            add(id="hours_increase", category="hours", severity="warning", link="/hours",
                title_ru="Часы нужно перенести в сложные темы",
                title_kz="Сағаттарды күрделі тақырыптарға ауыстыру керек",
                text_ru=("Наибольшая отдача от дополнительного часа: " +
                         ", ".join(f"«{x['name']}» (+{x['delta']} ч → +{_f(x['predicted_change'])} п.п.)" for x in top) +
                         f". Перераспределение {opt['hours_moved']} ч без увеличения нагрузки даёт эффект, сопоставимый с "
                         f"+{opt['equivalent_extra_hours'] or '—'} ч дополнительного времени."),
                text_kz=("Қосымша сағаттың ең жоғары қайтарымы: " +
                         ", ".join(f"«{x['name_kz']}» (+{x['delta']} сағ → +{_f(x['predicted_change'])} п.т.)" for x in top) +
                         f". Жүктемені арттырмай {opt['hours_moved']} сағатты қайта бөлу +{opt['equivalent_extra_hours'] or '—'} "
                         f"қосымша сағатқа тең әсер береді."),
                evidence=dict(gain=opt["expected_gain_pp"], ci=opt["gain_ci"], topics=[x["topic_id"] for x in inc]))
        root_of = {rc["topic_id"]: rc for rc in pr["root_causes"]}
        trap = [x for x in opt["topics"] if x["status"] in ("critical", "risk") and x["delta"] <= 0
                and x["topic_id"] in root_of and (x["marginal_pp_per_hour"] or 0) < 1.0]
        for x in trap[:2]:
            rc = root_of[x["topic_id"]]
            add(id=f"hours_trap_{x['topic_id']}", category="hours", severity="warning", link="/hours",
                title_ru=f"«{x['name']}»: дополнительные часы не помогут",
                title_kz=f"«{x['name_kz']}»: қосымша сағат көмектеспейді",
                text_ru=(f"Тема слабая ({_f(x['mean_pct'], 0)}%), но классы, которые тратили на неё больше времени, почти не выигрывают "
                         f"({_f(x['marginal_pp_per_hour'], 2)} п.п./ч). Причина — базовая тема «{rc['root_name']}»: "
                         f"вкладывайтесь в неё."),
                text_kz=(f"Тақырып әлсіз ({_f(x['mean_pct'], 0)}%), бірақ оған көбірек уақыт бөлген сыныптар ұтпайды "
                         f"({_f(x['marginal_pp_per_hour'], 2)} п.т./сағ). Себебі — «{tmap.get(rc['root_id'], {}).get('name_kz', rc['root_name'])}» "
                         f"базалық тақырыбы: соған көңіл бөліңіз."),
                evidence=dict(topic=x["topic_id"], root=rc["root_id"], marginal=x["marginal_pp_per_hour"]))
        sat = [x for x in dec if "saturated" in x["reasons"]]
        if sat:
            add(id="hours_saturated", category="hours", severity="info", link="/hours",
                title_ru="Есть темы с «насыщением»: лишние часы почти не дают результата",
                title_kz="«Қанығу» байқалатын тақырыптар бар: артық сағат нәтиже бермейді",
                text_ru=", ".join(f"«{x['name']}» ({_f(x['marginal_pp_per_hour'], 2)} п.п./ч, усвоение {_f(x['mean_pct'], 0)}%)" for x in sat) +
                        " — часть времени можно безопасно перенести.",
                text_kz=", ".join(f"«{x['name_kz']}» ({_f(x['marginal_pp_per_hour'], 2)} п.т./сағ, меңгеру {_f(x['mean_pct'], 0)}%)" for x in sat) +
                        " — уақыттың бір бөлігін қауіпсіз ауыстыруға болады.",
                evidence=[x["topic_id"] for x in sat])

        # 5. test quality
        a = audit(ds, subject_id)
        bad = [x for x in a["items"] if x["critical"]]
        if bad:
            wk = [x for x in bad if "wrong_key" in x["flags"]]
            add(id="bad_items", category="quality", severity="warning", link="/quality",
                title_ru=f"{len(bad)} дефектных заданий исключены из анализа",
                title_kz=f"{len(bad)} ақаулы тапсырма талдаудан алынып тасталды",
                text_ru=(f"Из них {len(wk)} с вероятно неверным ключом ({', '.join(x['item_id'] for x in wk) or '—'}). "
                         "Без этой проверки сложность тем была бы искажена."),
                text_kz=(f"Оның ішінде {len(wk)} тапсырманың жауап кілті қате болуы мүмкін ({', '.join(x['item_id'] for x in wk) or '—'}). "
                         "Бұл тексеріссіз тақырыптардың күрделілігі бұрмаланар еді."),
                evidence=[x["item_id"] for x in bad])

        # 6. equity
        for e in equity(ds, subject_id):
            if e["dimension"] == "locality" and e["mean_raw_gap"] is not None and e["mean_raw_gap"] < -3:
                add(id="rural_gap", category="equity", severity="warning", link="/equity",
                    title_ru=f"Разрыв город–село: {_f(abs(e['mean_raw_gap']))} п.п.",
                    title_kz=f"Қала мен ауыл арасындағы алшақтық: {_f(abs(e['mean_raw_gap']))} п.т.",
                    text_ru="Наибольший разрыв в темах: " + ", ".join(tmap[t]["name"] for t in e["widest"] if t in tmap) + ".",
                    text_kz="Ең үлкен алшақтық тақырыптары: " + ", ".join(tmap[t]["name_kz"] for t in e["widest"] if t in tmap) + ".",
                    evidence=e)

        # 7. schools
        va = value_added(ds, subject_id)
        if va["n_below"]:
            below = [s for s in va["schools"] if s["category"] == "below"][-3:]
            above = [s for s in va["schools"] if s["category"] == "above"][:3]
            add(id="schools_support", category="schools", severity="warning", link="/schools",
                title_ru=f"{va['n_below']} школ работают ниже ожидаемого уровня",
                title_kz=f"{va['n_below']} мектеп күтілген деңгейден төмен",
                text_ru=("С учётом контингента учеников, учебника и типа школы. Приоритет методической поддержки: " +
                         ", ".join(s["name"] for s in below) + ". Перенимать опыт: " + ", ".join(s["name"] for s in above) + "."),
                text_kz=("Оқушылар құрамы, оқулық және мектеп түрі ескерілген. Әдістемелік қолдау басымдығы: " +
                         ", ".join(s["name"] for s in below) + ". Тәжірибе алмасу: " + ", ".join(s["name"] for s in above) + "."),
                evidence=dict(below=[s["school_id"] for s in below], above=[s["school_id"] for s in above]))
            if va["rank_shifts"]:
                add(id="ranking_shift", category="schools", severity="info", link="/schools",
                    title_ru="Честный рейтинг школ отличается от рейтинга по среднему баллу",
                    title_kz="Мектептердің әділ рейтингі орташа балл рейтингінен өзгеше",
                    text_ru=f"{va['rank_shifts']} школ сдвигаются более чем на четверть списка, если учесть стартовый уровень учеников.",
                    text_kz=f"Оқушылардың бастапқы деңгейі ескерілсе, {va['rank_shifts']} мектеп тізімнің төрттен бірінен астам орынға жылжиды.",
                    evidence=va["rank_shifts"])

        out.sort(key=lambda x: SEVERITY_ORDER.get(x["severity"], 9))
        return out

    return ds.cached(("insights", subject_id), make)
