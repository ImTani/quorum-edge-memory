"""Sync against a real Qdrant server hub (:6399 when free, storage under .cache/test-hub), with small fakes
for the core lane's Memory / conflicts / EventBus implementing only the contract methods sync uses."""
import json
import os
import shutil
import socket
import subprocess
import time
import uuid
from pathlib import Path
from types import SimpleNamespace

import httpx
import numpy as np
import pytest
import qdrant_edge as q
from qdrant_client import models

from edge import sync as sync_mod
from edge.store import Store
from edge.sync import HubOffline, SyncWorker, hub_point, make_client, point_id

APP = Path(__file__).resolve().parents[1]
HUB_EXE = APP / "hub" / "bin" / "qdrant.exe"
HUB_ROOT = APP.parent / ".cache" / "test-hub"
PREFERRED_PORTS = (6399, 6400)                       # HTTP, gRPC

_BM25 = q.Bm25(q.Bm25Config())


# ---- hub ---------------------------------------------------------------------------------

def _port_free(port: int) -> bool:
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", port)) == 0:
            return False
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def _pick_ports() -> tuple[int, int]:
    """6399/6400 when free; otherwise (another lane's test run owns them) two OS-assigned ports."""
    if all(_port_free(p) for p in PREFERRED_PORTS):
        return PREFERRED_PORTS
    ports = []
    for _ in range(2):
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            ports.append(probe.getsockname()[1])
    return ports[0], ports[1]


