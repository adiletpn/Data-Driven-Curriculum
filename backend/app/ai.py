"""AI assistant for methodologists: answers questions strictly from computed analytics.

Uses Claude (Anthropic SDK) when credentials are configured (ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN).
Without credentials it falls back to an offline rule-based answer built from the findings engine,
so the product never depends on an external service.
"""
from __future__ import annotations

import json
import os
import re

from .analytics import hours as hours_mod
from .analytics import insights as insights_mod
from .analytics import items as items_mod
from .analytics import schools as schools_mod
from .analytics import textbooks as textbooks_mod
from .analytics import topics as topics_mod

MODEL = "claude-opus-5-5"


def _load_env_file():
    """Minimal .env loader (backend/.env), so keys never live in the code or git."""
    from pathlib import Path
    f = Path(__file__).resolve().parents[1] / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


_load_env_file()


def provider() -> str | None:
    """'openai' — any OpenAI-compatible API (e.g. xciro): needs XCIRO_API_KEY + XCIRO_BASE_URL + XCIRO_MODEL;
    'claude' — Anthropic API; None — offline mode."""
    if os.environ.get("XCIRO_API_KEY") and os.environ.get("XCIRO_BASE_URL") and os.environ.get("XCIRO_MODEL"):
        return "openai"
    if os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN"):
        return "claude"
    return None


def available() -> bool:
    return provider() is not None


def _ask_openai_compatible(system: str, messages: list[dict]) -> str:
    import httpx
    base = os.environ["XCIRO_BASE_URL"].rstrip("/")
    r = httpx.post(f"{base}/chat/completions", timeout=90,
                   headers={"Authorization": f"Bearer {os.environ['XCIRO_API_KEY']}"},
                   json={"model": os.environ["XCIRO_MODEL"], "temperature": 0.2, "max_tokens": 2000,
                         "messages": [{"role": "system", "content": system}] + messages})
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"].strip()


def _context(ds, subject_id: str) -> dict:
    """Compact, deterministic snapshot of the analytics (kept stable for prompt caching)."""
    def build():
        subj = ds.subjects.set_index("subject_id").loc[subject_id]
        tt = topics_mod.topic_table(ds, subject_id)
        tb = textbooks_mod.compare(ds, subject_id)
        hr = hours_mod.optimize(ds, subject_id)
        va = schools_mod.value_added(ds, subject_id)
        aud = items_mod.audit(ds, subject_id)
        titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()
        return dict(
            subject=dict(id=subject_id, name=subj["name"], grade=int(subj.get("grade", 0) or 0)),
            overview=topics_mod.subject_overview(ds, subject_id),
            topics=[dict(id=t["topic_id"], name=t["name"], section=t["section"], mean_pct=t["mean_pct"],
                         ci=t["ci"], mastered_pct=t["mastered_share"], status=t["status"],
                         planned_hours=t["planned_hours"], by_locality=t["by"].get("locality"),
                         by_language=t["by"].get("language")) for t in tt],
            textbooks=dict(
                titles=titles,
                composition=tb["composition"],
                sections=[dict(section=s["name"], naive=s["naive"], adjusted=s["adjusted"], best=s["best"],
                               best_significant=s["best_significant"], simpson=s["simpson"],
                               pairs=s["pairs"]) for s in tb["sections"]],
                heterogeneity=tb["heterogeneity"], profiles=tb["profiles"]),
            hours=dict(expected_gain_pp=hr["expected_gain_pp"], gain_ci=hr["gain_ci"],
                       equivalent_extra_hours=hr["equivalent_extra_hours"],
                       topics=[dict(id=x["topic_id"], name=x["name"], planned=x["planned"], recommended=x["recommended"],
                                    marginal_pp_per_hour=x["marginal_pp_per_hour"], reasons=x["reasons"])
                               for x in hr["topics"]]),
            schools=dict(below=[dict(name=s["name"], district=s["district"], value_added=s["value_added"],
                                     weak_topics=s["weak_topics"]) for s in va["schools"] if s["category"] == "below"],
                         above=[dict(name=s["name"], district=s["district"], value_added=s["value_added"])
                                for s in va["schools"] if s["category"] == "above"],
                         districts=va["districts"]),
            defective_items=[dict(id=x["item_id"], topic=x["topic_name"], flags=x["flag_labels"], suggestion=x["suggestion"])
                             for x in aud["items"] if x["critical"]],
            key_findings=[dict(title=i["title_ru"], text=i["text_ru"]) for i in insights_mod.build(ds, subject_id)],
        )
    return ds.cached(("ai_context", subject_id), build)


