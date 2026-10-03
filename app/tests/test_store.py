import threading
from types import SimpleNamespace

from edge.store import Store, store_path


def _open(data_dir, device="tanishk"):
    return Store(SimpleNamespace(data_dir=data_dir, device=device))


def test_path_and_wal_mode(data_dir):
    cfg = SimpleNamespace(data_dir=data_dir, device="tanishk")
    store = Store(cfg)
    try:
        assert store.path == data_dir / "tanishk" / "local.sqlite" == store_path(cfg)
        assert store.path.exists()
        assert store._one("PRAGMA journal_mode")[0].lower() == "wal"
    finally:
        store.close()


def test_outbox_dedup_order_ack_and_failures(data_dir):
    store = _open(data_dir)
    try:
        store.enqueue("clm_a")
        store.enqueue("clm_b")
        store.enqueue("clm_a")                       # dedup: still one entry for clm_a
        assert store.outbox_len() == 2
        assert store.outbox_ids() == {"clm_a", "clm_b"}
        assert [e["claim_id"] for e in store.outbox_peek(10)] == ["clm_a", "clm_b"]
        assert store.in_outbox("clm_a") and not store.in_outbox("clm_z")

        store.outbox_fail(["clm_a"], "ConnectError: refused")
        store.outbox_fail(["clm_a"], "ConnectError: refused again")
        head = store.outbox_peek(1)[0]
        assert head["attempts"] == 2 and head["last_error"] == "ConnectError: refused again"

        store.outbox_ack(["clm_a"])
        assert store.outbox_ids() == {"clm_b"}
    finally:
        store.close()


def test_ack_with_stale_generation_keeps_newer_change(data_dir):
    store = _open(data_dir)
    try:
        store.enqueue("clm_a")
        peeked = {e["claim_id"]: e["gen"] for e in store.outbox_peek(10)}
        store.enqueue("clm_a")                       # changed again while the push was in flight
        store.outbox_ack(["clm_a"], peeked)
        assert store.in_outbox("clm_a")
        store.outbox_ack(["clm_a"], {e["claim_id"]: e["gen"] for e in store.outbox_peek(10)})
        assert store.outbox_len() == 0
    finally:
        store.close()


def test_conflict_crud(data_dir):
    store = _open(data_dir)
    record = {
        "conflict_id": "cfl_0123456789", "claim_ids": ["clm_a", "clm_b"],
        "entity": "Sharma wedding edit", "attribute": "due_date", "similarity": 0.899,
        "owner": "tanishk", "status": "open", "detected_on": "sync",
        "detected_at": "2026-10-03T14:05:00+05:30",
        "winner_claim_id": None, "resolution_claim_id": None, "resolved_by": None,
    }
    try:
        assert store.get_conflict("cfl_0123456789") is None
        store.put_conflict(record)
        store.put_conflict(record)                   # idempotent: both devices may detect it
        assert store.get_conflict("cfl_0123456789") == record
        assert store.list_conflicts() == [record]
        assert store.list_conflicts("open") == [record]

        resolved = store.update_conflict("cfl_0123456789", status="resolved",
                                         winner_claim_id="clm_a", resolved_by="tanishk")
        assert resolved["status"] == "resolved" and resolved["claim_ids"] == ["clm_a", "clm_b"]
        assert store.list_conflicts("open") == []
        assert store.list_conflicts("resolved")[0]["winner_claim_id"] == "clm_a"
        assert store.update_conflict("cfl_missing", status="resolved") is None

        store.delete_conflict("cfl_0123456789")
        assert store.list_conflicts() == []
    finally:
        store.close()


def test_activity_newest_first_and_limited(data_dir):
    store = _open(data_dir)
    try:
        entry = store.log("claim_added", "Added: Mehta reel cutdowns due 6 Oct")
        assert set(entry) == {"at", "kind", "text"} and entry["kind"] == "claim_added"
        for i in range(5):
            store.log("search", f"q{i}")
        recent = store.recent_activity(3)
        assert [a["text"] for a in recent] == ["q4", "q3", "q2"]
        assert len(store.recent_activity()) == 6
    finally:
        store.close()


def test_kv_round_trip(data_dir):
    store = _open(data_dir)
    try:
        assert store.kv_get("pull_cursor") is None
        assert store.kv_get("pull_cursor", 0) == 0
        store.kv_set("pull_cursor", 1791016920000)
        store.kv_set("pull_cursor", 1791016920001)
        store.kv_set("prefs", {"view": "team", "ids": [1, 2]})
        assert store.kv_get("pull_cursor") == 1791016920001
        assert store.kv_get("prefs") == {"view": "team", "ids": [1, 2]}
    finally:
        store.close()


def test_everything_survives_reopen(data_dir):
    store = _open(data_dir)
    store.enqueue("clm_a")
    store.put_conflict({"conflict_id": "cfl_x", "status": "open", "detected_at": "t"})
    store.log("net", "No connection to hub")
    store.kv_set("pull_cursor", 42)
    store.close()

    store = _open(data_dir)
    try:
        assert store.outbox_ids() == {"clm_a"}
        assert store.get_conflict("cfl_x")["status"] == "open"
        assert store.recent_activity(1)[0]["text"] == "No connection to hub"
        assert store.kv_get("pull_cursor") == 42
    finally:
        store.close()


def test_concurrent_writers(data_dir):
    store = _open(data_dir)

    def work(n):
        for i in range(50):
            store.enqueue(f"clm_{n}_{i}")
            store.log("search", f"{n}-{i}")
            store.outbox_len()

    try:
        threads = [threading.Thread(target=work, args=(n,)) for n in range(8)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        assert store.outbox_len() == 400
        assert len(store.recent_activity(1000)) == 400
    finally:
        store.close()
