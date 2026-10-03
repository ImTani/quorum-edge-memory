"""Conflict detection and resolution.

Both devices run the same detection on their own data and derive the same conflict_id, so they
agree on a conflict without ever exchanging conflict records. Only the resolution travels, as a
team-tier claim that every device applies.
"""
import hashlib
import threading
import uuid
from datetime import datetime

from edge.config import first_name
from edge.events import log_activity, publish_claim
from edge.memory import now_ms

TIERS = ("device", "my_devices", "team")          # narrowest audience first
SHARED_TIERS = ("my_devices", "team")             # tiers that may leave the device
_resolve_lock = threading.Lock()

ATTRIBUTE_NOUNS = {
    "due_date": "Dates", "birthday": "Birthdays", "assignee": "Assignees", "location": "Locations",
    "amount": "Amounts", "count": "Counts",
}


def conflict_id_for(claim_ids) -> str:
    return "cfl_" + hashlib.sha1("|".join(sorted(claim_ids)).encode()).hexdigest()[:10]


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")


def new_claim_id() -> str:
    return "clm_" + uuid.uuid4().hex[:12]


def describe(conflict: dict) -> str:
    noun = ATTRIBUTE_NOUNS.get(conflict["attribute"], "Values")
    return (f"Found 2 claims about the {conflict['entity']}, similarity "
            f"{conflict['similarity']:.2f}. {noun} disagree.")


def _owner(a: dict, b: dict) -> str:
    """The task owner. Claims normally agree (ingest inherits the owner of an existing entity);
    if they don't, take the earlier-stated claim's owner so both devices pick the same one."""
    if a.get("owner") == b.get("owner"):
        return a.get("owner")
    first = min((a, b), key=lambda c: (c.get("stated_at") or "", c["claim_id"]))
    return first.get("owner")


def check(ctx, claim: dict, detected_on: str) -> dict | None:
    """Open a conflict if a live claim about the same thing disagrees on the value."""
    if claim.get("status") not in ("active", "disputed"):
        return None
    for other, similarity in ctx.memory.conflict_candidates(claim):
        if other.get("value") != claim.get("value"):
            return _open(ctx, claim, other, similarity, detected_on)
    return None


def _open(ctx, claim: dict, other: dict, similarity: float, detected_on: str) -> dict:
    ids = sorted([claim["claim_id"], other["claim_id"]])
    cid = conflict_id_for(ids)
    existing = ctx.store.get_conflict(cid)
    if existing is not None:
        return existing  # already known (or already resolved): never reopen
    conflict = {
        "conflict_id": cid,
        "claim_ids": ids,
        "entity": other["entity"],
        "attribute": other["attribute"],
        "similarity": round(similarity, 3),
        "owner": _owner(claim, other),
        "status": "open",
        "detected_on": detected_on,
        "detected_at": now_iso(),
        "winner_claim_id": None,
        "resolution_claim_id": None,
        "resolved_by": None,
    }
    ctx.store.put_conflict(conflict)
    for claim_id in ids:
        # Local only: disputed is never pushed and must not outrank the next pulled version.
        marked = ctx.memory.update_fields(claim_id, bump_version=False, status="disputed", conflict_id=cid)
        publish_claim(ctx, marked)
    ctx.bus.publish("conflict", conflict)
    log_activity(ctx, "conflict_opened", describe(conflict))
    return conflict


def _narrowest_tier(claims: list[dict]) -> str:
    return min((c.get("tier") if c.get("tier") in TIERS else "device" for c in claims), key=TIERS.index)


def resolve(ctx, conflict_id: str, winner_claim_id: str, resolved_by: str) -> dict:
    # Check-then-act under one lock: a double click or a client retry must not settle twice.
    with _resolve_lock:
        return _resolve(ctx, conflict_id, winner_claim_id, resolved_by)


