"""Conflicts: detection on the key vector, deterministic ids, local disputed marks, resolution."""
from types import SimpleNamespace

import pytest

from edge import conflicts
from edge.config import Config
from edge.memory import Memory
from test_memory import make_claim


class FakeStore:
    """In-memory stand-in for edge.store.Store (same method names)."""

    def __init__(self):
        self.outbox, self.conflicts, self.activity, self.kv = [], {}, [], {}

    def enqueue(self, claim_id):
        if claim_id not in self.outbox:
            self.outbox.append(claim_id)

    def outbox_peek(self, n=64):
        return [{"claim_id": c, "gen": 1} for c in self.outbox[:n]]

    def outbox_ack(self, claim_ids, gens=None):
        self.outbox = [c for c in self.outbox if c not in set(claim_ids)]

    def outbox_len(self):
        return len(self.outbox)

    def outbox_ids(self):
        return set(self.outbox)

    def in_outbox(self, claim_id):
        return claim_id in self.outbox

    def put_conflict(self, conflict):
        self.conflicts[conflict["conflict_id"]] = dict(conflict)
        return conflict

    def get_conflict(self, conflict_id):
        c = self.conflicts.get(conflict_id)
        return dict(c) if c else None

    def list_conflicts(self, status=None):
        return [dict(c) for c in self.conflicts.values() if status in (None, c["status"])]

    def update_conflict(self, conflict_id, **fields):
        self.conflicts[conflict_id].update(fields)
        return dict(self.conflicts[conflict_id])

    def log(self, kind, text):
        entry = {"at": "2026-10-03T14:05:00+05:30", "kind": kind, "text": text}
        self.activity.append(entry)
        return entry

    def recent_activity(self, n=60):
        return list(reversed(self.activity))[:n]

    def kv_get(self, key, default=None):
        return self.kv.get(key, default)

    def kv_set(self, key, value):
        self.kv[key] = value

    def close(self):
        pass


class RecordingBus:
    def __init__(self):
        self.events = []

    def publish(self, type_, data):
        self.events.append((type_, data))

    def types(self):
        return [t for t, _ in self.events]


def make_ctx(data_dir, embedder, device):
    cfg = Config(device=device, port=0, data_dir=data_dir)
    return SimpleNamespace(cfg=cfg, memory=Memory(cfg, embedder), store=FakeStore(), bus=RecordingBus(), sync=None)


@pytest.fixture
def ctx(data_dir, embedder):
    c = make_ctx(data_dir, embedder, "tanishk")
    yield c
    c.memory.close()


def sharma_email():
    return make_claim(
        "Sharma wedding edit", "due_date", "2026-10-16", "Final delivery of the Sharma wedding edit on 16 October",
        value_label="16 Oct", captured_by="lakshya", modified_by="lakshya", stated_at="2026-10-03T14:03:00+05:30",
        source={"kind": "email", "ref": "email:eml_1", "author": "Rohit Sharma <rohit@example.com>",
                "excerpt": "Confirming final delivery of the Sharma wedding edit on 16 October.",
                "at": "2026-10-03T14:03:00+05:30"},
    )


def sharma_note():
    """Same deadline, phrased differently, different value."""
    return make_claim(
        "Sharma delivery", "due_date", "2026-10-18", "Sharma delivery moves to the 18th", value_label="18 Oct",
        stated_at="2026-10-03T14:02:00+05:30",
        source={"kind": "note", "ref": "note:1", "author": "tanishk",
                "excerpt": "Client just called: Sharma delivery moves to the 18th.", "at": "2026-10-03T14:02:00+05:30"},
    )


def mehta_deadline():
    return make_claim("Mehta reel cutdowns", "due_date", "2026-10-06", "Mehta reel cutdowns are due 6 Oct",
                      value_label="6 Oct")