SYSTEM = """Ты — аналитик-ассистент EdTech-платформы «Data-Driven Curriculum» для методистов отдела образования.
Отвечай ТОЛЬКО на основе JSON с результатами анализа ниже. Правила:
- Каждое утверждение подкрепляй числом из данных (проценты, п.п., доверительные интервалы, число школ).
- Если данных для ответа нет — прямо скажи об этом и предложи, какие данные нужно собрать. Ничего не выдумывай.
- Различай «наивные» средние и скорректированные оценки; для сравнения учебников используй скорректированные.
- Если эффект статистически не подтверждён (доверительный интервал включает 0) — так и скажи.
- Давай практические рекомендации методисту: что сделать, в какой теме/школе, с каким ожидаемым эффектом.
- Пиши кратко и структурно (3–8 пунктов), без воды. Термины объясняй простыми словами.
- Язык ответа: {lang}.
Обозначения: п.п. — процентные пункты; mastered_pct — доля учеников, усвоивших тему (≥60% заданий);
marginal_pp_per_hour — прирост усвоения темы от одного дополнительного часа.

ДАННЫЕ АНАЛИЗА:
{data}"""


def _offline(ds, subject_id: str, question: str, lang: str) -> dict:
    q = question.lower()
    routes = [
        (r"учеб|оқулық|книг|издател", "textbooks"),
        (r"час|сағат|время|уақыт|распредел|бөл", "hours"),
        (r"школ|мектеп|район|аудан", "schools"),
        (r"тест|задан|тапсырма|ключ|кілт|вопрос", "quality"),
        (r"село|ауыл|город|қала|язык|тіл|равен", "equity"),
        (r"связ|причин|себеп|граф|пререкв|база", "graph"),
        (r"тем|тақырып|сложн|қиын|слаб|әлсіз", "topics"),
    ]
    cats = [c for pat, c in routes if re.search(pat, q)] or ["topics", "textbooks", "hours"]
    found = [i for i in insights_mod.build(ds, subject_id) if i["category"] in cats]
    if not found:
        found = insights_mod.build(ds, subject_id)[:3]
    key_t, key_x = ("title_kz", "text_kz") if lang == "kz" else ("title_ru", "text_ru")
    head = ("Офлайн-режим: ответ собран из автоматических выводов платформы." if lang != "kz"
            else "Офлайн режим: жауап платформаның автоматты қорытындыларынан құрастырылды.")
    body = "\n\n".join(f"**{i[key_t]}**\n{i[key_x]}" for i in found[:4])
    return dict(answer=f"{head}\n\n{body}", mode="offline", sources=[i["id"] for i in found[:4]])


def answer(ds, subject_id: str, question: str, lang: str = "ru", history: list[dict] | None = None) -> dict:
    question = (question or "").strip()[:2000]
    if not question:
        return dict(answer="", mode="empty", sources=[])
    if not available():
        return _offline(ds, subject_id, question, lang)

    data = json.dumps(_context(ds, subject_id), ensure_ascii=False, sort_keys=True, default=str)
    system = SYSTEM.format(lang="казахский" if lang == "kz" else "русский", data=data)
    messages = []
    for h in (history or [])[-6:]:
        if h.get("role") in ("user", "assistant") and isinstance(h.get("content"), str) and h["content"].strip():
            messages.append({"role": h["role"], "content": h["content"][:4000]})
    messages.append({"role": "user", "content": question})
    # the API requires alternating roles starting with "user"
    while messages and messages[0]["role"] != "user":
        messages.pop(0)

    if provider() == "openai":
        try:
            text = _ask_openai_compatible(system, messages)
            return dict(answer=text, mode="llm", model=os.environ["XCIRO_MODEL"], sources=[])
        except Exception as e:  # network/quota/format errors -> never break the page
            out = _offline(ds, subject_id, question, lang)
            out["notice"] = f"llm_error: {type(e).__name__}"
            return out

    import anthropic

    client = anthropic.Anthropic()
    try:
        resp = client.beta.messages.create(
            model=MODEL,
            max_tokens=4000,
            system=system,
            messages=messages,
            cache_control={"type": "ephemeral"},     # the analytics snapshot is reused across questions
            output_config={"effort": "medium"},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",                       # server-side fallback if the request is declined
        )
    except anthropic.RateLimitError:
        out = _offline(ds, subject_id, question, lang)
        out["notice"] = "rate_limited"
        return out
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        out = _offline(ds, subject_id, question, lang)
        out["notice"] = f"api_error: {type(e).__name__}"
        return out

    if resp.stop_reason == "refusal":
        out = _offline(ds, subject_id, question, lang)
        out["notice"] = "refusal"
        return out
    text = "".join(b.text for b in resp.content if b.type == "text").strip()
    return dict(answer=text, mode="claude", model=resp.model, sources=[])
