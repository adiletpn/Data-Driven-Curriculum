import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.data.generator import generate  # noqa: E402
from app.data.store import load_dir  # noqa: E402


@pytest.fixture(scope="session")
def ds(tmp_path_factory):
    d = tmp_path_factory.mktemp("synthetic")
    generate(d, seed=42)
    return load_dir(d, "synthetic", 1)
