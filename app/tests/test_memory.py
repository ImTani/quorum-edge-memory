"""Memory: the Qdrant Edge shard, hybrid search, view filters, key-vector candidates, projection."""
import uuid

import numpy as np
import pytest

from edge.config import Config
from edge.memory import Memory, point_id


def make_claim(entity, attribute, value, text, tier="team", **extra):
    claim = {
        "claim_id": "clm_" + uuid.uuid4().hex[:12],
        "text": text,
        "entity": entity,
        "entity_kind": "task",
        "attribute": attribute,
        "value": value,
        "value_label": value,
        "owner": "tanishk",
        "source": {"kind": "note", "ref": "note:test", "author": "tanishk", "excerpt": text,
                   "at": "2026-10-03T10:00:00+05:30"},
        "stated_at": "2026-10-03T10:00:00+05:30",
        "captured_by": "tanishk",
        "device_id": "dev_tanishk",
        "tier": tier,
        "status": "active",
        "conflict_id": None,
        "resolves": None,
        "version": 1,
        "modified_at": 1790000000000,  # a fixed past stamp, so any real bump is strictly later
        "modified_by": "tanishk",
    }
    claim.update(extra)
    return claim


@pytest.fixture
def memory(data_dir, embedder):
    m = Memory(Config(device="tanishk", port=0, data_dir=data_dir), embedder)
    yield m
    m.close()


@pytest.fixture
def seeded(memory):
    claims = {
        "kapoor": make_claim("Kapoor invoice", "amount", "85000", "Kapoor invoice of 85,000 rupees is pending"),
        "mehta": make_claim("Mehta reel cutdowns", "due_date", "2026-10-06", "Mehta reel cutdowns are due 6 Oct"),
        "pangong": make_claim("Pangong shoot", "location", "Pangong Tso", "Pangong shoot location is the lake shore"),
        "salary": make_claim("Salary", "amount", "120000", "Salary credited to my account", tier="device"),
    }
    for c in claims.values():
        memory.add_claim(c)
    return claims


def test_hybrid_search_finds_the_right_claim(memory, seeded):
    hits = memory.search("how much is the Kapoor invoice?", view="mine")
    assert hits[0][0]["claim_id"] == seeded["kapoor"]["claim_id"]
    hits = memory.search("when are the Mehta reels due", view="mine")
    assert hits[0][0]["claim_id"] == seeded["mehta"]["claim_id"]


def test_team_view_hides_device_tier_claims(memory, seeded):
    mine = [c["claim_id"] for c, _ in memory.search("salary credited", view="mine")]
    team = [c for c, _ in memory.search("salary credited", view="team")]
    assert seeded["salary"]["claim_id"] in mine
    assert seeded["salary"]["claim_id"] not in [c["claim_id"] for c in team]
    assert all(c["tier"] == "team" for c in team)


def test_search_skips_superseded_claims(memory, seeded):
    memory.update_fields(seeded["kapoor"]["claim_id"], status="superseded")
    ids = [c["claim_id"] for c, _ in memory.search("Kapoor invoice", view="mine")]
    assert seeded["kapoor"]["claim_id"] not in ids


def test_conflict_candidates_match_same_thing_not_unrelated_deadline(memory, seeded):
    email = make_claim("Sharma wedding edit", "due_date", "2026-10-16",
                       "Final delivery of the Sharma wedding edit on 16 October")
    memory.add_claim(email)
    note = make_claim("Sharma delivery", "due_date", "2026-10-18", "Sharma delivery moves to the 18th")
    memory.add_claim(note)
    candidates = memory.conflict_candidates(note)
    assert [c["claim_id"] for c, _ in candidates] == [email["claim_id"]]  # Mehta's deadline is below threshold
    assert candidates[0][1] >= 0.82


def test_update_fields_bumps_version_unless_local_only(memory, seeded):
    cid = seeded["mehta"]["claim_id"]
    marked = memory.update_fields(cid, bump_version=False, status="disputed", conflict_id="cfl_x")
    assert (marked["version"], marked["status"]) == (1, "disputed")
    bumped = memory.update_fields(cid, status="active")
    assert bumped["version"] == 2 and bumped["modified_at"] > seeded["mehta"]["modified_at"]
    assert memory.get(cid) == bumped


def test_ui_only_fields_are_never_stored(memory):
    claim = make_claim("Riya", "birthday", "2026-10-09", "Riya's birthday is 9 Oct", sync="queued", xyz=[1, 2, 3])
    memory.add_claim(claim)
    stored = memory.get(claim["claim_id"])
    assert "sync" not in stored and "xyz" not in stored


