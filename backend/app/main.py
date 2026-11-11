"""FastAPI application: REST API for the analytics + static frontend."""
from __future__ import annotations

import io
import math
from contextlib import asynccontextmanager
import threading
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import Depends, FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel

from .analytics import hours as hours_mod
from .analytics import insights as insights_mod
from .analytics import items as items_mod
from .analytics import prerequisites as prereq_mod
from .analytics import schools as schools_mod
from .analytics import textbooks as textbooks_mod
from .analytics import topics as topics_mod
from .analytics import validation as validation_mod
from .analytics import pilot as pilot_mod
from .analytics import risk as risk_mod
from .analytics import switching as switching_mod
from . import lesson as lesson_mod
from .data.store import OPTIONAL_SCHEMA, SCHEMA, TABLE_DESCRIPTIONS, store
from .report import build_report
from .auth import ANY, REGION, login as auth_login, require

@asynccontextmanager
async def lifespan(_app: FastAPI):
    _warmup_async()  # precompute analytics in the background so the first page loads fast
    yield


app = FastAPI(title="Data-Driven Curriculum API", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


@app.exception_handler(Exception)
async def _analysis_error(_request, exc: Exception):
    """Never return a bare 500: explain what went wrong (usually not enough data in a slice)."""
    return JSONResponse(status_code=422, content={
        "detail": f"Не удалось выполнить анализ для этих данных: {type(exc).__name__}: {exc}. "
                  f"Чаще всего причина — слишком мало данных в выбранном срезе."})


def clean(obj):
    """Make analytics output JSON-safe (numpy scalars, NaN -> None)."""
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple, set)):
        return [clean(v) for v in obj]
    if isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating, float)):
        f = float(obj)
        return None if math.isnan(f) or math.isinf(f) else f
    if isinstance(obj, pd.Timestamp):
        return obj.isoformat()
    return obj


def ok(data):
    return JSONResponse(clean(data))


def _subject(subject: str | None) -> str:
    ds = store.get()
    ids = list(ds.subjects["subject_id"])
    if subject is None:
        return ids[0]
    if subject not in ids:
        raise HTTPException(404, f"Unknown subject {subject}")
    return subject


def _filters(locality, language, textbook_id):
    return {k: v for k, v in dict(locality=locality, language=language, textbook_id=textbook_id).items() if v}


# ---------------------------------------------------------------- meta
@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/meta")
def meta(user: dict = Depends(require(*ANY))):
    ds = store.get()
    items_mod.apply_exclusions(ds)
    subj = ds.subjects.copy()
    if "name_kz" not in subj:
        subj["name_kz"] = subj["name"]
    ctx = ds.context
    return ok(dict(
        source=ds.source, version=ds.version, has_ground_truth=ds.ground_truth is not None,
        subjects=subj.fillna("").to_dict("records"),
        textbooks=ds.textbooks.fillna("").to_dict("records"),
        filters=dict(locality=sorted(ctx["locality"].unique()), language=sorted(ctx["language"].unique()),
                     district=sorted(ctx["district"].unique())),
        stats=dict(schools=len(ds.schools), students=len(ds.students), classes=len(ds.classes),
                   responses=len(ds.responses), items=len(ds.items), topics=len(ds.topics)),
        validation=getattr(ds, "validation", None),
        excluded_items=sorted(ds.excluded_items),
    ))


# ---------------------------------------------------------------- auth
class Login(BaseModel):
    username: str
    password: str


@app.post("/api/auth/login")
def auth_login_endpoint(body: Login):
    res = auth_login(body.username, body.password)
    if not res:
        raise HTTPException(401, "Неверный логин или пароль")
    return res


@app.get("/api/auth/me")
def auth_me(user: dict = Depends(require(*ANY))):
    return user


@app.get("/api/school/{school_id}")
def school_profile(school_id: str, subject: str | None = None, user: dict = Depends(require(*ANY))):
    """School card: value-added, topics vs region, weak topics. Directors may only open their own school."""
    if user["role"] == "director" and user["school_id"] != school_id:
        raise HTTPException(403, "Директор видит только свою школу")
    ds = store.get()
    sj = _subject(subject)
    va = schools_mod.value_added(ds, sj)
    row = next((s for s in va["schools"] if s["school_id"] == school_id), None)
    if row is None:
        raise HTTPException(404, "Школа не найдена")
    region = {t["topic_id"]: t for t in topics_mod.topic_table(ds, sj)}
    mine = topics_mod.topic_table(ds, sj, {"school_id": school_id})
    topics_cmp = [dict(topic_id=t["topic_id"], name=t["name"], name_kz=t["name_kz"], section=t["section"],
                       section_kz=t["section_kz"], school=t["mean_pct"], school_mastered=t["mastered_share"],
                       region=region[t["topic_id"]]["mean_pct"], gap=round(t["mean_pct"] - region[t["topic_id"]]["mean_pct"], 1),
                       status=t["status"], n_students=t["n_students"]) for t in mine]
    hrs = hours_mod.optimize(ds, sj, filters={"textbook_id": row["textbook_id"]})
    titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()
    n_total = len(va["schools"])
    return ok(dict(school=row, n_schools=n_total, percentile=round(100 * (n_total - row["rank"]) / max(n_total - 1, 1)),
                   textbook_title=titles.get(row["textbook_id"], row["textbook_id"]), topics=topics_cmp,
                   hours=[dict(topic_id=x["topic_id"], name=x["name"], name_kz=x["name_kz"], planned=x["planned"],
                               recommended=x["recommended"], delta=x["delta"]) for x in hrs["topics"] if x["delta"]]))


