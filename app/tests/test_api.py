"""HTTP API round trips with a fake extractor, in-memory store and a sync worker that never dials out."""
import asyncio
import json
import threading
import time

import pytest
from fastapi.testclient import TestClient

import edge.api
import edge.conflicts
import edge.extract
from edge.config import Config
from edge.events import EventBus
from test_conflicts import FakeStore
from test_memory import make_claim


def _draft(entity, attribute, value, label, text, tier="team"):
    return {"text": text, "entity": entity, "entity_kind": "task", "attribute": attribute,
            "value": value, "value_label": label, "tier": tier}


def fake_extract_with_meta(text, source, cfg, known_entities):
    if "18th" in text:
        return [_draft("Sharma wedding edit", "due_date", "2026-10-18", "18 Oct",
                       "Sharma wedding edit delivery is due 18 Oct")], "llm"
    if "16 October" in text:
        return [_draft("Sharma wedding edit", "due_date", "2026-10-16", "16 Oct",
                       "Sharma wedding edit final delivery on 16 Oct")], "fallback"
    if "Salary" in text:
        return [_draft("Salary", "amount", "120000", "₹1,20,000", "Salary of 1,20,000 credited", tier="device")], "llm"
    return [], "fallback"


class FakeSync:
    def __init__(self, store):
        self.store, self.online = store, True

    def set_online(self, online):
        self.online = online
        return self.status()

    def status(self):
        return {"online": self.online, "hub_ok": False, "outbox": self.store.outbox_len(), "bytes_up": 0,
                "bytes_down": 0, "last_push": None, "last_pull": None, "last_error": None}


INBOX = [{"id": "eml_sharma", "from": "Rohit Sharma <rohit@example.com>", "subject": "Re: Sharma wedding edit",
          "text": "Hi,\n\nConfirming final delivery of the Sharma wedding edit on 16 October.\n\nThanks",
          "at": "2026-10-03T14:03:00+05:30"}]


@pytest.fixture
def make_client(data_dir, embedder, monkeypatch):
    monkeypatch.setattr(edge.extract, "extract_with_meta", fake_extract_with_meta)
    fixtures = data_dir / "fixtures"
    fixtures.mkdir()
    for device in ("tanishk", "lakshya"):
        (fixtures / f"inbox_{device}.json").write_text(json.dumps(INBOX), encoding="utf-8")
    monkeypatch.setattr(edge.api, "FIXTURES_DIR", fixtures)
    clients = []

    def make(device="tanishk"):
        store = FakeStore()
        app = edge.api.create_app(Config(device=device, port=0, data_dir=data_dir),
                                  embedder=embedder, store=store, sync=FakeSync(store))
        client = TestClient(app).__enter__()  # runs lifespan; closed (shard released) below
        clients.append(client)
        return client, app.state.ctx

    yield make
    for client in clients:
        client.__exit__(None, None, None)


NOTE = {"kind": "note", "text": "Client just called: Sharma delivery moves to the 18th."}


def test_ingest_state_ask_round_trip(make_client):
    client, ctx = make_client()

    r = client.post("/api/ingest", json=NOTE).json()
    assert r["extractor"] == "llm" and r["conflicts"] == []
    (claim,) = r["claims"]
    assert (claim["tier"], claim["sync"], claim["owner"], claim["version"]) == ("team", "queued", "tanishk", 1)
    assert claim["source"]["kind"] == "note" and claim["source"]["excerpt"].startswith("Client just called")
    assert len(claim["xyz"]) == 3
    assert ctx.store.outbox_ids() == {claim["claim_id"]}

    state = client.get("/api/state").json()
    assert (state["device"], state["display_name"], state["today"]) == ("tanishk", "Tanishk · on set", "2026-10-03")
    assert [c["claim_id"] for c in state["claims"]] == [claim["claim_id"]]
    assert state["claims"][0]["xyz"] == claim["xyz"] and state["sync"]["outbox"] == 1
    assert state["peers"]["lakshya"] == "http://127.0.0.1:8002"
    assert state["activity"][0]["kind"] == "claim_added"

    ask = client.post("/api/ask", json={"q": "when is the Sharma delivery?", "view": "team"}).json()
    assert "18 Oct" in ask["answer"] and ask["disputed"] is False
    assert ask["citations"][0]["claim_id"] == claim["claim_id"] and ask["citations"][0]["kind"] == "note"
    assert ask["hits"][0]["claim"]["claim_id"] == claim["claim_id"] and ask["took_ms"] >= 0


