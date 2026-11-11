"""Persist computed analytics between restarts.

The cache file is keyed by a fingerprint of (a) the dataset files and (b) the analytics source code, so a
changed dataset or a new release can never be served stale results — it simply recomputes once.
"""
from __future__ import annotations

import hashlib
import os
import pickle
import threading
from pathlib import Path

APP_DIR = Path(__file__).resolve().parents[1]
_lock = threading.Lock()


def persist_dir() -> Path:
    """Writable, persistent location (mount a volume here in production via DDC_DATA_DIR)."""
    d = Path(os.environ.get("DDC_DATA_DIR") or APP_DIR.parent / "data")
    d.mkdir(parents=True, exist_ok=True)
    return d


def _code_hash() -> str:
    h = hashlib.sha256()
    for f in sorted(APP_DIR.rglob("*.py")):
        h.update(f.read_bytes())
    return h.hexdigest()[:16]


_CODE = _code_hash()


def fingerprint(ds) -> str | None:
    path = getattr(ds, "path", None)
    if path is None:
        return None
    h = hashlib.sha256(_CODE.encode())
    for f in sorted(Path(path).glob("*.csv")):
        st = f.stat()
        h.update(f"{f.name}:{st.st_size}:{int(st.st_mtime)}".encode())
    return h.hexdigest()[:24]


BUILTIN_CACHE = APP_DIR.parent / "data" / "cache"  # baked into the image at build time (read-only fallback)


def _file(fp: str) -> Path:
    d = persist_dir() / "cache"
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{fp}.pkl"


def load(ds) -> bool:
    fp = fingerprint(ds)
    if not fp:
        return False
    for f in (_file(fp), BUILTIN_CACHE / f"{fp}.pkl"):
        if f.exists():
            try:
                with open(f, "rb") as fh:
                    ds._cache.update(pickle.load(fh))
                return True
            except Exception:
                continue
    return False


def save(ds) -> bool:
    fp = fingerprint(ds)
    if not fp:
        return False
    with _lock:
        snapshot = {}
        for k, v in list(ds._cache.items()):
            try:
                pickle.dumps(v)
                snapshot[k] = v
            except Exception:
                continue
        target = _file(fp)
        tmp = target.with_suffix(".tmp")
        with open(tmp, "wb") as fh:
            pickle.dump(snapshot, fh, protocol=pickle.HIGHEST_PROTOCOL)
        tmp.replace(target)
        # keep only the 3 most recent cache files
        files = sorted(target.parent.glob("*.pkl"), key=lambda p: p.stat().st_mtime, reverse=True)
        for old in files[3:]:
            old.unlink(missing_ok=True)
    return True
