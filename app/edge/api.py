"""HTTP API for one device: FastAPI app, SSE stream and the static UI."""
import json
import re
import threading
import time
import urllib.parse
from contextlib import asynccontextmanager
from types import SimpleNamespace
from typing import Literal

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from edge import answer, conflicts
from edge import extract as extractor
from edge.config import FIXTURES_DIR, LOOKS, PEERS, WEB_DIR, first_name
from edge.embed import get_embedder
from edge.events import EventBus, log_activity, publish_claim, ui_claim
from edge.memory import Memory, now_ms
from edge.store import Store
from edge.sync import SyncWorker

SSE_HEARTBEAT_S = 15.0
ACTIVITY_LIMIT = 60
TIERS = ("device", "my_devices", "team")
INBOX_RECEIVED_KEY = "inbox_received"
# The demo stage (one page, both devices) calls each device's API from another local origin.
LOCAL_ORIGINS = r"^http://(127\.0\.0\.1|localhost)(:\d+)?$"
REPLY_PREFIX = re.compile(r"^(?:\s*(?:re|fwd?|fw)\s*:\s*)+", re.IGNORECASE)


class IngestBody(BaseModel):
    kind: Literal["note", "email", "whatsapp"] = "note"
    text: str
    author: str | None = None
    ref: str | None = None
    at: str | None = None


class AskBody(BaseModel):
    q: str
    view: Literal["mine", "team"] = "mine"


class NetBody(BaseModel):
    online: bool


class ResolveBody(BaseModel):
    winner_claim_id: str


def build_ctx(cfg, *, embedder=None, store=None, sync=None) -> SimpleNamespace:
    """The shared device context. Tests inject a fake store/sync; production builds the real ones."""
    ctx = SimpleNamespace(cfg=cfg, bus=EventBus())
    ctx.memory = Memory(cfg, embedder or get_embedder(cfg))
    ctx.store = store if store is not None else Store(cfg)
    ctx.sync = sync if sync is not None else SyncWorker(ctx)  # needs ctx.store/memory/bus set first
    return ctx