def test_inbox_email_conflicts_with_note_then_owner_resolves(make_client):
    client, ctx = make_client("tanishk")
    note = client.post("/api/ingest", json=NOTE).json()["claims"][0]

    assert [e["id"] for e in client.get("/api/inbox").json()] == ["eml_sharma"]
    received = client.post("/api/inbox/eml_sharma/receive").json()
    assert client.get("/api/inbox").json() == []
    assert client.post("/api/inbox/eml_sharma/receive").status_code == 404

    email = received["claims"][0]
    assert email["source"]["excerpt"] == "Confirming final delivery of the Sharma wedding edit on 16 October."
    assert email["owner"] == "tanishk"  # inherited from the existing Sharma entity
    (conflict,) = received["conflicts"]
    assert conflict["similarity"] >= 0.82 and conflict["owner"] == "tanishk" and conflict["detected_on"] == "ingest"
    assert email["status"] == "disputed"

    ask = client.post("/api/ask", json={"q": "when is the Sharma delivery?", "view": "mine"}).json()
    assert ask["answer"].startswith("Disputed: the client's email says 16 Oct; Tanishk's note from the call says 18 Oct.")
    assert ask["disputed"] is True and len(ask["citations"]) == 2

    draft = client.post(f"/api/conflicts/{conflict['conflict_id']}/draft").json()
    assert draft["to"] == "Tanishk" and draft["mailto"].startswith("mailto:") and draft["wa_link"].startswith("https://wa.me/")

    cid = conflict["conflict_id"]
    assert client.post(f"/api/conflicts/{cid}/resolve", json={"winner_claim_id": "clm_nope"}).status_code == 400
    resolved = client.post(f"/api/conflicts/{cid}/resolve", json={"winner_claim_id": note["claim_id"]}).json()
    assert resolved["status"] == "resolved" and resolved["winner_claim_id"] == note["claim_id"]

    claims = {c["claim_id"]: c for c in client.get("/api/state").json()["claims"]}
    assert claims[email["claim_id"]]["status"] == "superseded"
    assert claims[note["claim_id"]]["status"] == "active"
    assert claims[resolved["resolution_claim_id"]]["attribute"] == "resolution"

    after = client.post("/api/ask", json={"q": "when is the Sharma delivery?", "view": "team"}).json()
    assert after["disputed"] is False and "18 Oct" in after["answer"] and "16 Oct" not in after["answer"]


def test_only_the_owner_can_resolve(make_client):
    client, ctx = make_client("lakshya")
    ctx.memory.add_claim(make_claim("Sharma wedding edit", "assignee", "tanishk", "Tanishk is editing the Sharma wedding"))
    client.post("/api/ingest", json=NOTE)
    conflict = client.post("/api/inbox/eml_sharma/receive").json()["conflicts"][0]
    assert conflict["owner"] == "tanishk"
    r = client.post(f"/api/conflicts/{conflict['conflict_id']}/resolve", json={"winner_claim_id": conflict["claim_ids"][0]})
    assert r.status_code == 403
    assert client.post("/api/conflicts/cfl_missing/resolve", json={"winner_claim_id": "x"}).status_code == 404


def test_a_conflict_owned_by_someone_without_a_device_can_be_settled(make_client):
    """Seeded tasks belong to Aayat and Tushar, who run no device in the demo."""
    client, ctx = make_client("lakshya")
    a = make_claim("Kapoor invoice", "due_date", "2026-10-08", "Kapoor invoice is due 8 Oct", owner="aayat")
    b = make_claim("Kapoor invoice", "due_date", "2026-10-10", "Kapoor invoice is due 10 Oct", owner="aayat")
    for c in (a, b):
        ctx.memory.add_claim(c)
    conflict = edge.conflicts.check(ctx, b, detected_on="ingest")
    assert conflict["owner"] == "aayat"
    r = client.post(f"/api/conflicts/{conflict['conflict_id']}/resolve", json={"winner_claim_id": b["claim_id"]})
    assert r.status_code == 200 and r.json()["status"] == "resolved"
    assert edge.api.can_settle({"owner": "tanishk"}, "lakshya") is False


