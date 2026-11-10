"""Dataset loading, validation and derived score tables."""
from __future__ import annotations

import io
import json
import shutil
import threading
import zipfile
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
SYNTH_DIR = DATA_DIR / "synthetic"
ACTIVE_DIR = DATA_DIR / "active"

MASTERY_THRESHOLD = 0.6  # student "усвоил тему" if >= 60% of the topic items are correct

SCHEMA: dict[str, dict] = {
    "subjects": {"required": ["subject_id", "name"], "optional": ["name_kz", "grade", "total_hours"]},
    "topics": {"required": ["topic_id", "subject_id", "section", "name", "planned_hours"],
               "optional": ["section_kz", "name_kz", "order", "prerequisites"]},
    "textbooks": {"required": ["textbook_id", "subject_id", "title"], "optional": ["publisher"]},
    "schools": {"required": ["school_id", "name"], "optional": ["district", "locality", "language"]},
    "students": {"required": ["student_id", "school_id"], "optional": ["class_label", "baseline_score"]},
    "classes": {"required": ["class_id", "school_id", "subject_id", "textbook_id"], "optional": ["class_label"]},
    "hours": {"required": ["class_id", "topic_id", "hours"], "optional": []},
    "items": {"required": ["item_id", "topic_id"], "optional": ["correct_option", "n_options"]},
    "responses": {"required": ["student_id", "class_id", "item_id"], "optional": ["answer", "correct"]},
}

TABLE_DESCRIPTIONS = {
    "subjects": "Предметы: subject_id, name, grade, total_hours",
    "topics": "Темы программы: topic_id, subject_id, section, name, planned_hours, prerequisites (через ;)",
    "textbooks": "Учебники: textbook_id, subject_id, title, publisher",
    "schools": "Школы: school_id, name, district, locality (urban/rural), language (kz/ru)",
    "students": "Ученики: student_id, school_id, class_label, baseline_score (входная диагностика 0–100)",
    "classes": "Классы по предмету: class_id, school_id, subject_id, textbook_id",
    "hours": "Фактические часы по теме в классе: class_id, topic_id, hours",
    "items": "Задания теста: item_id, topic_id, correct_option",
    "responses": "Ответы: student_id, class_id, item_id, answer (A–D) или correct (0/1)",
}


class ValidationError(Exception):
    def __init__(self, report: dict):
        super().__init__("dataset validation failed")
        self.report = report


