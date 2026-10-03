"""Hub sync: push the outbox to the team Qdrant server and pull other devices' changes.

Every byte to the hub goes through one qdrant-client REST transport with a middleware that
(1) refuses to send anything while the device is offline and (2) counts request + response
body bytes. So "offline" is enforced at the wire, and the network monitor is a measurement.
"""
from __future__ import annotations

import contextlib
import threading
import time
import traceback
import uuid
from typing import Any, Callable

from qdrant_client import QdrantClient, models

from edge.events import log_activity, publish_claim

PUSHABLE_TIERS = ("team", "my_devices")   # a `device` claim reaching the hub is a privacy bug
UI_ONLY_FIELDS = ("sync", "xyz")
DENSE_SIZE = 384
PAYLOAD_INDEXES = {
    "modified_at": models.PayloadSchemaType.INTEGER,
    "tier": models.PayloadSchemaType.KEYWORD,
    "modified_by": models.PayloadSchemaType.KEYWORD,
    "captured_by": models.PayloadSchemaType.KEYWORD,
    "attribute": models.PayloadSchemaType.KEYWORD,
}
PUSH_BATCH = 64
OUTBOX_SCAN = 2000                        # entries read per round to pick the oldest-stamped batch
PULL_PAGE = 128
BACKOFF_BASE_S = 0.5
BACKOFF_MAX_S = 5.0
STATUS_MIN_INTERVAL_S = 0.5               # `sync` counter updates at most 2/s
STATE_FIELDS = ("online", "hub_ok", "outbox", "last_error")


class HubOffline(RuntimeError):
    """Raised by the transport when a request is attempted while the device is offline."""


def point_id(claim_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, claim_id))


def make_client(hub_url: str, timeout: int = 5) -> QdrantClient:
    # The hub is Qdrant server 1.19 and the client is pinned at 1.15; the REST surface we use is
    # stable across them, so skip the version handshake (it would also be an extra request).
    return QdrantClient(url=hub_url, timeout=timeout, check_compatibility=False)


def install_middleware(client: QdrantClient, middleware: Callable) -> None:
    """Hook the REST transport. qdrant-client 1.15.1 exposes no public hook, so reach its ApiClient."""
    client._client.openapi_client.client.add_middleware(middleware)


def ensure_collection(client: QdrantClient, name: str) -> bool:
    """Create the team collection and its payload indexes if missing. Returns True if created."""
    created = False
    if not client.collection_exists(name):
        client.create_collection(
            collection_name=name,
            vectors_config={
                "text": models.VectorParams(size=DENSE_SIZE, distance=models.Distance.COSINE),
                "key": models.VectorParams(size=DENSE_SIZE, distance=models.Distance.COSINE),
            },
            sparse_vectors_config={"bm25": models.SparseVectorParams(modifier=models.Modifier.IDF)},
        )
        created = True
    for field, schema in PAYLOAD_INDEXES.items():
        client.create_payload_index(name, field_name=field, field_schema=schema, wait=True)
    return created


def to_hub_vector(value: Any) -> Any:
    """Local shard vector (list / numpy / qdrant_edge.SparseVector / dict) -> qdrant-client form."""
    if hasattr(value, "indices") and hasattr(value, "values"):
        return models.SparseVector(indices=[int(i) for i in value.indices], values=[float(v) for v in value.values])
    if isinstance(value, dict) and "indices" in value:
        return models.SparseVector(indices=[int(i) for i in value["indices"]], values=[float(v) for v in value["values"]])
    if hasattr(value, "tolist"):
        value = value.tolist()
    return [float(v) for v in value]


def hub_payload(claim: dict) -> dict:
    """What the hub stores for a claim: no UI-only fields, and never the local `disputed` state
    (each device detects conflicts itself; the contract keeps disputed status local)."""
    payload = {k: v for k, v in claim.items() if k not in UI_ONLY_FIELDS}
    if payload.get("status") == "disputed":
        payload["status"] = "active"
        payload["conflict_id"] = None
    return payload