@pytest.fixture(scope="module")
def hub():
    """A private Qdrant server for this test module: own ports, own storage under .cache/test-hub,
    loopback only, stopped and deleted in teardown. Concurrent test runs don't share anything."""
    if not HUB_EXE.exists():
        pytest.skip("hub binary missing: run scripts/fetch_hub.ps1")
    http_port, grpc_port = _pick_ports()
    run_dir = HUB_ROOT / f"run-{uuid.uuid4().hex[:8]}"
    run_dir.mkdir(parents=True)
    url = f"http://127.0.0.1:{http_port}"
    env = dict(os.environ,
               QDRANT__STORAGE__STORAGE_PATH=str(run_dir / "storage"),
               QDRANT__STORAGE__SNAPSHOTS_PATH=str(run_dir / "snapshots"),
               QDRANT__SERVICE__HOST="127.0.0.1",
               QDRANT__SERVICE__HTTP_PORT=str(http_port),
               QDRANT__SERVICE__GRPC_PORT=str(grpc_port),
               QDRANT__TELEMETRY_DISABLED="true")
    log = open(run_dir / "hub.log", "wb")
    proc = subprocess.Popen([str(HUB_EXE)], cwd=run_dir, env=env, stdout=log, stderr=subprocess.STDOUT,
                            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    try:
        deadline = time.monotonic() + 30
        while True:
            if proc.poll() is not None:
                pytest.fail(f"hub exited early (code {proc.returncode}); see {run_dir / 'hub.log'}")
            try:
                if httpx.get(f"{url}/readyz", timeout=1).status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            if time.monotonic() > deadline:
                pytest.fail("hub not ready after 30 s")
            time.sleep(0.2)
        yield url
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(5)
        log.close()
        shutil.rmtree(run_dir, ignore_errors=True)


@pytest.fixture
def collection(hub):
    """A fresh hub collection per test, so tests never see each other's points."""
    name = f"t_{uuid.uuid4().hex[:10]}"
    yield name
    client = make_client(hub)
    try:
        if client.collection_exists(name):
            client.delete_collection(name)
    finally:
        client.close()


@pytest.fixture
def hub_client(hub):
    client = make_client(hub)
    yield client
    client.close()


# ---- fakes -------------------------------------------------------------------------------

def fake_vectors(text: str) -> dict:
    rng = np.random.default_rng(abs(hash(text)) % (2**32))
    def unit():
        v = rng.normal(size=384)
        return (v / np.linalg.norm(v)).tolist()
    return {"text": unit(), "key": unit(), "bm25": _BM25.embed_document(text)}


class FakeMemory:
    """In-memory stand-in for edge.memory.Memory (only the methods sync calls)."""

    def __init__(self):
        self.points = {}
        self.upserts = []

    def add(self, claim):
        self.points[claim["claim_id"]] = (dict(claim), fake_vectors(claim["text"]))
        return claim

    def get(self, claim_id):
        p = self.points.get(claim_id)
        return dict(p[0]) if p else None

    def get_with_vectors(self, claim_id):
        p = self.points.get(claim_id)
        return (dict(p[0]), dict(p[1])) if p else (None, None)

    def upsert_raw(self, claim, vectors):
        self.upserts.append(claim["claim_id"])
        self.points[claim["claim_id"]] = (dict(claim), dict(vectors))

    def update_fields(self, claim_id, **fields):
        claim, vectors = self.points[claim_id]
        claim = dict(claim, **fields)
        claim["version"] += 1
        claim["modified_at"] = tick()
        self.points[claim_id] = (claim, vectors)
        return claim

    def xyz(self, claim):
        return [0.0, 0.0, 0.0]


class FakeBus:
    def __init__(self):
        self.events = []

    def publish(self, type_, data):
        self.events.append((type_, data))

    def of(self, type_):
        return [d for t, d in self.events if t == type_]


class FakeConflicts:
    def __init__(self):
        self.checked, self.resolutions = [], []
        self.check = lambda ctx, claim, detected_on: self.checked.append((claim["claim_id"], detected_on))
        self.apply_remote_resolution = lambda ctx, claim: self.resolutions.append(claim["claim_id"])


def make_device(data_dir, device, collection, hub_url):
    cfg = SimpleNamespace(device=device, hub_url=hub_url, hub_collection=collection, data_dir=data_dir)
    ctx = SimpleNamespace(cfg=cfg, memory=FakeMemory(), store=Store(cfg), bus=FakeBus(),
                          conflicts=FakeConflicts())
    ctx.sync = SyncWorker(ctx)
    return ctx


def close_device(ctx):
    ctx.sync.stop()
    ctx.store.close()


@pytest.fixture
def devices(data_dir, collection, hub):
    a = make_device(data_dir, "tanishk", collection, hub)
    b = make_device(data_dir, "lakshya", collection, hub)
    yield a, b
    close_device(a)
    close_device(b)


_clock = [int(time.time() * 1000)]


def tick() -> int:
    """One strictly increasing clock for every modified_at in these tests (devices share a machine)."""
    _clock[0] = max(_clock[0] + 1, int(time.time() * 1000))
    return _clock[0]


def make_claim(by, text, tier="team", attribute="due_date", value="2026-10-18", **extra):
    claim = {
        "claim_id": "clm_" + uuid.uuid4().hex[:12], "text": text, "entity": text.split(" due")[0],
        "entity_kind": "task", "attribute": attribute, "value": value, "value_label": value,
        "owner": by, "source": {"kind": "note", "ref": "note:test", "author": by, "excerpt": text,
                                 "at": "2026-10-03T14:02:00+05:30"},
        "stated_at": "2026-10-03T14:02:00+05:30", "captured_by": by, "device_id": f"dev_{by}",
        "tier": tier, "status": "active", "conflict_id": None, "resolves": None,
        "version": 1, "modified_at": tick(), "modified_by": by,
    }
    claim.update(extra)
    return claim


def capture(ctx, claim):
    """What the core lane does on ingest: store the point, enqueue it if it may leave the device."""
    ctx.memory.add(claim)
    if claim["tier"] in ("team", "my_devices"):
        ctx.store.enqueue(claim["claim_id"])
    return claim


def hub_payloads(client, collection):
    records, _ = client.scroll(collection, limit=1000, with_payload=True)
    return [r.payload for r in records]


# ---- tests -------------------------------------------------------------------------------

def test_push_from_a_pull_on_b(devices, hub_client, collection):
    a, b = devices
    claim = capture(a, make_claim("tanishk", "Sharma wedding edit due 18 Oct"))

    a.sync.sync_once()
    assert a.store.outbox_len() == 0
    status = a.sync.status()
    assert status["hub_ok"] and status["last_push"] and status["bytes_up"] > 0 and status["bytes_down"] > 0
    assert [p["claim_id"] for p in hub_payloads(hub_client, collection)] == [claim["claim_id"]]

    b.sync.sync_once()
    pulled, vectors = b.memory.get_with_vectors(claim["claim_id"])
    assert pulled == claim
    assert np.allclose(vectors["text"], a.memory.points[claim["claim_id"]][1]["text"], atol=1e-5)
    assert list(vectors["bm25"].indices) == list(a.memory.points[claim["claim_id"]][1]["bm25"].indices)
    assert b.conflicts.checked == [(claim["claim_id"], "sync")]
    assert b.store.kv_get("pull_cursor") == claim["modified_at"]
    assert any(e["kind"] == "sync_pull" for e in b.bus.of("activity"))
    assert b.bus.of("claim")[-1]["sync"] == "synced"

    a.sync.sync_once()                               # a never re-imports its own claim
    assert a.memory.upserts == [] and a.conflicts.checked == []


def test_cursor_advances_and_nothing_is_pulled_twice(devices):
    a, b = devices
    first = capture(a, make_claim("tanishk", "Mehta reel cutdowns due 6 Oct"))
    a.sync.sync_once()
    b.sync.sync_once()
    b.sync.sync_once()
    assert b.memory.upserts == [first["claim_id"]]

    second = capture(a, make_claim("tanishk", "Kapoor invoice due 10 Oct"))
    a.sync.sync_once()
    b.sync.sync_once()
    assert b.memory.upserts == [first["claim_id"], second["claim_id"]]
    assert b.store.kv_get("pull_cursor") == second["modified_at"]


def test_version_check_and_resolution_claims(devices):
    a, b = devices
    claim = capture(a, make_claim("tanishk", "Pangong shoot due 20 Oct"))
    a.sync.sync_once()
    b.sync.sync_once()

    # A newer remote version replaces the local copy without re-running conflict detection.
    a.memory.update_fields(claim["claim_id"], status="superseded", modified_by="tanishk")
    a.store.enqueue(claim["claim_id"])
    a.sync.sync_once()
    b.sync.sync_once()
    assert b.memory.get(claim["claim_id"])["version"] == 2
    assert b.memory.get(claim["claim_id"])["status"] == "superseded"
    assert b.conflicts.checked == [(claim["claim_id"], "sync")]

    # A remote version that is not newer than ours is ignored.
    local, vecs = b.memory.points[claim["claim_id"]]
    b.memory.points[claim["claim_id"]] = (dict(local, version=9, status="active"), vecs)
    a.memory.update_fields(claim["claim_id"], status="retracted")
    a.store.enqueue(claim["claim_id"])
    a.sync.sync_once()
    b.sync.sync_once()
    assert b.memory.get(claim["claim_id"])["version"] == 9
    assert b.memory.get(claim["claim_id"])["status"] == "active"

    # A pulled resolution claim goes to apply_remote_resolution, not to conflict detection.
    resolution = capture(a, make_claim("tanishk", "Resolved: Pangong shoot 20 Oct (chosen by Tanishk)",
                                       attribute="resolution", value=claim["claim_id"], resolves="cfl_abc"))
    a.sync.sync_once()
    b.sync.sync_once()
    assert b.conflicts.resolutions == [resolution["claim_id"]]
    assert resolution["claim_id"] not in [cid for cid, _ in b.conflicts.checked]


def test_offline_means_zero_hub_traffic(devices, hub_client, collection):
    a, _ = devices
    a.sync.set_online(False)
    claim = capture(a, make_claim("tanishk", "Sharma wedding edit due 18 Oct"))
    for _ in range(3):
        a.sync.sync_once()
    status = a.sync.status()
    assert a.sync.requests == 0 and status["bytes_up"] == 0 and status["bytes_down"] == 0
    assert status["online"] is False and status["outbox"] == 1
    with pytest.raises(HubOffline):                  # enforced at the transport, not just the loop
        a.sync.client.get_collections()
    assert a.sync.requests == 0
    assert not hub_client.collection_exists(collection)
    assert a.bus.of("sync")[-1]["online"] is False
    assert a.store.recent_activity(1)[0]["kind"] == "net"

    a.sync.set_online(True)
    a.sync.sync_once()
    assert a.store.outbox_len() == 0
    assert [p["claim_id"] for p in hub_payloads(hub_client, collection)] == [claim["claim_id"]]


def test_device_tier_claim_never_reaches_hub(devices, hub_client, collection):
    a, b = devices
    private = make_claim("tanishk", "Salary credited 45000", tier="device", attribute="amount", value="45000")
    a.memory.add(private)
    a.store.enqueue(private["claim_id"])             # a bug elsewhere put it in the outbox anyway
    team = capture(a, make_claim("tanishk", "Mehta reel cutdowns due 6 Oct"))
    mine = capture(a, make_claim("tanishk", "Riya birthday 12 Oct", tier="my_devices", attribute="birthday"))

    a.sync.sync_once()
    payloads = hub_payloads(hub_client, collection)
    assert sorted(p["claim_id"] for p in payloads) == sorted([team["claim_id"], mine["claim_id"]])
    assert all(p["tier"] != "device" for p in payloads)
    assert hub_client.retrieve(collection, [point_id(private["claim_id"])]) == []
    assert a.store.outbox_len() == 0                 # dropped, not retried forever

    # The tier is read at push time: demoting a queued claim to device keeps it home.
    late = capture(a, make_claim("tanishk", "Friend's private news"))
    a.memory.update_fields(late["claim_id"], tier="device")
    a.sync.sync_once()
    assert hub_client.retrieve(collection, [point_id(late["claim_id"])]) == []

    with pytest.raises(ValueError):
        hub_point(private, fake_vectors(private["text"]))

    b.sync.sync_once()                               # another person's my_devices claim is not pulled
    assert b.memory.get(mine["claim_id"]) is None
    assert b.memory.get(team["claim_id"]) is not None


def test_disputed_state_and_ui_fields_stay_local(devices, hub_client, collection):
    a, _ = devices
    claim = make_claim("tanishk", "Sharma wedding edit due 18 Oct", status="disputed", conflict_id="cfl_1")
    claim.update(sync="queued", xyz=[1, 2, 3])
    capture(a, claim)
    a.sync.sync_once()
    (payload,) = hub_payloads(hub_client, collection)
    assert payload["status"] == "active" and payload["conflict_id"] is None
    assert "sync" not in payload and "xyz" not in payload


def test_outbox_survives_restart(data_dir, collection, hub, hub_client):
    a = make_device(data_dir, "tanishk", collection, hub)
    a.sync.set_online(False)
    claim = capture(a, make_claim("tanishk", "Kapoor invoice due 10 Oct"))
    memory = a.memory
    close_device(a)

    a = make_device(data_dir, "tanishk", collection, hub)  # same sqlite file, fresh process state
    a.memory = memory                                # the shard persists separately (core lane)
    try:
        assert a.store.outbox_ids() == {claim["claim_id"]}
        a.sync.sync_once()
        assert a.store.outbox_len() == 0
        assert [p["claim_id"] for p in hub_payloads(hub_client, collection)] == [claim["claim_id"]]
    finally:
        close_device(a)


def test_collection_schema(devices, hub_client, collection):
    a, _ = devices
    assert a.sync.ensure_collection() is True
    assert a.sync.ensure_collection() is False       # idempotent
    info = hub_client.get_collection(collection)
    vectors = info.config.params.vectors
    assert {n: (v.size, v.distance) for n, v in vectors.items()} == {
        "text": (384, models.Distance.COSINE), "key": (384, models.Distance.COSINE)}
    assert info.config.params.sparse_vectors["bm25"].modifier == models.Modifier.IDF
    schema = {k: v.data_type for k, v in info.payload_schema.items()}
    assert schema == {"modified_at": models.PayloadSchemaType.INTEGER,
                      **{k: models.PayloadSchemaType.KEYWORD
                         for k in ("tier", "modified_by", "captured_by", "attribute")}}


def test_unreachable_hub_backs_off(data_dir, collection):
    ctx = make_device(data_dir, "tanishk", collection, hub_url="http://127.0.0.1:6398")
    try:
        capture(ctx, make_claim("tanishk", "Mehta reel cutdowns due 6 Oct"))
        ctx.sync.sync_once()
        status = ctx.sync.status()
        assert not status["hub_ok"] and status["last_error"] and status["outbox"] == 1
        ctx.sync.sync_once()                         # inside the backoff window: no new attempt
        assert ctx.sync._failures == 1

        delays = []
        for _ in range(6):
            ctx.sync._on_hub_error(RuntimeError("down"))
            delays.append(round(ctx.sync._retry_at - time.monotonic(), 1))
        assert delays == [1.0, 2.0, 4.0, 5.0, 5.0, 5.0]
        assert max(delays) <= sync_mod.BACKOFF_MAX_S
    finally:
        close_device(ctx)


def test_background_thread_drains_outbox_and_stops(devices):
    a, _ = devices
    a.sync.interval = 0.1
    a.sync.ensure_collection()                       # keep slow first-time setup out of the timing
    a.sync.start()
    capture(a, make_claim("tanishk", "Sharma wedding edit due 18 Oct"))
    deadline = time.monotonic() + 15                 # generous: other test runs may load the machine
    while (a.store.outbox_len() or not a.bus.of("sync")) and time.monotonic() < deadline:
        time.sleep(0.05)
    assert a.store.outbox_len() == 0, a.sync.status()
    assert a.bus.of("sync"), "status events are published from the loop"
    a.sync.stop()
    assert not a.sync.is_alive()


def test_seed_then_real_memory_round_trip(data_dir, collection, hub, hub_client, embedder):
    """seed.py end to end, then a push/pull with the core lane's real Memory on both sides."""
    from edge import seed as seed_mod
    from edge.config import FIXTURES_DIR, Config
    from edge.memory import Memory

    seed_path = FIXTURES_DIR / "seed.json"
    if not seed_path.exists():
        pytest.skip("fixtures/seed.json not written yet")
    data = json.loads(seed_path.read_text(encoding="utf-8"))
    result = seed_mod.seed(hub, data_dir, seed_path, collection)

    shared = data["shared"]
    on_hub = shared + [c for d in seed_mod.DEVICES for c in data.get(d, []) if c["tier"] != "device"]
    payloads = hub_payloads(hub_client, collection)
    assert sorted(p["claim_id"] for p in payloads) == sorted(c["claim_id"] for c in on_hub)
    assert all(p["tier"] != "device" for p in payloads)
    cursor = max(c["modified_at"] for group in data.values() for c in group)
    assert result["pull_cursor"] == cursor

    ctxs = {}
    try:
        for device in seed_mod.DEVICES:
            cfg = Config(device=device, hub_url=hub, data_dir=data_dir, hub_collection=collection)
            ctx = SimpleNamespace(cfg=cfg, memory=Memory(cfg, embedder), store=Store(cfg), bus=FakeBus(),
                                  conflicts=FakeConflicts())
            ctx.sync = SyncWorker(ctx)
            ctxs[device] = ctx
            assert ctx.memory.count() == len(shared) + len(data.get(device, []))
            assert ctx.store.kv_get("pull_cursor") == cursor

        t, l = ctxs["tanishk"], ctxs["lakshya"]
        l.sync.sync_once()                           # seeded claims are not pulled again
        assert l.conflicts.checked == []

        note = make_claim("tanishk", "Sharma wedding edit delivery is due 18 Oct", entity="Sharma wedding edit")
        t.memory.add_claim(note)
        t.store.enqueue(note["claim_id"])
        t.sync.sync_once()
        l.sync.sync_once()
        assert l.memory.get(note["claim_id"]) == note
        _, sent = t.memory.get_with_vectors(note["claim_id"])
        _, got = l.memory.get_with_vectors(note["claim_id"])
        assert np.allclose(sent["key"], got["key"], atol=1e-5)
        assert got["bm25"]["indices"] == sent["bm25"]["indices"]
        assert l.conflicts.checked == [(note["claim_id"], "sync")]
        hits = l.memory.search("Sharma delivery", view="team")
        assert hits and hits[0][0]["claim_id"] == note["claim_id"]
    finally:
        for ctx in ctxs.values():
            ctx.sync.stop()
            ctx.memory.close()
            ctx.store.close()