@app.get("/api/school/{school_id}/risk")
def school_risk(school_id: str, subject: str | None = None, threshold: float = Query(0.6, ge=0.3, le=0.95),
                user: dict = Depends(require(*ANY))):
    """Early warning: students likely to fail upcoming topics (anonymous IDs)."""
    if user["role"] == "director" and user["school_id"] != school_id:
        raise HTTPException(403, "Директор видит только свою школу")
    return ok(risk_mod.school_risk(store.get(), _subject(subject), school_id, threshold))


@app.get("/api/lesson")
def lesson_plan(topic_id: str, subject: str | None = None, lang: str = "ru", user: dict = Depends(require(*ANY))):
    return ok(lesson_mod.build(store.get(), _subject(subject), topic_id, lang))


@app.get("/api/districts")
def districts(subject: str | None = None, user: dict = Depends(require(*REGION))):
    return ok(schools_mod.district_map(store.get(), _subject(subject)))


@app.get("/api/switching")
def switching(subject: str | None = None, user: dict = Depends(require(*REGION))):
    res = switching_mod.analyze(store.get(), _subject(subject))
    if res is None:
        raise HTTPException(404, "Нет данных за несколько лет (таблица history)")
    return ok(res)


@app.get("/api/pilot")
def pilot(subject: str | None = None, topic_id: str | None = None, effect_pp: float | None = Query(None, gt=0, le=30),
          power: float = Query(0.8, ge=0.5, le=0.95), user: dict = Depends(require(*REGION))):
    return ok(pilot_mod.plan(store.get(), _subject(subject), topic_id, effect_pp, power))


# ---------------------------------------------------------------- analytics
@app.get("/api/overview")
def overview(subject: str | None = None, user: dict = Depends(require(*REGION))):
    ds = store.get()
    sj = _subject(subject)
    return ok(dict(summary=topics_mod.subject_overview(ds, sj), sections=topics_mod.section_table(ds, sj),
                   topics=topics_mod.topic_table(ds, sj), insights=insights_mod.build(ds, sj)))


@app.get("/api/topics")
def topics(subject: str | None = None, locality: str | None = None, language: str | None = None,
           textbook_id: str | None = None, school_id: str | None = None, user: dict = Depends(require(*ANY))):
    ds = store.get()
    sj = _subject(subject)
    f = _filters(locality, language, textbook_id)
    if user["role"] == "director":
        school_id = user["school_id"]
    if school_id:
        f["school_id"] = school_id
    return ok(topics_mod.topic_table(ds, sj, f))


@app.get("/api/topics/{topic_id}")
def topic_detail(topic_id: str, user: dict = Depends(require(*ANY))):
    ds = store.get()
    t = ds.topics[ds.topics["topic_id"] == topic_id]
    if t.empty:
        raise HTTPException(404, "Unknown topic")
    sj = t.iloc[0]["subject_id"]
    row = next(x for x in topics_mod.topic_table(ds, sj) if x["topic_id"] == topic_id)
    aud = items_mod.audit(ds, sj)
    graph = prereq_mod.analyze(ds, sj)
    hrs = hours_mod.optimize(ds, sj)
    tb = textbooks_mod.compare(ds, sj)
    return ok(dict(
        topic=row, subject_id=sj,
        items=[x for x in aud["items"] if x["topic_id"] == topic_id],
        reliability=next((x for x in aud["topics"] if x["topic_id"] == topic_id), None),
        prerequisites=[e for e in graph["edges"] if e["topic_id"] == topic_id],
        dependents=[e for e in graph["edges"] if e["prereq_id"] == topic_id],
        hours=next((x for x in hrs["topics"] if x["topic_id"] == topic_id), None),
        textbooks=next((x for x in tb["heatmap"] if x["topic_id"] == topic_id), None),
    ))


@app.get("/api/graph")
def graph(subject: str | None = None, user: dict = Depends(require(*ANY))):
    return ok(prereq_mod.analyze(store.get(), _subject(subject)))