def test_receiving_the_same_email_twice_ingests_it_once(make_client, monkeypatch):
    """A double click or a client retry while the slow extraction runs."""
    def slow_extract(*args):
        time.sleep(0.4)
        return fake_extract_with_meta(*args)

    client, ctx = make_client("lakshya")
    monkeypatch.setattr(edge.extract, "extract_with_meta", slow_extract)
    barrier = threading.Barrier(2)
    codes = []

    def click():
        barrier.wait()
        codes.append(client.post("/api/inbox/eml_sharma/receive").status_code)

    threads = [threading.Thread(target=click) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(codes) == [200, 404]
    assert len([c for c in ctx.memory.all_claims() if c["value"] == "2026-10-16"]) == 1


def test_a_failed_receive_puts_the_email_back(make_client, monkeypatch):
    def broken(*args):
        raise RuntimeError("extractor crashed")

    client, ctx = make_client("lakshya")
    monkeypatch.setattr(edge.extract, "extract_with_meta", broken)
    with pytest.raises(RuntimeError):
        client.post("/api/inbox/eml_sharma/receive")
    assert [e["id"] for e in client.get("/api/inbox").json()] == ["eml_sharma"]


def test_device_tier_claims_stay_private(make_client):
    client, ctx = make_client()
    claim = client.post("/api/ingest", json={"kind": "note", "text": "Salary credited today"}).json()["claims"][0]
    assert (claim["tier"], claim["sync"]) == ("device", "private")
    assert ctx.store.outbox_len() == 0

    mine = client.post("/api/ask", json={"q": "salary credited", "view": "mine"}).json()
    team = client.post("/api/ask", json={"q": "salary credited", "view": "team"}).json()
    assert claim["claim_id"] in [h["claim"]["claim_id"] for h in mine["hits"]]
    assert claim["claim_id"] not in [h["claim"]["claim_id"] for h in team["hits"]]


def test_follow_up_about_a_private_entity_stays_on_the_device(make_client, monkeypatch):
    """The extractor promotes any known entity to team; a device-only entity must not be promoted."""
    def extract_kabir(text, source, cfg, known_entities):
        assert "Kabir" in known_entities              # snapping still sees private entities
        return [_draft("Kabir", "due_date", "2026-10-12", "12 Oct", "Kabir is due 12 Oct")], "llm"

    client, ctx = make_client()
    ctx.memory.add_claim(make_claim("Kabir", "note", "got into FTII", "Kabir got into FTII, keep it quiet",
                                    tier="device"))
    ctx.memory.add_claim(make_claim("Riya", "birthday", "2026-10-09", "Riya's birthday is 9 Oct", tier="my_devices"))
    monkeypatch.setattr(edge.extract, "extract_with_meta", extract_kabir)
    claim = client.post("/api/ingest", json={"kind": "note", "text": "Kabir moves to Pune on 12 Oct"}).json()["claims"][0]
    assert (claim["tier"], claim["sync"]) == ("device", "private")
    assert ctx.store.outbox_len() == 0

    assert edge.api._capped_tier("team", "my_devices") == "my_devices"
    assert edge.api._capped_tier("team", "team") == "team"
    assert edge.api._capped_tier("team", None) == "team"   # a new entity: the extractor's rules decide
    assert edge.api._capped_tier("device", "team") == "device"


@pytest.mark.parametrize("device,private_claim,note", [
    ("tanishk", ("Kabir", "Kabir got into FTII screenwriting, not public yet"),
     "Kabir moves to Pune for the FTII course on 12 Oct"),
    ("lakshya", ("Meher", "Meher is quitting her agency job next month, manager doesn't know"),
     "Meher's farewell lunch is on 30 Oct at Bastian"),
])
def test_private_entity_follow_up_on_the_real_fallback_extractor(data_dir, embedder, monkeypatch,
                                                                  device, private_claim, note):
    def llm_down(*a, **k):
        raise edge.extract.LLMUnavailable("test: fallback path")

    monkeypatch.setattr(edge.extract, "_ask_llm", llm_down)
    store = FakeStore()
    ctx = edge.api.build_ctx(Config(device=device, port=0, data_dir=data_dir), embedder=embedder,
                             store=store, sync=FakeSync(store))
    try:
        entity, text = private_claim
        ctx.memory.add_claim(make_claim(entity, "note", text, text, tier="device"))
        claims = edge.api.ingest(ctx, "note", note)["claims"]
        assert claims and all(c["tier"] == "device" for c in claims), claims
        assert store.outbox_len() == 0
    finally:
        ctx.memory.close()


def test_unrelated_unnamed_notes_do_not_conflict_on_the_fallback_path(data_dir, embedder, monkeypatch):
    def llm_down(*a, **k):
        raise edge.extract.LLMUnavailable("test: fallback path")

    monkeypatch.setattr(edge.extract, "_ask_llm", llm_down)
    store = FakeStore()
    ctx = edge.api.build_ctx(Config(device="tanishk", port=0, data_dir=data_dir), embedder=embedder,
                             store=store, sync=FakeSync(store))
    try:
        edge.api.ingest(ctx, "note", "pick up the hard drives from the rental by 7 Oct")
        second = edge.api.ingest(ctx, "note", "need to deliver the colour grade samples by 9 Oct")
        assert second["conflicts"] == [] and store.list_conflicts() == []
        # The demo pair still conflicts on the same path (the seed knows the Sharma entity).
        ctx.memory.add_claim(make_claim("Sharma wedding edit", "assignee", "tanishk", "Tanishk is editing the Sharma wedding"))
        edge.api.ingest(ctx, "email", "Confirming final delivery of the Sharma wedding edit on 16 October.")
        demo = edge.api.ingest(ctx, "note", "Client just called: Sharma delivery moves to the 18th.")
        assert [c["entity"] for c in demo["conflicts"]] == ["Sharma wedding edit"]
    finally:
        ctx.memory.close()


def test_net_toggle_goes_to_the_sync_worker(make_client):
    client, ctx = make_client()
    assert client.post("/api/net", json={"online": False}).json()["online"] is False
    assert ctx.sync.online is False


def test_ui_is_served_at_root_and_web(data_dir, embedder, monkeypatch):
    web = data_dir / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>Quorum</title>", encoding="utf-8")
    (web / "app.js").write_text("console.log('hi')", encoding="utf-8")
    monkeypatch.setattr(edge.api, "WEB_DIR", web)
    store = FakeStore()
    app = edge.api.create_app(Config(device="tanishk", port=0, data_dir=data_dir), embedder=embedder,
                              store=store, sync=FakeSync(store))
    with TestClient(app) as client:
        assert "<title>Quorum</title>" in client.get("/").text
        assert client.get("/app.js").text == "console.log('hi')"  # index.html's relative paths
        assert client.get("/web/app.js").text == "console.log('hi')"
        assert client.get("/api/state").json()["device"] == "tanishk"  # API routes still win


def test_stage_is_served_at_slash_stage_and_under_web(data_dir, embedder, monkeypatch):
    web = data_dir / "web"
    web.mkdir()
    (web / "index.html").write_text("<!doctype html><title>Quorum</title>", encoding="utf-8")
    (web / "stage.html").write_text("<!doctype html><title>Quorum stage</title>", encoding="utf-8")
    monkeypatch.setattr(edge.api, "WEB_DIR", web)
    store = FakeStore()
    app = edge.api.create_app(Config(device="tanishk", port=0, data_dir=data_dir), embedder=embedder,
                              store=store, sync=FakeSync(store))
    with TestClient(app) as client:
        res = client.get("/stage")
        assert res.status_code == 200 and res.headers["content-type"].startswith("text/html")
        assert "Quorum stage" in res.text
        assert "Quorum stage" in client.get("/web/stage.html").text
        assert "<title>Quorum</title>" in client.get("/").text  # the single-device page is unchanged


@pytest.mark.parametrize("origin", ["http://127.0.0.1:8001", "http://localhost:8002", "http://127.0.0.1:5173"])
def test_cors_lets_a_local_stage_call_this_device(make_client, origin):
    client, _ = make_client()
    res = client.get("/api/state", headers={"Origin": origin})
    assert res.headers["access-control-allow-origin"] == origin
    pre = client.options("/api/ask", headers={"Origin": origin, "Access-Control-Request-Method": "POST",
                                              "Access-Control-Request-Headers": "content-type"})
    assert pre.status_code == 200
    assert pre.headers["access-control-allow-origin"] == origin
    assert "POST" in pre.headers["access-control-allow-methods"]


@pytest.mark.parametrize("origin", ["http://evil.example", "https://127.0.0.1.evil.example", "http://127.0.0.1.nip.io:8001"])
def test_cors_refuses_other_origins(make_client, origin):
    client, _ = make_client()
    res = client.get("/api/state", headers={"Origin": origin})
    assert "access-control-allow-origin" not in res.headers
    pre = client.options("/api/net", headers={"Origin": origin, "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in pre.headers


def test_event_bus_fans_out_across_threads_with_heartbeat():
    async def scenario():
        bus = EventBus()
        stream = bus.subscribe(heartbeat=0.2)
        first = asyncio.ensure_future(stream.__anext__())
        await asyncio.sleep(0.05)  # let the subscriber register
        threading.Thread(target=bus.publish, args=("claim", {"claim_id": "clm_1"})).start()
        message = await asyncio.wait_for(first, 2)
        heartbeat = await asyncio.wait_for(stream.__anext__(), 2)
        count = bus.subscriber_count()
        await stream.aclose()
        return message, heartbeat, count, bus.subscriber_count()

    message, heartbeat, during, after = asyncio.run(scenario())
    assert message == {"type": "claim", "data": {"claim_id": "clm_1"}}
    assert heartbeat is None and (during, after) == (1, 0)
