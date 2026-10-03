"""Per-device SQLite state: sync outbox, conflict records, activity log and a small kv table.

One connection shared by all threads, serialized by a lock. SQLite in WAL mode handles the rest;
the workload (a sync thread plus API requests) is tiny, so a lock is simpler than per-thread
connections and keeps `close()` deterministic, which matters on Windows where open files are locked.
"""
from __future__ import annotations

import json
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

_SCHEMA = """
CREATE TABLE IF NOT EXISTS outbox (
    claim_id    TEXT PRIMARY KEY,
    gen         INTEGER NOT NULL DEFAULT 1,   -- bumped on re-enqueue so a stale ack can't drop a newer change
    enqueued_at INTEGER NOT NULL,             -- epoch ms
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT
);
CREATE TABLE IF NOT EXISTS conflicts (
    conflict_id TEXT PRIMARY KEY,
    status      TEXT NOT NULL,
    detected_at TEXT,
    record      TEXT NOT NULL                 -- the contract's conflict record, as JSON
);
CREATE TABLE IF NOT EXISTS activity (
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    at   TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL                       -- JSON
);
"""


def store_path(cfg: Any) -> Path:
    """`<data_dir>/<device>/local.sqlite` for a Config-like object."""
    return Path(cfg.data_dir) / cfg.device / "local.sqlite"


def _now_ms() -> int:
    return int(time.time() * 1000)


def _now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


class Store:
    """Accepts a Config-like object (uses `store_path`) or an explicit path to the sqlite file."""

    def __init__(self, target: Any):
        path = store_path(target) if hasattr(target, "data_dir") else Path(target)
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._lock = threading.RLock()
        self._db = sqlite3.connect(str(path), check_same_thread=False, isolation_level=None)
        self._db.row_factory = sqlite3.Row
        with self._lock:
            self._db.execute("PRAGMA journal_mode=WAL")
            self._db.execute("PRAGMA synchronous=NORMAL")
            self._db.execute("PRAGMA busy_timeout=5000")
            self._db.executescript(_SCHEMA)

    def close(self) -> None:
        with self._lock:
            if self._db is not None:
                self._db.close()
                self._db = None

    def _exec(self, sql: str, params: Iterable[Any] = ()) -> None:
        with self._lock:
            self._db.execute(sql, tuple(params))

    def _query(self, sql: str, params: Iterable[Any] = ()) -> list[sqlite3.Row]:
        # Fetch while holding the lock: the connection is shared, so a cursor read later races.
        with self._lock:
            return self._db.execute(sql, tuple(params)).fetchall()

    def _one(self, sql: str, params: Iterable[Any] = ()) -> sqlite3.Row | None:
        rows = self._query(sql, params)
        return rows[0] if rows else None

    # ---- outbox -------------------------------------------------------------------------

    def enqueue(self, claim_id: str) -> None:
        """Queue a claim for push. Dedup by claim_id: the worker always pushes the current point."""
        self._exec(
            "INSERT INTO outbox (claim_id, gen, enqueued_at) VALUES (?, 1, ?) "
            "ON CONFLICT(claim_id) DO UPDATE SET gen = gen + 1",
            (claim_id, _now_ms()),
        )

    def outbox_peek(self, n: int = 64) -> list[dict]:
        """Oldest first: `[{claim_id, gen, enqueued_at, attempts, last_error}]`."""
        rows = self._query(
            "SELECT claim_id, gen, enqueued_at, attempts, last_error FROM outbox "
            "ORDER BY enqueued_at, claim_id LIMIT ?",
            (n,),
        )
        return [dict(r) for r in rows]

    def outbox_ack(self, claim_ids: Iterable[str], gens: dict[str, int] | None = None) -> None:
        """Remove pushed entries. With `gens` (claim_id -> gen from peek), an entry re-enqueued
        after the peek survives, so a change made mid-push is still pushed next round."""
        with self._lock:
            for cid in claim_ids:
                if gens is not None and cid in gens:
                    self._db.execute("DELETE FROM outbox WHERE claim_id = ? AND gen = ?", (cid, gens[cid]))
                else:
                    self._db.execute("DELETE FROM outbox WHERE claim_id = ?", (cid,))

    def outbox_fail(self, claim_ids: Iterable[str], error: str) -> None:
        with self._lock:
            for cid in claim_ids:
                self._db.execute(
                    "UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE claim_id = ?",
                    (error[:500], cid),
                )

    def outbox_len(self) -> int:
        return self._one("SELECT COUNT(*) FROM outbox")[0]

    def outbox_ids(self) -> set[str]:
        return {r[0] for r in self._query("SELECT claim_id FROM outbox")}

    def in_outbox(self, claim_id: str) -> bool:
        return self._one("SELECT 1 FROM outbox WHERE claim_id = ?", (claim_id,)) is not None

    # ---- conflicts ----------------------------------------------------------------------

    def put_conflict(self, conflict: dict) -> dict:
        """Insert or replace a conflict record (keyed by its deterministic conflict_id)."""
        self._exec(
            "INSERT INTO conflicts (conflict_id, status, detected_at, record) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(conflict_id) DO UPDATE SET status = excluded.status, "
            "detected_at = excluded.detected_at, record = excluded.record",
            (conflict["conflict_id"], conflict.get("status", "open"), conflict.get("detected_at"),
             json.dumps(conflict)),
        )
        return conflict

    def get_conflict(self, conflict_id: str) -> dict | None:
        row = self._one("SELECT record FROM conflicts WHERE conflict_id = ?", (conflict_id,))
        return json.loads(row[0]) if row else None

    def list_conflicts(self, status: str | None = None) -> list[dict]:
        """Newest detection first; optionally only one status (`open` / `resolved`)."""
        if status is None:
            rows = self._query("SELECT record FROM conflicts ORDER BY detected_at DESC, conflict_id")
        else:
            rows = self._query(
                "SELECT record FROM conflicts WHERE status = ? ORDER BY detected_at DESC, conflict_id",
                (status,),
            )
        return [json.loads(r[0]) for r in rows]

    def update_conflict(self, conflict_id: str, **fields: Any) -> dict | None:
        with self._lock:
            current = self.get_conflict(conflict_id)
            if current is None:
                return None
            current.update(fields)
            return self.put_conflict(current)

    def delete_conflict(self, conflict_id: str) -> None:
        self._exec("DELETE FROM conflicts WHERE conflict_id = ?", (conflict_id,))

    # ---- activity -----------------------------------------------------------------------

    def log(self, kind: str, text: str) -> dict:
        """Append to the activity log; returns `{at, kind, text}` (the SSE `activity` payload)."""
        entry = {"at": _now_iso(), "kind": kind, "text": text}
        self._exec("INSERT INTO activity (at, kind, text) VALUES (?, ?, ?)", (entry["at"], kind, text))
        return entry

    def recent_activity(self, n: int = 60) -> list[dict]:
        """The last `n` entries, newest first."""
        rows = self._query("SELECT at, kind, text FROM activity ORDER BY id DESC LIMIT ?", (n,))
        return [dict(r) for r in rows]

    # ---- kv -----------------------------------------------------------------------------

    def kv_get(self, key: str, default: Any = None) -> Any:
        row = self._one("SELECT value FROM kv WHERE key = ?", (key,))
        return json.loads(row[0]) if row else default

    def kv_set(self, key: str, value: Any) -> None:
        self._exec(
            "INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, json.dumps(value)),
        )