@dataclass
class Dataset:
    tables: dict[str, pd.DataFrame]
    source: str
    version: int
    ground_truth: dict | None = None
    excluded_items: set = field(default_factory=set)
    _cache: dict = field(default_factory=dict)

    def __getattr__(self, item):  # dataset.topics, dataset.responses, ...
        tables = self.__dict__.get("tables", {})
        if item in tables:
            return tables[item]
        raise AttributeError(item)

    def cached(self, key, fn):
        if key not in self._cache:
            self._cache[key] = fn()
        return self._cache[key]

    # ---------- derived tables ----------
    @property
    def graded(self) -> pd.DataFrame:
        """responses joined with items, with 0/1 correctness (all items, before exclusion)."""
        def build():
            r = self.responses.merge(self.items[["item_id", "topic_id"] + (["correct_option"] if "correct_option" in self.items else [])],
                                     on="item_id", how="inner")
            if "answer" in r and "correct_option" in r:
                ans = r["answer"].fillna("").astype(str).str.strip().str.upper()
                r["answered"] = ans != ""
                r["correct"] = (ans == r["correct_option"].astype(str).str.upper()).astype(np.int8)
            else:
                r["answered"] = r["correct"].notna()
                r["correct"] = r["correct"].fillna(0).astype(np.int8)
            return r
        return self.cached("graded", build)

    def topic_scores(self, exclude_defective: bool = True) -> pd.DataFrame:
        """student x topic share of correct answers (+ context columns)."""
        key = ("topic_scores", exclude_defective, tuple(sorted(self.excluded_items)))

        def build():
            g = self.graded
            if exclude_defective and self.excluded_items:
                g = g[~g["item_id"].isin(self.excluded_items)]
            s = (g.groupby(["student_id", "class_id", "topic_id"], observed=True)
                 .agg(n_items=("correct", "size"), n_correct=("correct", "sum")).reset_index())
            s["pct"] = s["n_correct"] / s["n_items"]
            s = s.merge(self.context, on="class_id", how="left")
            s = s.merge(self.students[["student_id"] + [c for c in ["baseline_score"] if c in self.students]],
                        on="student_id", how="left")
            s = s.merge(self.hours, on=["class_id", "topic_id"], how="left")
            s = s.merge(self.topics[["topic_id", "section"]], on="topic_id", how="left")
            s["mastered"] = s["pct"] >= MASTERY_THRESHOLD
            return s
        return self.cached(key, build)

    @property
    def context(self) -> pd.DataFrame:
        """class -> school, subject, textbook, locality, language."""
        def build():
            c = self.classes.merge(self.schools, on="school_id", how="left", suffixes=("", "_school"))
            for col, default in [("locality", "unknown"), ("language", "unknown"), ("district", "—")]:
                if col not in c:
                    c[col] = default
                c[col] = c[col].fillna(default)
            return c[["class_id", "school_id", "subject_id", "textbook_id", "locality", "language", "district"]]
        return self.cached("context", build)

    def subject_topics(self, subject_id: str) -> pd.DataFrame:
        t = self.topics[self.topics["subject_id"] == subject_id].copy()
        if "order" not in t:
            t["order"] = range(1, len(t) + 1)
        t = t.sort_values("order")
        t["prereq_list"] = t["prerequisites"].fillna("").astype(str).apply(
            lambda s: [x.strip() for x in s.split(";") if x.strip()]) if "prerequisites" in t else [[] for _ in range(len(t))]
        for col in ["name_kz", "section_kz"]:
            if col not in t:
                t[col] = t[col.replace("_kz", "")]
            t[col] = t[col].fillna(t[col.replace("_kz", "")])
        return t.reset_index(drop=True)


# ---------------- loading & validation ----------------

def _read_table(path: Path) -> pd.DataFrame:
    return pd.read_csv(path, dtype=str, keep_default_na=False, na_values=[""])


def _coerce(tables: dict[str, pd.DataFrame]) -> None:
    num = {"topics": ["planned_hours", "order"], "subjects": ["grade", "total_hours"], "hours": ["hours"],
           "students": ["baseline_score"], "items": ["n_options"], "responses": ["correct"]}
    for t, cols in num.items():
        for c in cols:
            if t in tables and c in tables[t]:
                tables[t][c] = pd.to_numeric(tables[t][c], errors="coerce")
    for t, df in tables.items():
        for c in df.columns:
            if c.endswith("_id"):
                df[c] = df[c].astype(str).str.strip()