def hub_point(claim: dict, vectors: dict) -> models.PointStruct:
    if claim.get("tier") not in PUSHABLE_TIERS:
        raise ValueError(f"refusing to build a hub point for tier {claim.get('tier')!r}")
    return models.PointStruct(
        id=point_id(claim["claim_id"]),
        vector={name: to_hub_vector(v) for name, v in vectors.items()},
        payload=hub_payload(claim),
    )


def pull_filter(device: str, cursor: int) -> models.Filter:
    """modified_at > cursor AND modified_by != me AND (team OR (my_devices AND captured_by == me))."""
    return models.Filter(
        must=[models.FieldCondition(key="modified_at", range=models.Range(gt=cursor))],
        must_not=[models.FieldCondition(key="modified_by", match=models.MatchValue(value=device))],
        should=[
            models.FieldCondition(key="tier", match=models.MatchValue(value="team")),
            models.Filter(must=[
                models.FieldCondition(key="tier", match=models.MatchValue(value="my_devices")),
                models.FieldCondition(key="captured_by", match=models.MatchValue(value=device)),
            ]),
        ],
    )


def _now_ms() -> int:
    return int(time.time() * 1000)


def _plural(n: int, word: str) -> str:
    return f"{n} {word}" if n == 1 else f"{n} {word}s"


def _human_bytes(n: int) -> str:
    return f"{n} B" if n < 1024 else f"{n / 1024:.1f} KB"