def test_sharma_pair_opens_exactly_one_conflict(ctx):
    email, mehta, note = sharma_email(), mehta_deadline(), sharma_note()
    for c in (email, mehta):
        ctx.memory.add_claim(c)
        assert conflicts.check(ctx, c, detected_on="ingest") is None

    ctx.memory.add_claim(note)
    conflict = conflicts.check(ctx, note, detected_on="sync")

    assert conflict is not None
    assert conflict["claim_ids"] == sorted([email["claim_id"], note["claim_id"]])
    assert conflict["conflict_id"] == conflicts.conflict_id_for([note["claim_id"], email["claim_id"]])
    assert conflict["similarity"] >= 0.82
    assert (conflict["status"], conflict["detected_on"], conflict["entity"]) == ("open", "sync", "Sharma wedding edit")
    assert len(ctx.store.list_conflicts()) == 1

    for cid in conflict["claim_ids"]:
        stored = ctx.memory.get(cid)
        assert (stored["status"], stored["conflict_id"], stored["version"]) == ("disputed", conflict["conflict_id"], 1)
    assert ctx.memory.get(mehta["claim_id"])["status"] == "active"

    assert ctx.bus.types().count("claim") == 2 and "conflict" in ctx.bus.types()
    assert ctx.store.activity[-1]["kind"] == "conflict_opened"
    assert "Found 2 claims about the Sharma wedding edit, similarity 0.8" in ctx.store.activity[-1]["text"]

    # Re-checking (e.g. the next sync round) finds the same conflict instead of opening another.
    assert conflicts.check(ctx, note, detected_on="sync")["conflict_id"] == conflict["conflict_id"]
    assert len(ctx.store.list_conflicts()) == 1


def test_same_value_is_not_a_conflict(ctx):
    email = sharma_email()
    agreeing = dict(sharma_note(), value="2026-10-16", value_label="16 Oct")
    ctx.memory.add_claim(email)
    ctx.memory.add_claim(agreeing)
    assert conflicts.check(ctx, agreeing, detected_on="ingest") is None


def test_both_devices_derive_the_same_conflict_and_owner(data_dir, embedder):
    email, note = sharma_email(), sharma_note()
    found = []
    for device, first, second in (("tanishk", note, email), ("lakshya", email, note)):
        c = make_ctx(data_dir, embedder, device)
        try:
            c.memory.add_claim(first)
            c.memory.add_claim(second)
            found.append(conflicts.check(c, second, detected_on="sync"))
        finally:
            c.memory.close()
    assert found[0]["conflict_id"] == found[1]["conflict_id"]
    assert found[0]["owner"] == found[1]["owner"] == "tanishk"


def test_resolve_supersedes_loser_and_creates_resolution_claim(ctx):
    email, note = sharma_email(), sharma_note()
    ctx.memory.add_claim(email)
    ctx.memory.add_claim(note)
    opened = conflicts.check(ctx, note, detected_on="ingest")

    resolved = conflicts.resolve(ctx, opened["conflict_id"], note["claim_id"], resolved_by="tanishk")

    winner, loser = ctx.memory.get(note["claim_id"]), ctx.memory.get(email["claim_id"])
    assert (winner["status"], winner["version"]) == ("active", 2)
    assert (loser["status"], loser["version"]) == ("superseded", 2)
    assert resolved["status"] == "resolved" and resolved["winner_claim_id"] == note["claim_id"]

    resolution = ctx.memory.get(resolved["resolution_claim_id"])
    assert resolution["attribute"] == "resolution" and resolution["value"] == note["claim_id"]
    assert resolution["resolves"] == opened["conflict_id"] and resolution["tier"] == "team"
    assert resolution["text"] == "Resolved: Sharma wedding edit 18 Oct (chosen by Tanishk)"
    assert ctx.store.outbox_ids() == {note["claim_id"], email["claim_id"], resolution["claim_id"]}
    assert ctx.store.activity[-1]["kind"] == "conflict_resolved"

    with pytest.raises(ValueError):
        conflicts.resolve(ctx, opened["conflict_id"], "clm_not_in_conflict", resolved_by="tanishk")


def test_remote_resolution_applies_on_a_device_that_never_saw_the_conflict(data_dir, embedder, ctx):
    email, note = sharma_email(), sharma_note()
    ctx.memory.add_claim(email)
    ctx.memory.add_claim(note)
    opened = conflicts.check(ctx, note, detected_on="ingest")
    resolved = conflicts.resolve(ctx, opened["conflict_id"], note["claim_id"], resolved_by="tanishk")
    resolution, res_vectors = ctx.memory.get_with_vectors(resolved["resolution_claim_id"])

    other = make_ctx(data_dir, embedder, "lakshya")
    try:
        for claim in (email, note):  # as pulled before the conflict existed
            other.memory.add_claim(claim)
        other.memory.upsert_raw(resolution, res_vectors)
        applied = conflicts.apply_remote_resolution(other, resolution)

        assert applied["conflict_id"] == opened["conflict_id"] and applied["status"] == "resolved"
        assert applied["claim_ids"] == opened["claim_ids"]
        assert other.memory.get(note["claim_id"])["status"] == "active"
        assert other.memory.get(email["claim_id"])["status"] == "superseded"
        assert other.store.get_conflict(opened["conflict_id"])["resolved_by"] == "tanishk"
        assert "conflict" in other.bus.types()
    finally:
        other.memory.close()