def _resolve(ctx, conflict_id: str, winner_claim_id: str, resolved_by: str) -> dict:
    conflict = ctx.store.get_conflict(conflict_id)
    if conflict is None:
        raise KeyError(conflict_id)
    if winner_claim_id not in conflict["claim_ids"]:
        raise ValueError(f"{winner_claim_id} is not part of {conflict_id}")
    if conflict["status"] != "open":
        return conflict

    # The outcome is shared only as widely as the most private claim in the conflict: settling a
    # team claim against a device-only one must not put the private value (or the fact that a
    # private claim overruled the team) on the hub. Wider claims get local-only marks then.
    current = [c for c in (ctx.memory.get(cid) for cid in conflict["claim_ids"]) if c is not None]
    audience = _narrowest_tier(current)
    tier_of = {c["claim_id"]: c.get("tier") for c in current}

    def settle(claim_id: str, status: str) -> dict:
        shared = TIERS.index(tier_of.get(claim_id, "device")) <= TIERS.index(audience)
        claim = ctx.memory.update_fields(claim_id, bump_version=shared, status=status, conflict_id=conflict_id)
        if shared and claim.get("tier") in SHARED_TIERS:
            ctx.store.enqueue(claim_id)
        return claim

    loser_ids = [c for c in conflict["claim_ids"] if c != winner_claim_id]
    winner = settle(winner_claim_id, "active")
    losers = [settle(c, "superseded") for c in loser_ids]

    stamp = now_iso()
    # Name the conflict's entity (what the conflict card shows), not the winner's own phrasing.
    text = f"Resolved: {conflict['entity']} {winner.get('value_label') or winner['value']} (chosen by {first_name(resolved_by)})"
    resolution = {
        "claim_id": new_claim_id(),
        "text": text,
        "entity": conflict["entity"],
        "entity_kind": winner.get("entity_kind", "task"),
        "attribute": "resolution",
        "value": winner_claim_id,
        "value_label": winner.get("value_label") or str(winner["value"]),
        "owner": conflict["owner"],
        "source": {"kind": "resolution", "ref": f"conflict:{conflict_id}", "author": resolved_by,
                   "excerpt": text, "at": stamp},
        "stated_at": stamp,
        "captured_by": ctx.cfg.device,
        "device_id": ctx.cfg.device_id,
        "tier": audience,
        "status": "active",
        "conflict_id": conflict_id,
        "resolves": conflict_id,
        "version": 1,
        "modified_at": now_ms(),
        "modified_by": ctx.cfg.device,
    }
    ctx.memory.add_claim(resolution)
    if audience in SHARED_TIERS:
        ctx.store.enqueue(resolution["claim_id"])

    conflict = ctx.store.update_conflict(
        conflict_id, status="resolved", winner_claim_id=winner_claim_id,
        resolution_claim_id=resolution["claim_id"], resolved_by=resolved_by, resolved_at=stamp,
    )
    _announce_resolution(ctx, conflict, [winner, *losers, resolution])
    return conflict


def apply_remote_resolution(ctx, resolution_claim: dict) -> dict | None:
    """Apply a resolution made on another device, creating the conflict record if we never saw it."""
    conflict_id = resolution_claim.get("resolves")
    winner_id = resolution_claim.get("value")
    if not conflict_id or not winner_id:
        return None

    conflict = ctx.store.get_conflict(conflict_id)
    if conflict is None:
        conflict = _reconstruct(ctx, conflict_id, winner_id, resolution_claim)
    if conflict["status"] == "resolved" and conflict.get("resolution_claim_id") == resolution_claim["claim_id"]:
        return conflict

    # Local status marks only; the resolver's version-bumped winner/loser arrive through sync too.
    touched = []
    for claim_id in conflict["claim_ids"]:
        if ctx.memory.get(claim_id) is None:
            continue
        status = "active" if claim_id == winner_id else "superseded"
        touched.append(ctx.memory.update_fields(claim_id, bump_version=False, status=status, conflict_id=conflict_id))

    conflict = dict(conflict, status="resolved", winner_claim_id=winner_id,
                    resolution_claim_id=resolution_claim["claim_id"],
                    resolved_by=resolution_claim.get("captured_by") or resolution_claim.get("modified_by"),
                    resolved_at=resolution_claim.get("stated_at"))
    ctx.store.put_conflict(conflict)
    resolution = ctx.memory.get(resolution_claim["claim_id"])
    _announce_resolution(ctx, conflict, touched + ([resolution] if resolution else []))
    return conflict


def _reconstruct(ctx, conflict_id: str, winner_id: str, resolution_claim: dict) -> dict:
    """We never detected this conflict. The resolver's version-bumped loser usually arrived first,
    tagged with the conflict_id; otherwise look among the winner's live candidates for the claim
    whose pair id matches."""
    winner = ctx.memory.get(winner_id)
    tagged = [c["claim_id"] for c in ctx.memory.all_claims()
              if c.get("conflict_id") == conflict_id and c.get("attribute") != "resolution"]
    claim_ids = sorted(set(tagged) | {winner_id})
    similarity = 0.0
    if len(claim_ids) < 2 and winner is not None:
        for other, score in ctx.memory.conflict_candidates(winner):
            if conflict_id_for([winner_id, other["claim_id"]]) == conflict_id:
                claim_ids, similarity = sorted([winner_id, other["claim_id"]]), round(score, 3)
                break
    return {
        "conflict_id": conflict_id,
        "claim_ids": claim_ids,
        "entity": resolution_claim["entity"],
        "attribute": winner["attribute"] if winner else None,
        "similarity": similarity,
        "owner": resolution_claim.get("owner"),
        "status": "open",
        "detected_on": "sync",
        "detected_at": now_iso(),
        "winner_claim_id": None,
        "resolution_claim_id": None,
        "resolved_by": None,
    }


def _announce_resolution(ctx, conflict: dict, claims: list[dict]) -> None:
    for claim in claims:
        publish_claim(ctx, claim)
    ctx.bus.publish("conflict", conflict)
    winner = next((c for c in claims if c["claim_id"] == conflict["winner_claim_id"]), None)
    label = (winner or {}).get("value_label") or ""
    who = first_name(conflict.get("resolved_by") or "")
    log_activity(ctx, "conflict_resolved", f"{who} settled the {conflict['entity']}: {label}".rstrip(": "))