class SyncWorker(threading.Thread):
    """Background push/pull loop for one device. `sync_once()` runs a single round synchronously."""

    def __init__(self, ctx: Any, interval: float = 1.0, client: QdrantClient | None = None):
        super().__init__(name=f"sync-{ctx.cfg.device}", daemon=True)
        self.ctx = ctx
        self.device = ctx.cfg.device
        self.collection = ctx.cfg.hub_collection
        self.interval = interval
        self.client = client or make_client(ctx.cfg.hub_url)
        install_middleware(self.client, self._wire)

        self._state_lock = threading.Lock()
        self._round_lock = threading.Lock()          # one push/pull round at a time
        self._stop_event = threading.Event()
        self._wake = threading.Event()
        self._online = True
        self._hub_ok = False
        self._collection_ready = False
        self._failures = 0
        self._retry_at = 0.0
        self.bytes_up = 0
        self.bytes_down = 0
        self.requests = 0
        self._last_push: int | None = None
        self._last_pull: int | None = None
        self._last_error: str | None = None
        self._last_published: dict | None = None
        self._last_published_at = 0.0

    # ---- transport ----------------------------------------------------------------------

    def _wire(self, request, call_next):
        if not self._online:
            raise HubOffline("device is offline; hub traffic blocked")
        response = call_next(request)
        with self._state_lock:
            self.requests += 1
            self.bytes_up += len(request.content or b"")
            self.bytes_down += len(response.content or b"")
        return response

    # ---- public surface -----------------------------------------------------------------

    def set_online(self, online: bool) -> dict:
        online = bool(online)
        changed = online != self._online
        self._online = online
        if changed:
            if online:
                self._failures, self._retry_at = 0, 0.0
                self._activity("net", "Reconnected to hub")
                self._wake.set()                     # drain the outbox now, not on the next tick
            else:
                self._hub_ok = False
                self._activity("net", "No connection to hub")
        status = self.status()
        self._publish_status(force=True)
        return status

    def status(self) -> dict:
        with self._state_lock:
            return {
                "online": self._online,
                "hub_ok": self._hub_ok,
                "outbox": self.ctx.store.outbox_len(),
                "bytes_up": self.bytes_up,
                "bytes_down": self.bytes_down,
                "last_push": self._last_push,
                "last_pull": self._last_pull,
                "last_error": self._last_error,
            }

    def ensure_collection(self) -> bool:
        created = ensure_collection(self.client, self.collection)
        self._collection_ready = True
        return created

    def stop(self, timeout: float = 7.0) -> None:
        # Longer than the client timeout, so a round in flight finishes before the caller closes the shard.
        self._stop_event.set()
        self._wake.set()
        if self.is_alive():
            self.join(timeout)
        self.client.close()

    def run(self) -> None:
        while not self._stop_event.is_set():
            self.sync_once()
            self._publish_status()
            self._wake.wait(self.interval)
            self._wake.clear()

    # ---- one round ----------------------------------------------------------------------

    def sync_once(self) -> None:
        """Push then pull. No-op while offline or backing off after a hub error."""
        if not self._online or time.monotonic() < self._retry_at:
            return
        with self._round_lock:
            try:
                if not self._collection_ready:
                    self.ensure_collection()
                self.push()
                self.pull()
            except HubOffline:
                return                               # went offline mid-round; not a hub fault
            except Exception as exc:                 # hub down, timeout, bad response
                self._on_hub_error(exc)
                return
            with self._state_lock:
                self._hub_ok = self._online          # may have been switched off as the round ended
                self._failures, self._retry_at = 0, 0.0
                self._last_error = None

    def push(self) -> int:
        store, memory = self.ctx.store, self.ctx.memory
        entries = store.outbox_peek(OUTBOX_SCAN)
        if not entries:
            return 0
        gens = {e["claim_id"]: e["gen"] for e in entries}
        ready, dropped = [], []
        for entry in entries:
            cid = entry["claim_id"]
            found = memory.get_with_vectors(cid)     # the point as it is *now*, not when enqueued
            claim, vectors = found if found else (None, None)
            if claim is None:
                dropped.append(cid)                  # deleted locally; nothing to send
            elif claim.get("tier") not in PUSHABLE_TIERS:
                dropped.append(cid)                  # privacy invariant: never leaves the device
                self._activity("sync_push", f"Kept private: {claim.get('entity') or cid} is device-only")
            else:
                ready.append((claim, vectors))
        # Peers pull by `modified_at > cursor`. Sending the oldest stamps first means a peer that
        # pulls between two batches never moves its cursor past a claim still waiting here.
        ready.sort(key=lambda cv: (int(cv[0].get("modified_at", 0)), cv[0]["claim_id"]))
        ready = ready[:PUSH_BATCH]
        pushed = [claim for claim, _ in ready]
        points = [hub_point(claim, vectors) for claim, vectors in ready]
        sent = 0
        if points:
            before = self.bytes_up
            try:
                self.client.upsert(self.collection, points=points, wait=True)
            except HubOffline:
                raise
            except Exception as exc:
                store.outbox_fail([c["claim_id"] for c in pushed], f"{type(exc).__name__}: {exc}")
                raise
            sent = self.bytes_up - before
        store.outbox_ack(dropped + [c["claim_id"] for c in pushed], gens)
        if pushed:
            with self._state_lock:
                self._last_push = _now_ms()
            self._activity("sync_push", f"Pushed {_plural(len(pushed), 'claim')} to hub ({_human_bytes(sent)})")
            for claim in pushed:
                self._publish_claim(claim)
        return len(pushed)

    def pull(self) -> int:
        store, memory = self.ctx.store, self.ctx.memory
        cursor = int(store.kv_get("pull_cursor", 0) or 0)
        flt = pull_filter(self.device, cursor)
        records, offset = [], None
        while True:
            page, offset = self.client.scroll(
                self.collection, scroll_filter=flt, limit=PULL_PAGE, offset=offset,
                with_payload=True, with_vectors=True,
            )
            records.extend(page)
            if offset is None:
                break
        with self._state_lock:
            self._last_pull = _now_ms()
        if not records:
            return 0

        # Oldest first, so a resolution claim lands after the claims it settles.
        records.sort(key=lambda r: (r.payload.get("modified_at", 0), r.payload.get("version", 0)))
        with self._memory_batch():
            applied, new_cursor = self._apply_pulled(records, cursor)
        store.kv_set("pull_cursor", new_cursor)
        if applied:
            self._activity("sync_pull", f"Pulled {_plural(applied, 'claim')} from hub")
        return applied

    def _apply_pulled(self, records: list, cursor: int) -> tuple[int, int]:
        memory = self.ctx.memory
        conflicts = self._conflicts()
        applied = 0
        new_cursor = cursor
        for rec in records:
            claim = dict(rec.payload)
            vectors = rec.vector or {}
            new_cursor = max(new_cursor, int(claim.get("modified_at", 0)))
            if claim.get("tier") not in PUSHABLE_TIERS:
                continue                             # defensive: the hub should never hold these
            local = memory.get(claim["claim_id"])
            is_resolution = claim.get("attribute") == "resolution"
            if local is None:
                memory.upsert_raw(claim, vectors)
                if is_resolution:
                    self._run_conflict_hook(conflicts.apply_remote_resolution, claim)
                else:
                    self._run_conflict_hook(conflicts.check, claim, detected_on="sync")
            elif int(claim.get("version", 0)) > int(local.get("version", 0)):
                memory.upsert_raw(claim, vectors)
                if is_resolution:
                    self._run_conflict_hook(conflicts.apply_remote_resolution, claim)
            else:
                continue                             # we already have this version or newer
            applied += 1
            self._publish_claim(memory.get(claim["claim_id"]) or claim)
        return applied, new_cursor

    # ---- helpers ------------------------------------------------------------------------

    def _memory_batch(self):
        """One shard flush for the whole pull (the cursor is saved only after it lands)."""
        batch = getattr(self.ctx.memory, "batch", None)
        return batch() if batch else contextlib.nullcontext()

    def _conflicts(self):
        conflicts = getattr(self.ctx, "conflicts", None)
        if conflicts is None:
            from edge import conflicts                # module-level functions per the contract
        return conflicts

    def _run_conflict_hook(self, fn: Callable, claim: dict, **kwargs: Any) -> None:
        """A local bug in conflict handling must not stall sync or be reported as a hub fault;
        the claim is already stored, so log the error and keep pulling."""
        try:
            fn(self.ctx, claim, **kwargs)
        except Exception as exc:
            traceback.print_exc()
            with self._state_lock:
                self._last_error = f"conflict check failed for {claim.get('claim_id')}: {exc}"[:300]

    def _on_hub_error(self, exc: Exception) -> None:
        with self._state_lock:
            self._failures += 1
            delay = min(BACKOFF_MAX_S, BACKOFF_BASE_S * (2 ** (self._failures - 1)))
            self._retry_at = time.monotonic() + delay
            self._hub_ok = False
            self._last_error = f"{type(exc).__name__}: {exc}"[:300]
        self._collection_ready = False               # the hub may have restarted empty

    def _activity(self, kind: str, text: str) -> None:
        log_activity(self.ctx, kind, text)

    def _publish_claim(self, claim: dict) -> None:
        publish_claim(self.ctx, claim)              # turns the point green (synced) in the UI

    def _publish_status(self, force: bool = False) -> None:
        """Counters (bytes, timestamps) are throttled to 2/s; a state change (online, hub_ok,
        outbox, last_error) goes out at once, else the header shows "Outbox 1" right after the
        round that drained it."""
        status = self.status()
        now = time.monotonic()
        if not force:
            if status == self._last_published:
                return
            last = self._last_published or {}
            state_changed = any(status[k] != last.get(k) for k in STATE_FIELDS)
            if not state_changed and now - self._last_published_at < STATUS_MIN_INTERVAL_S:
                return
        self._last_published, self._last_published_at = status, now
        self.ctx.bus.publish("sync", status)