def test_shard_survives_close_and_reload(data_dir, embedder):
    cfg = Config(device="tanishk", port=0, data_dir=data_dir)
    m = Memory(cfg, embedder)
    claim = make_claim("Kapoor invoice", "amount", "85000", "Kapoor invoice of 85,000 rupees")
    m.add_claim(claim)
    m.close()
    assert (data_dir / "tanishk" / "shard" / "edge_config.json").exists()
    m = Memory(cfg, embedder)
    try:
        assert m.get(claim["claim_id"]) == claim
        assert m.search("Kapoor invoice", view="team")[0][0]["claim_id"] == claim["claim_id"]
    finally:
        m.close()


_HARD_KILL_WRITER = r"""
import json, os, sys
sys.path.insert(0, sys.argv[1])
from pathlib import Path
from edge.config import Config
from edge.memory import Memory
claims, vectors = json.loads(Path(sys.argv[3]).read_text(encoding="utf-8"))
m = Memory(Config(device="tanishk", port=0, data_dir=Path(sys.argv[2])), embedder=None)
m.upsert_raw(claims[0], vectors)                    # a single write (capture)
m.update_fields(claims[0]["claim_id"], status="superseded")
with m.batch():                                     # a bulk write (sync pull)
    for c in claims[1:]:
        m.upsert_raw(c, vectors)
os._exit(0)                                         # like Stop-Process -Force: no close(), no flush()
"""


def test_writes_survive_a_hard_kill(data_dir, embedder):
    """demo.ps1 stops devices with Stop-Process -Force; nothing written before that may be lost."""
    import json
    import subprocess
    import sys
    from pathlib import Path

    claims = [make_claim("Kapoor invoice", "amount", str(85000 + i), f"Kapoor invoice {i}") for i in range(3)]
    vectors = {"text": [1.0] + [0.0] * 383, "key": [0.0, 1.0] + [0.0] * 382,
               "bm25": {"indices": [1, 2], "values": [0.5, 0.5]}}
    payload = data_dir / "claims.json"
    payload.write_text(json.dumps([claims, vectors]), encoding="utf-8")
    app_dir = Path(__file__).resolve().parents[1]
    done = subprocess.run([sys.executable, "-c", _HARD_KILL_WRITER, str(app_dir), str(data_dir), str(payload)],
                          capture_output=True, text=True, timeout=60)
    assert done.returncode == 0, done.stderr

    m = Memory(Config(device="tanishk", port=0, data_dir=data_dir), embedder)
    try:
        assert m.count() == 3
        assert m.get(claims[0]["claim_id"])["status"] == "superseded"
        assert all(m.get(c["claim_id"]) is not None for c in claims[1:])
    finally:
        m.close()


def test_pulled_point_round_trips_and_lands_in_the_same_place(data_dir, embedder, memory):
    claim = make_claim("Sharma wedding edit", "due_date", "2026-10-16", "Sharma edit due 16 Oct")
    memory.add_claim(claim)
    payload, vectors = memory.get_with_vectors(claim["claim_id"])
    assert set(vectors) == {"text", "key", "bm25"} and set(vectors["bm25"]) == {"indices", "values"}

    other = Memory(Config(device="lakshya", port=0, data_dir=data_dir), embedder)
    try:
        other.upsert_raw(payload, vectors)
        assert other.get(claim["claim_id"]) == claim
        assert other.xyz(claim) == memory.xyz(claim)  # same claim, same spot on both devices
        assert other.search("Sharma edit", view="team")[0][0]["claim_id"] == claim["claim_id"]
    finally:
        other.close()


def test_xyz_is_the_fixed_projection_of_the_text_vector(memory, embedder):
    claim = make_claim("Riya", "birthday", "2026-10-09", "Riya's birthday is 9 Oct")
    memory.add_claim(claim)
    text_vec = np.asarray(embedder.dense([claim["text"]])[0])
    expected = text_vec @ np.random.default_rng(7).normal(size=(384, 3)) * 6
    assert np.allclose(memory.xyz(claim), expected, atol=1e-3)


def test_point_id_is_uuid5_of_claim_id():
    assert point_id("clm_3f9a1c2b7d4e") == str(uuid.uuid5(uuid.NAMESPACE_URL, "clm_3f9a1c2b7d4e"))
