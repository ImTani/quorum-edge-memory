"""Live updates: a thread-safe fan-out bus feeding the SSE endpoint."""
import asyncio
import threading
from typing import Any, AsyncIterator

QUEUE_SIZE = 500


class EventBus:
    """publish() may be called from any thread (API threadpool, sync worker); each SSE subscriber
    owns an asyncio.Queue on its event loop, and we hand messages over with call_soon_threadsafe."""

    def __init__(self):
        self._lock = threading.Lock()
        self._subscribers: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()

    def publish(self, type_: str, data: Any) -> None:
        message = {"type": type_, "data": data}
        with self._lock:
            subscribers = list(self._subscribers)
        for loop, queue in subscribers:
            try:
                loop.call_soon_threadsafe(_offer, queue, message)
            except RuntimeError:  # loop already closed: the subscriber is gone
                self._drop(loop, queue)

    async def subscribe(self, heartbeat: float | None = None) -> AsyncIterator[dict | None]:
        """Yield messages as they arrive; with a heartbeat, yield None after that many idle seconds
        so the caller can keep the connection alive."""
        entry = (asyncio.get_running_loop(), asyncio.Queue(maxsize=QUEUE_SIZE))
        with self._lock:
            self._subscribers.add(entry)
        try:
            while True:
                try:
                    yield await asyncio.wait_for(entry[1].get(), timeout=heartbeat)
                except asyncio.TimeoutError:
                    yield None
        finally:
            self._drop(*entry)

    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def _drop(self, loop, queue) -> None:
        with self._lock:
            self._subscribers.discard((loop, queue))


def _offer(queue: asyncio.Queue, message: dict) -> None:
    # A stalled browser tab must not grow memory without bound; it re-fetches /api/state anyway.
    if not queue.full():
        queue.put_nowait(message)


def ui_claim(ctx, claim: dict, xyz: list[float] | None = None) -> dict:
    """A stored claim plus the UI-only fields `sync` and `xyz` (never stored, never pushed)."""
    ui = dict(claim)
    if ui.get("tier") == "device":
        ui["sync"] = "private"
    else:
        ui["sync"] = "queued" if ctx.store.in_outbox(ui["claim_id"]) else "synced"
    ui["xyz"] = xyz if xyz is not None else ctx.memory.xyz(claim)
    return ui


def publish_claim(ctx, claim: dict) -> dict:
    ui = ui_claim(ctx, claim)
    ctx.bus.publish("claim", ui)
    return ui


def log_activity(ctx, kind: str, text: str) -> dict:
    entry = ctx.store.log(kind, text)
    ctx.bus.publish("activity", entry)
    return entry