def create_app(cfg, *, embedder=None, store=None, sync=None) -> FastAPI:
    ctx = build_ctx(cfg, embedder=embedder, store=store, sync=sync)

    @asynccontextmanager
    async def lifespan(_app):
        if hasattr(ctx.sync, "start"):
            ctx.sync.start()
        try:
            yield
        finally:
            if hasattr(ctx.sync, "stop"):
                ctx.sync.stop()
            ctx.memory.close()
            ctx.store.close()

    app = FastAPI(title=f"Quorum · {cfg.display_name}", lifespan=lifespan)
    app.state.ctx = ctx
    app.add_middleware(CORSMiddleware, allow_origin_regex=LOCAL_ORIGINS, allow_methods=["GET", "POST"],
                       allow_headers=["Content-Type"])

    # ---- state + live stream --------------------------------------------------------------

    @app.get("/api/state")
    def state():
        return {
            "device": cfg.device,
            "display_name": cfg.display_name,
            "today": cfg.today.isoformat(),
            "sync": ctx.sync.status(),
            "claims": [ui_claim(ctx, c, xyz) for c, xyz in ctx.memory.all_claims_with_xyz()],
            "conflicts": ctx.store.list_conflicts(),
            "activity": ctx.store.recent_activity(ACTIVITY_LIMIT),
            "peers": PEERS,
        }

    @app.get("/api/events")
    async def events():
        async def stream():
            yield ": connected\n\n"
            async for message in ctx.bus.subscribe(heartbeat=SSE_HEARTBEAT_S):
                if message is None:
                    yield ": heartbeat\n\n"
                else:
                    yield f"data: {json.dumps(message, default=str)}\n\n"

        return StreamingResponse(
            stream(), media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ---- capture + ask -------------------------------------------------------------------

    @app.post("/api/ingest")
    def ingest_route(body: IngestBody):
        return ingest(ctx, body.kind, body.text, author=body.author, ref=body.ref, at=body.at)

    @app.post("/api/ask")
    def ask(body: AskBody):
        started = time.perf_counter()
        hits = ctx.memory.search(body.q, body.view)
        hits = _with_dispute_partners(ctx, hits, body.view)
        visible = [c for c in ctx.memory.all_claims() if _in_view(c, body.view)]
        result = answer.compose(body.q, hits, ctx.store.list_conflicts(), cfg, all_claims=visible)
        took_ms = round((time.perf_counter() - started) * 1000, 1)
        log_activity(ctx, "search", f'Asked "{body.q}" ({took_ms:.0f} ms, on device)')
        return {
            **result,
            "hits": [{"claim": ui_claim(ctx, c), "score": s} for c, s in hits],
            "took_ms": took_ms,
        }

    # ---- sync + conflicts ----------------------------------------------------------------

    @app.post("/api/net")
    def net(body: NetBody):
        return ctx.sync.set_online(body.online)  # the worker logs and publishes the change

    @app.post("/api/conflicts/{conflict_id}/resolve")
    def resolve(conflict_id: str, body: ResolveBody):
        conflict = _conflict_or_404(ctx, conflict_id)
        if not can_settle(conflict, cfg.device):
            raise HTTPException(403, f"Only {first_name(conflict['owner'])} can settle this")
        try:
            return conflicts.resolve(ctx, conflict_id, body.winner_claim_id, resolved_by=cfg.device)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc

    @app.post("/api/conflicts/{conflict_id}/draft")
    def draft(conflict_id: str):
        return draft_message(ctx, _conflict_or_404(ctx, conflict_id))

    # ---- demo inbox ----------------------------------------------------------------------

    @app.get("/api/inbox")
    def inbox():
        return _pending_inbox(ctx)

    inbox_lock = threading.Lock()

    @app.post("/api/inbox/{email_id}/receive")
    def receive(email_id: str):
        # Claim the email before the slow extraction, so a double click or a retry gets a 404
        # instead of ingesting it twice (two 16 Oct claims, two conflicts on the other device).
        with inbox_lock:
            email = next((e for e in _pending_inbox(ctx) if e["id"] == email_id), None)
            if email is None:
                raise HTTPException(404, f"No pending email {email_id}")
            _mark_received(ctx, email_id, True)
        # "Re:"/"Fwd:" would otherwise be read as an entity name by the fallback extractor.
        subject = REPLY_PREFIX.sub("", email.get("subject") or "").strip()
        text = f"{subject}\n\n{email['text']}" if subject else email["text"]
        try:
            return ingest(ctx, "email", text, author=email.get("from"), ref=f"email:{email_id}", at=email.get("at"))
        except Exception:
            with inbox_lock:
                _mark_received(ctx, email_id, False)    # back in the inbox, so it can be retried
            raise

    # ---- static UI -----------------------------------------------------------------------

    @app.get("/api/look")
    def look():
        """The UI look this device serves (python -m edge --look). A page's ?look=<name> overrides it."""
        return {"look": cfg.look, "looks": list(LOOKS)}

    def page(name: str):
        """A UI page. Classic is the file untouched; another look is named on <html> for the page's head script."""
        if cfg.look not in LOOKS or cfg.look == "classic":
            return FileResponse(WEB_DIR / name, media_type="text/html")
        html = (WEB_DIR / name).read_text(encoding="utf-8")
        return HTMLResponse(html.replace('<html lang="en">', f'<html lang="en" data-look="{cfg.look}">', 1))

    @app.get("/stage", include_in_schema=False)
    def stage():
        """The demo stage: both devices and the hub on one screen (also at /web/stage.html)."""
        return page("stage.html")

    if cfg.look != "classic":
        @app.get("/", include_in_schema=False)
        def index():
            """Only with a non-classic look; classic leaves "/" to the static mount below."""
            return page("index.html")


    # Mounted last so /api/* wins. index.html uses relative asset paths, so the UI must resolve at
    # the root ("/" -> index.html, "/app.js") as well as under /web.
    app.mount("/web", StaticFiles(directory=WEB_DIR, html=True, check_dir=False), name="web")
    app.mount("/", StaticFiles(directory=WEB_DIR, html=True, check_dir=False), name="root")
    return app


# ---- ingest pipeline ---------------------------------------------------------------------------


def ingest(ctx, kind: str, text: str, author: str | None = None, ref: str | None = None,
           at: str | None = None) -> dict:
    """extract -> claims -> shard -> outbox (non-device tiers) -> conflict check -> events."""
    started = time.perf_counter()
    cfg = ctx.cfg
    at = at or conflicts.now_iso()
    source = {
        "kind": kind,
        "ref": ref or f"{kind}:{at}",
        "author": author or cfg.device,
        "excerpt": text.strip()[:280],
        "at": at,
    }
    existing = ctx.memory.all_claims()
    audience = _entity_audience(existing)
    known = sorted({c["entity"] for c in existing if c.get("entity")})
    drafts, extractor_used = extractor.extract_with_meta(text, source, cfg, known)

    created, opened = [], []
    for d in drafts:
        d = dict(d, tier=_capped_tier(d.get("tier"), audience.get(d["entity"].strip().lower())))
        claim = _claim_from_draft(ctx, d, dict(source, excerpt=_best_excerpt(text, d["text"])))
        ctx.memory.add_claim(claim)
        if claim["tier"] != "device":
            ctx.store.enqueue(claim["claim_id"])
        publish_claim(ctx, claim)
        log_activity(ctx, "claim_added", f"Captured: {claim['text']}")
        conflict = conflicts.check(ctx, claim, detected_on="ingest")
        if conflict is not None and all(c["conflict_id"] != conflict["conflict_id"] for c in opened):
            opened.append(conflict)
        created.append(claim["claim_id"])

    return {
        "claims": [ui_claim(ctx, ctx.memory.get(cid)) for cid in created],
        "conflicts": opened,
        "took_ms": round((time.perf_counter() - started) * 1000, 1),
        "extractor": extractor_used,
    }


def _claim_from_draft(ctx, draft: dict, source: dict) -> dict:
    cfg = ctx.cfg
    existing = ctx.memory.find_entity(draft["entity"], draft["attribute"])
    tier = draft.get("tier") if draft.get("tier") in TIERS else "device"
    return {
        "claim_id": conflicts.new_claim_id(),
        "text": draft["text"],
        "entity": draft["entity"],
        "entity_kind": draft.get("entity_kind", "note"),
        "attribute": draft["attribute"],
        "value": draft["value"],
        "value_label": draft.get("value_label") or str(draft["value"]),
        "owner": existing["owner"] if existing and existing.get("owner") else cfg.device,
        "source": dict(source),
        "stated_at": source["at"],
        "captured_by": cfg.device,
        "device_id": cfg.device_id,
        "tier": tier,
        "status": "active",
        "conflict_id": None,
        "resolves": None,
        "version": 1,
        "modified_at": now_ms(),
        "modified_by": cfg.device,
    }


# ---- helpers -----------------------------------------------------------------------------------


def can_settle(conflict: dict, device: str) -> bool:
    """The owner settles their conflict. Owners without a device in this demo (Aayat, Tushar own
    seeded tasks) would leave it stuck on "Waiting for Aayat" forever, so any device may settle those."""
    return conflict.get("owner") == device or conflict.get("owner") not in PEERS


def _entity_audience(claims: list[dict]) -> dict[str, str]:
    """Entity (lowercased) -> the widest tier any claim about it has on this device."""
    widest: dict[str, str] = {}
    for c in claims:
        name = (c.get("entity") or "").strip().lower()
        tier = c.get("tier") if c.get("tier") in TIERS else "device"
        if name and (name not in widest or TIERS.index(tier) > TIERS.index(widest[name])):
            widest[name] = tier
    return widest


def _capped_tier(tier: str | None, audience: str | None) -> str:
    """A capture about a known entity never reaches a wider audience than the entity already has:
    a follow-up about a friend's private news ("Kabir moves to Pune ...") stays on this device
    even though the extractor promotes known entities to the team."""
    tier = tier if tier in TIERS else "device"
    if audience is not None and TIERS.index(tier) > TIERS.index(audience):
        return audience
    return tier


def _best_excerpt(text: str, claim_text: str, limit: int = 280) -> str:
    """The sentence of the source that best supports the claim (by shared words), so a citation
    quotes "Confirming final delivery ... on 16 October." rather than the email's greeting."""
    words = set(re.findall(r"[a-z0-9]+", claim_text.lower()))
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n+", text) if s.strip()]
    if not sentences:
        return text.strip()[:limit]
    best = max(sentences, key=lambda s: len(words & set(re.findall(r"[a-z0-9]+", s.lower()))))
    return best[:limit]


def _in_view(claim: dict, view: str) -> bool:
    return claim.get("status") in ("active", "disputed") and (view != "team" or claim.get("tier") == "team")


def _with_dispute_partners(ctx, hits: list, view: str) -> list:
    """A disputed hit must be answered with both sides, even if search ranked only one of them."""
    present = {c["claim_id"] for c, _ in hits}
    extra = []
    for claim, _ in hits:
        if claim.get("status") != "disputed" or not claim.get("conflict_id"):
            continue
        conflict = ctx.store.get_conflict(claim["conflict_id"]) or {}
        for cid in conflict.get("claim_ids", []):
            partner = ctx.memory.get(cid) if cid not in present else None
            if partner is not None and _in_view(partner, view):
                present.add(cid)
                extra.append((partner, 0.0))
    return hits + extra


def _conflict_or_404(ctx, conflict_id: str) -> dict:
    conflict = ctx.store.get_conflict(conflict_id)
    if conflict is None:
        raise HTTPException(404, f"No conflict {conflict_id}")
    return conflict


def draft_message(ctx, conflict: dict) -> dict:
    """A message to the owner; the app only builds links, the user decides whether to send."""
    owner = first_name(conflict["owner"])
    claims = sorted(filter(None, (ctx.memory.get(cid) for cid in conflict["claim_ids"])), key=answer.side_order)
    # Same wording as the disputed answer: "the client's email says 16 Oct; Tanishk's note ... 18 Oct".
    sides = "; ".join(f"{answer.source_phrase(c)} says {answer.label(c)}" for c in claims)
    text = (f"Hi {owner}, two sources disagree on the {conflict['entity']}: {sides}. "
            f"Which one is right? - {first_name(ctx.cfg.device)}")
    subject = f"{conflict['entity']}: which one is right?"
    quote = urllib.parse.quote
    return {
        "to": owner,
        "text": text,
        "mailto": f"mailto:?subject={quote(subject)}&body={quote(text)}",
        "wa_link": f"https://wa.me/?text={quote(text)}",
    }


def _mark_received(ctx, email_id: str, received: bool) -> None:
    ids = set(ctx.store.kv_get(INBOX_RECEIVED_KEY, []) or [])
    ids = ids | {email_id} if received else ids - {email_id}
    ctx.store.kv_set(INBOX_RECEIVED_KEY, sorted(ids))


def _pending_inbox(ctx) -> list[dict]:
    path = FIXTURES_DIR / f"inbox_{ctx.cfg.device}.json"
    if not path.exists():
        return []
    received = set(ctx.store.kv_get(INBOX_RECEIVED_KEY, []) or [])
    emails = json.loads(path.read_text(encoding="utf-8"))
    return [e for e in emails if e["id"] not in received]
