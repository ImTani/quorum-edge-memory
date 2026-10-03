"""HTTP API round trips with a fake extractor, in-memory store and a sync worker that never dials out."""
import asyncio
import json
import threading

import pytest
from fastapi.testclient import TestClient

import edge.api
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


def test_device_tier_claims_stay_private(make_client):
    client, ctx = make_client()
    claim = client.post("/api/ingest", json={"kind": "note", "text": "Salary credited today"}).json()["claims"][0]
    assert (claim["tier"], claim["sync"]) == ("device", "private")
    assert ctx.store.outbox_len() == 0

    mine = client.post("/api/ask", json={"q": "salary credited", "view": "mine"}).json()
    team = client.post("/api/ask", json={"q": "salary credited", "view": "team"}).json()
    assert claim["claim_id"] in [h["claim"]["claim_id"] for h in mine["hits"]]
    assert claim["claim_id"] not in [h["claim"]["claim_id"] for h in team["hits"]]


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