def validate(tables: dict[str, pd.DataFrame]) -> dict:
    errors, warnings = [], []
    for name, spec in SCHEMA.items():
        if name not in tables:
            errors.append(f"Нет таблицы «{name}» ({TABLE_DESCRIPTIONS[name]})")
            continue
        missing = [c for c in spec["required"] if c not in tables[name].columns]
        if missing:
            errors.append(f"Таблица «{name}»: нет обязательных колонок {', '.join(missing)}")
    if errors:
        return {"ok": False, "errors": errors, "warnings": warnings, "stats": {}}

    def orphans(child, col, parent, pcol=None):
        pcol = pcol or col
        bad = ~tables[child][col].isin(tables[parent][pcol])
        if bad.any():
            sample = ", ".join(tables[child].loc[bad, col].astype(str).unique()[:5])
            (errors if bad.mean() > 0.05 else warnings).append(
                f"«{child}.{col}»: {int(bad.sum())} строк ссылаются на несуществующие записи в «{parent}» (например: {sample})")

    orphans("topics", "subject_id", "subjects")
    orphans("classes", "school_id", "schools")
    orphans("classes", "textbook_id", "textbooks")
    orphans("hours", "class_id", "classes")
    orphans("hours", "topic_id", "topics")
    orphans("items", "topic_id", "topics")
    orphans("responses", "item_id", "items")
    orphans("responses", "class_id", "classes")
    orphans("responses", "student_id", "students")

    r = tables["responses"]
    if "answer" not in r and "correct" not in r:
        errors.append("В «responses» нужна колонка answer (A–D) или correct (0/1)")
    if "answer" in r and "correct_option" not in tables["items"]:
        errors.append("Для колонки answer в «items» нужна колонка correct_option")
    for name, keys in [("topics", ["topic_id"]), ("items", ["item_id"]), ("classes", ["class_id"]),
                       ("students", ["student_id"]), ("schools", ["school_id"])]:
        d = tables[name].duplicated(keys).sum()
        if d:
            errors.append(f"«{name}»: {d} дубликатов ключа {', '.join(keys)}")
    dup = r.duplicated(["student_id", "item_id"]).sum()
    if dup:
        warnings.append(f"«responses»: {dup} повторных ответов ученика на одно задание — будет учтён первый")

    h = tables["hours"]
    if h["hours"].isna().any() or (h["hours"] < 0).any():
        errors.append("«hours.hours» должно быть неотрицательным числом")
    cov = tables["classes"].merge(tables["topics"], on="subject_id")[["class_id", "topic_id"]]
    merged = cov.merge(h, on=["class_id", "topic_id"], how="left")
    miss = int(merged["hours"].isna().sum())
    if miss:
        warnings.append(f"Для {miss} пар «класс × тема» нет фактических часов — будут подставлены плановые")

    if "baseline_score" not in tables["students"] or tables["students"]["baseline_score"].isna().mean() > 0.5:
        warnings.append("Нет входной диагностики (baseline_score) — сравнение учебников будет учитывать только тип школы, "
                        "точность ниже")
    sch = tables["schools"]
    for col in ["locality", "language"]:
        if col not in sch:
            warnings.append(f"В «schools» нет колонки {col} — анализ равенства доступа по этому признаку недоступен")

    per_topic = tables["items"].groupby("topic_id").size()
    few = per_topic[per_topic < 3]
    if len(few):
        warnings.append(f"{len(few)} тем имеют меньше 3 заданий — оценка усвоения по ним ненадёжна")

    # enough data for the statistics to be meaningful?
    if not errors:
        rr = r.merge(tables["items"][["item_id", "topic_id"]], on="item_id").merge(
            tables["topics"][["topic_id", "subject_id"]], on="topic_id")
        for sj, g in rr.groupby("subject_id"):
            n_stu = g["student_id"].nunique()
            n_cls = g["class_id"].nunique()
            n_top = g["topic_id"].nunique()
            if n_stu < 30 or n_cls < 3:
                errors.append(f"Предмет {sj}: слишком мало данных для анализа ({n_stu} учеников, {n_cls} классов). "
                              f"Нужно минимум 30 учеников и 3 класса с ответами.")
            elif n_top < 2:
                errors.append(f"Предмет {sj}: ответы есть только по {n_top} теме — нужно минимум 2 темы.")
            else:
                n_sch = tables["classes"].loc[tables["classes"]["class_id"].isin(g["class_id"]), "school_id"].nunique()
                if n_sch < 10:
                    warnings.append(f"Предмет {sj}: всего {n_sch} школ — сравнение учебников и школ будет неточным")
        if r["item_id"].isin(tables["items"]["item_id"]).sum() == 0:
            errors.append("Ни один ответ не относится к заданиям из «items»")

    stats = {name: int(len(df)) for name, df in tables.items()}
    return {"ok": not errors, "errors": errors, "warnings": warnings, "stats": stats}