@app.get("/api/textbooks")
def textbooks(subject: str | None = None, user: dict = Depends(require(*REGION))):
    return ok(textbooks_mod.compare(store.get(), _subject(subject)))


@app.get("/api/hours")
def hours(subject: str | None = None, mode: str = "balanced", flex: float = Query(0.3, ge=0.05, le=0.6),
          total: int | None = None, locality: str | None = None, language: str | None = None,
          textbook_id: str | None = None, user: dict = Depends(require(*REGION))):
    return ok(hours_mod.optimize(store.get(), _subject(subject), mode=mode, flex=flex, total=total,
                                 filters=_filters(locality, language, textbook_id)))


class WhatIf(BaseModel):
    subject: str
    hours: dict[str, int]
    locality: str | None = None
    language: str | None = None
    textbook_id: str | None = None


@app.post("/api/hours/whatif")
def whatif(body: WhatIf, user: dict = Depends(require(*REGION))):
    return ok(hours_mod.optimize(store.get(), _subject(body.subject), custom=body.hours,
                                 filters=_filters(body.locality, body.language, body.textbook_id)))


@app.get("/api/quality")
def quality(subject: str | None = None, user: dict = Depends(require(*ANY))):
    return ok(items_mod.audit(store.get(), _subject(subject)))


@app.get("/api/schools")
def schools(subject: str | None = None, user: dict = Depends(require(*REGION))):
    return ok(schools_mod.value_added(store.get(), _subject(subject)))


@app.get("/api/equity")
def equity(subject: str | None = None, user: dict = Depends(require(*REGION))):
    return ok(schools_mod.equity(store.get(), _subject(subject)))


@app.get("/api/insights")
def insights(subject: str | None = None, user: dict = Depends(require(*REGION))):
    return ok(insights_mod.build(store.get(), _subject(subject)))


@app.get("/api/validation")
def validation(user: dict = Depends(require(*REGION))):
    v = validation_mod.run(store.get())
    if v is None:
        raise HTTPException(404, "Ground truth is only available for the synthetic dataset")
    return ok(v)


@app.get("/api/report")
def report(subject: str | None = None, lang: str = "ru", user: dict = Depends(require(*REGION))):
    return ok(build_report(store.get(), _subject(subject), lang))


@app.get("/api/export.xlsx")
def export_xlsx(subject: str | None = None, user: dict = Depends(require(*REGION))):
    """All recommendations as an Excel workbook (methodologists live in Excel)."""
    ds = store.get()
    sj = _subject(subject)
    titles = ds.textbooks.set_index("textbook_id")["title"].to_dict()
    tt = pd.DataFrame(topics_mod.topic_table(ds, sj))
    topics_df = tt[["order", "topic_id", "section", "name", "mean_pct", "mastered_share", "status", "planned_hours",
                    "actual_hours", "class_spread", "n_students"]].rename(columns={
        "order": "№", "topic_id": "ID", "section": "Раздел", "name": "Тема", "mean_pct": "Средний балл, %",
        "mastered_share": "Усвоили, %", "status": "Статус", "planned_hours": "Часы (план)",
        "actual_hours": "Часы (факт, среднее)", "class_spread": "Разброс по классам, п.п.", "n_students": "Учеников"})
    hr = hours_mod.optimize(ds, sj)
    hours_df = pd.DataFrame([dict(ID=x["topic_id"], Тема=x["name"], **{
        "План, ч": x["planned"], "Рекомендация, ч": x["recommended"], "Изменение, ч": x["delta"],
        "Отдача, п.п./ч": x["marginal_pp_per_hour"], "Прогноз (план), %": x["predicted_plan"],
        "Прогноз (рекомендация), %": x["predicted_rec"], "Причины": ", ".join(x["reasons"])}) for x in hr["topics"]])
    tb = textbooks_mod.compare(ds, sj)
    tb_rows = []
    for s in tb["sections"]:
        for b in tb["textbooks"]:
            a = s["adjusted"][b]
            tb_rows.append({"Раздел": s["name"], "Учебник": titles.get(b, b), "Сырой средний, %": s["naive"][b]["mean"],
                            "Скорректированный, %": a["mean"], f"Эффект vs {titles.get(tb['reference'])}, п.п.": a["effect_vs_ref"],
                            "ДИ нижн.": a["ci"][0], "ДИ верхн.": a["ci"][1], "p": a["p"], "Лучший": "да" if s["best"] == b else ""})
    va = schools_mod.value_added(ds, sj)
    schools_df = pd.DataFrame([{"Место": s["rank"], "Школа": s["name"], "Район": s["district"], "Местность": s["locality"],
                                "Язык": s["language"], "Учебник": titles.get(s["textbook_id"]), "Учеников": s["n_students"],
                                "Факт, %": s["actual"], "Ожидалось, %": s["expected"], "Добавленная ценность, п.п.": s["value_added"],
                                "Категория": s["category"], "Слабые темы": ", ".join(w["name"] for w in s["weak_topics"])}
                               for s in va["schools"]])
    items_df = pd.DataFrame([{"Задание": x["item_id"], "Тема": x["topic_name"], "Решаемость": x["p_value"],
                              "Различающая способность": x["discrimination"], "Проблемы": "; ".join(x["flag_labels"]),
                              "Рекомендация": x["suggestion"] or "", "Исключено": "да" if x["critical"] else ""}
                             for x in items_mod.audit(ds, sj)["items"]])
    findings_df = pd.DataFrame([{"Важность": i["severity"], "Вывод": i["title_ru"], "Описание": i["text_ru"]}
                                for i in insights_mod.build(ds, sj)])
    buf = io.BytesIO()
    with pd.ExcelWriter(buf, engine="openpyxl") as xw:
        for name, df in [("Выводы", findings_df), ("Темы", topics_df), ("Часы", hours_df), ("Учебники", pd.DataFrame(tb_rows)),
                         ("Школы", schools_df), ("Задания", items_df)]:
            df.to_excel(xw, sheet_name=name, index=False)
            ws = xw.sheets[name]
            for col in ws.columns:
                width = max(len(str(c.value or "")) for c in col[:200])
                ws.column_dimensions[col[0].column_letter].width = min(max(10, width + 2), 70)
            ws.freeze_panes = "A2"
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                             headers={"Content-Disposition": f"attachment; filename=ddc_{sj}.xlsx"})


