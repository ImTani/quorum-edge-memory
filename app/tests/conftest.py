"""Shared fixtures. Test data lives in the repo's .cache/test-data, never in %TEMP% (isolation rule)."""
import shutil
import sys
import uuid
from pathlib import Path

import pytest

APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP))

TEST_DATA = APP.parent / ".cache" / "test-data"


@pytest.fixture
def data_dir():
    """A fresh per-test directory under .cache/test-data. Use this instead of tmp_path."""
    d = TEST_DATA / uuid.uuid4().hex[:12]
    d.mkdir(parents=True)
    yield d
    shutil.rmtree(d, ignore_errors=True)  # Windows may still hold a shard lock; leftovers are gitignored


@pytest.fixture(scope="session")
def embedder():
    """One embedding model per test session (loading takes ~10 s)."""
    from edge.config import Config
    from edge.embed import get_embedder

    return get_embedder(Config(device="test", port=0))