def _fill_hours(tables):
    cov = tables["classes"].merge(tables["topics"][["topic_id", "subject_id", "planned_hours"]], on="subject_id")
    h = cov.merge(tables["hours"], on=["class_id", "topic_id"], how="left")
    h["hours"] = h["hours"].fillna(h["planned_hours"])
    tables["hours"] = h[["class_id", "topic_id", "hours"]]
    tables["responses"] = tables["responses"].drop_duplicates(["student_id", "item_id"])


def load_dir(path: Path, source: str, version: int) -> Dataset:
    tables = {}
    for name in SCHEMA:
        f = path / f"{name}.csv"
        if f.exists():
            tables[name] = _read_table(f)
    _coerce(tables)
    report = validate(tables)
    if not report["ok"]:
        raise ValidationError(report)
    _fill_hours(tables)
    gt = path / "ground_truth.json"
    ds = Dataset(tables=tables, source=source, version=version,
                 ground_truth=json.loads(gt.read_text()) if gt.exists() else None)
    ds.validation = report  # type: ignore[attr-defined]
    return ds


def extract_upload(files: list[tuple[str, bytes]], dest: Path) -> None:
    """Accepts .zip with CSVs, an .xlsx workbook (one sheet per table) or individual CSVs."""
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    for fname, content in files:
        low = fname.lower()
        if low.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                for info in z.infolist():
                    base = Path(info.filename).name
                    if base.lower().endswith(".csv") and Path(base).stem in SCHEMA:
                        (dest / base).write_bytes(z.read(info))
        elif low.endswith((".xlsx", ".xls")):
            sheets = pd.read_excel(io.BytesIO(content), sheet_name=None, dtype=str)
            for name, df in sheets.items():
                if name.strip().lower() in SCHEMA:
                    df.to_csv(dest / f"{name.strip().lower()}.csv", index=False)
        elif low.endswith(".csv") and Path(fname).stem in SCHEMA:
            (dest / Path(fname).name).write_bytes(content)


class Store:
    """Holds the active dataset (thread-safe swap)."""

    def __init__(self):
        self._lock = threading.Lock()
        self._ds: Dataset | None = None
        self._version = 0

    def get(self) -> Dataset:
        with self._lock:
            if self._ds is None:
                self._load_default()
            return self._ds

    def _load_default(self):
        from .generator import generate
        if (ACTIVE_DIR / "responses.csv").exists():
            try:
                self._version += 1
                self._ds = load_dir(ACTIVE_DIR, "upload", self._version)
                return
            except ValidationError:
                pass
        if not (SYNTH_DIR / "responses.csv").exists():
            generate(SYNTH_DIR)
        self._version += 1
        self._ds = load_dir(SYNTH_DIR, "synthetic", self._version)

    def replace_with_upload(self, files) -> dict:
        tmp = DATA_DIR / "_incoming"
        extract_upload(files, tmp)
        tables = {}
        for name in SCHEMA:
            f = tmp / f"{name}.csv"
            if f.exists():
                tables[name] = _read_table(f)
        _coerce(tables)
        report = validate(tables)
        if not report["ok"]:
            shutil.rmtree(tmp, ignore_errors=True)
            return report
        if ACTIVE_DIR.exists():
            shutil.rmtree(ACTIVE_DIR)
        tmp.rename(ACTIVE_DIR)
        with self._lock:
            self._version += 1
            self._ds = load_dir(ACTIVE_DIR, "upload", self._version)
        return report

    def reset_synthetic(self, seed: int | None = None, n_schools: int = 60) -> dict:
        from .generator import generate
        if seed is not None:
            generate(SYNTH_DIR, seed=seed, n_schools=n_schools)
        elif not (SYNTH_DIR / "responses.csv").exists():
            generate(SYNTH_DIR)
        if ACTIVE_DIR.exists():
            shutil.rmtree(ACTIVE_DIR)
        with self._lock:
            self._version += 1
            self._ds = load_dir(SYNTH_DIR, "synthetic", self._version)
            return self._ds.validation  # type: ignore[attr-defined]


store = Store()