# ---------------------------------------------------------------- data management
@app.get("/api/data/schema")
def data_schema(user: dict = Depends(require(*ANY))):
    return ok([dict(table=k, required=v["required"], optional=v["optional"], description=TABLE_DESCRIPTIONS[k])
               for k, v in {**SCHEMA, **OPTIONAL_SCHEMA}.items()])


_TEMPLATE_CACHE: dict[str, bytes] = {}


@app.get("/api/data/template.zip")
def data_template(user: dict = Depends(require(*ANY))):
    """A small but complete, analysable dataset (8 schools) in the upload format — fill in or upload as is."""
    if "zip" not in _TEMPLATE_CACHE:
        import tempfile

        from .data.generator import generate
        with tempfile.TemporaryDirectory() as tmp:
            generate(tmp, seed=7, n_schools=8)
            buf = io.BytesIO()
            with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
                for name in [*SCHEMA, *OPTIONAL_SCHEMA]:
                    if (Path(tmp) / f"{name}.csv").exists():
                        z.write(Path(tmp) / f"{name}.csv", f"{name}.csv")
                z.writestr("README.txt", "\n".join(f"{k}.csv — {v}" for k, v in TABLE_DESCRIPTIONS.items()))
            _TEMPLATE_CACHE["zip"] = buf.getvalue()
    buf = io.BytesIO(_TEMPLATE_CACHE["zip"])
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": "attachment; filename=template.zip"})


@app.post("/api/data/upload")
async def data_upload(files: list[UploadFile] = File(...), user: dict = Depends(require(*("admin",)))):
    payload = [(f.filename or "file", await f.read()) for f in files]
    report = store.replace_with_upload(payload)
    if report["ok"]:
        _warmup_async()
    return ok(report)


class Reset(BaseModel):
    seed: int | None = None
    n_schools: int = 160


@app.post("/api/data/reset")
def data_reset(body: Reset, user: dict = Depends(require(*("admin",)))):
    report = store.reset_synthetic(seed=body.seed, n_schools=body.n_schools)
    _warmup_async()
    return ok(report)


# ---------------------------------------------------------------- AI assistant
class Ask(BaseModel):
    subject: str
    question: str
    lang: str = "ru"
    history: list[dict] = []


@app.post("/api/ai/ask")
def ai_ask(body: Ask, user: dict = Depends(require(*REGION))):
    from .ai import answer
    return ok(answer(store.get(), _subject(body.subject), body.question, body.lang, body.history))


@app.get("/api/ai/status")
def ai_status(user: dict = Depends(require(*ANY))):
    from .ai import available
    return ok({"available": available()})


# ---------------------------------------------------------------- warm-up & static
def _warmup():
    try:
        ds = store.get()
        for sj in ds.subjects["subject_id"]:
            insights_mod.build(ds, sj)
            schools_mod.equity(ds, sj)
        validation_mod.run(ds)
    except Exception as e:  # pragma: no cover - warm-up is best effort
        print("warm-up failed:", e)


def _warmup_async():
    threading.Thread(target=_warmup, daemon=True).start()


if FRONTEND_DIST.exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        root = FRONTEND_DIST.resolve()
        f = (FRONTEND_DIST / path).resolve()
        if path and f.is_file() and root in f.parents:
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")
