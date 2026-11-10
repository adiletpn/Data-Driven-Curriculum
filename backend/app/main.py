"""FastAPI application: REST API for the analytics + static frontend."""
from __future__ import annotations

import io
import math
import threading
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
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
from .data.store import SCHEMA, SYNTH_DIR, TABLE_DESCRIPTIONS, store
from .report import build_report

app = FastAPI(title="Data-Driven Curriculum API", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


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
def meta():
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


# ---------------------------------------------------------------- analytics
@app.get("/api/overview")
def overview(subject: str | None = None):
    ds = store.get()
    sj = _subject(subject)
    return ok(dict(summary=topics_mod.subject_overview(ds, sj), sections=topics_mod.section_table(ds, sj),
                   topics=topics_mod.topic_table(ds, sj), insights=insights_mod.build(ds, sj)))


@app.get("/api/topics")
def topics(subject: str | None = None, locality: str | None = None, language: str | None = None,
           textbook_id: str | None = None):
    ds = store.get()
    sj = _subject(subject)
    return ok(topics_mod.topic_table(ds, sj, _filters(locality, language, textbook_id)))


@app.get("/api/topics/{topic_id}")
def topic_detail(topic_id: str):
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
def graph(subject: str | None = None):
    return ok(prereq_mod.analyze(store.get(), _subject(subject)))


@app.get("/api/textbooks")
def textbooks(subject: str | None = None):
    return ok(textbooks_mod.compare(store.get(), _subject(subject)))


@app.get("/api/hours")
def hours(subject: str | None = None, mode: str = "balanced", flex: float = Query(0.3, ge=0.05, le=0.6),
          total: int | None = None, locality: str | None = None, language: str | None = None,
          textbook_id: str | None = None):
    return ok(hours_mod.optimize(store.get(), _subject(subject), mode=mode, flex=flex, total=total,
                                 filters=_filters(locality, language, textbook_id)))


class WhatIf(BaseModel):
    subject: str
    hours: dict[str, int]
    locality: str | None = None
    language: str | None = None
    textbook_id: str | None = None


@app.post("/api/hours/whatif")
def whatif(body: WhatIf):
    return ok(hours_mod.optimize(store.get(), _subject(body.subject), custom=body.hours,
                                 filters=_filters(body.locality, body.language, body.textbook_id)))


@app.get("/api/quality")
def quality(subject: str | None = None):
    return ok(items_mod.audit(store.get(), _subject(subject)))


@app.get("/api/schools")
def schools(subject: str | None = None):
    return ok(schools_mod.value_added(store.get(), _subject(subject)))


@app.get("/api/equity")
def equity(subject: str | None = None):
    return ok(schools_mod.equity(store.get(), _subject(subject)))


@app.get("/api/insights")
def insights(subject: str | None = None):
    return ok(insights_mod.build(store.get(), _subject(subject)))


@app.get("/api/validation")
def validation():
    v = validation_mod.run(store.get())
    if v is None:
        raise HTTPException(404, "Ground truth is only available for the synthetic dataset")
    return ok(v)


@app.get("/api/report")
def report(subject: str | None = None, lang: str = "ru"):
    return ok(build_report(store.get(), _subject(subject), lang))


# ---------------------------------------------------------------- data management
@app.get("/api/data/schema")
def data_schema():
    return ok([dict(table=k, required=v["required"], optional=v["optional"], description=TABLE_DESCRIPTIONS[k])
               for k, v in SCHEMA.items()])


@app.get("/api/data/template.zip")
def data_template():
    """Small sample of the synthetic dataset as a ready-to-fill template."""
    ds = store.get()
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for name in SCHEMA:
            src = SYNTH_DIR / f"{name}.csv"
            if src.exists():
                df = pd.read_csv(src, dtype=str)
                z.writestr(f"{name}.csv", df.head(50 if name == "responses" else 200).to_csv(index=False))
            else:
                z.writestr(f"{name}.csv", ",".join(SCHEMA[name]["required"] + SCHEMA[name]["optional"]) + "\n")
        z.writestr("README.txt", "\n".join(f"{k}.csv — {v}" for k, v in TABLE_DESCRIPTIONS.items()))
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/zip",
                             headers={"Content-Disposition": "attachment; filename=template.zip"})


@app.post("/api/data/upload")
async def data_upload(files: list[UploadFile] = File(...)):
    payload = [(f.filename or "file", await f.read()) for f in files]
    report = store.replace_with_upload(payload)
    if report["ok"]:
        _warmup_async()
    return ok(report)


class Reset(BaseModel):
    seed: int | None = None
    n_schools: int = 80


@app.post("/api/data/reset")
def data_reset(body: Reset):
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
def ai_ask(body: Ask):
    from .ai import answer
    return ok(answer(store.get(), _subject(body.subject), body.question, body.lang, body.history))


@app.get("/api/ai/status")
def ai_status():
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


@app.on_event("startup")
def _startup():
    _warmup_async()


if FRONTEND_DIST.exists():
    @app.get("/{path:path}", include_in_schema=False)
    def spa(path: str):
        root = FRONTEND_DIST.resolve()
        f = (FRONTEND_DIST / path).resolve()
        if path and f.is_file() and root in f.parents:
            return FileResponse(f)
        return FileResponse(FRONTEND_DIST / "index.html")
