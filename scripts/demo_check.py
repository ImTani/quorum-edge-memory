"""Drive the contract's 8-step demo over HTTP against both devices and the hub, asserting each step.

Run right after a fresh `.\\scripts\\demo.ps1` (it consumes the demo: the note, the inbox email and
the resolution happen for real):

    app\\.venv\\Scripts\\python scripts\\demo_check.py [--until N]

Prints one PASS/FAIL line per check with timings; exits 1 if anything failed.
`--until 5` runs steps 1-5 and leaves the conflict open, for rehearsing the rest by hand.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path
from typing import Any, Callable

import httpx

ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "app" / "fixtures"
TANISHK = "http://127.0.0.1:8001"
LAKSHYA = "http://127.0.0.1:8002"
HUB = "http://127.0.0.1:6333"
COLLECTION = "quorum_team"
SYNC_WAIT_S = 10.0
OFFLINE_WATCH_S = 3.0
THRESHOLD = 0.82

http = httpx.Client(timeout=30.0)
results: list[tuple[bool, str]] = []


class Abort(Exception):
    """A step can't continue meaningfully (later steps depend on it)."""


# ---- reporting -------------------------------------------------------------------------------


def check(ok: bool, what: str, detail: str = "") -> bool:
    results.append((bool(ok), what))
    line = f"  {'PASS' if ok else 'FAIL'}  {what}"
    print(line + (f"  ({detail})" if detail else ""))
    return bool(ok)


def require(ok: bool, what: str, detail: str = "") -> None:
    if not check(ok, what, detail):
        raise Abort(what)


def step(n: int, title: str) -> float:
    print(f"\n[{n}] {title}")
    return time.perf_counter()


def done(started: float) -> None:
    print(f"      step took {(time.perf_counter() - started) * 1000:.0f} ms")


# ---- HTTP helpers ----------------------------------------------------------------------------


def get(base: str, path: str) -> Any:
    r = http.get(base + path)
    r.raise_for_status()
    return r.json()


def post(base: str, path: str, body: dict | None = None, expect: int = 200) -> Any:
    r = http.post(base + path, json=body)
    if r.status_code != expect:
        raise AssertionError(f"POST {base}{path} -> {r.status_code}: {r.text[:200]}")
    return r.json()


def state(base: str) -> dict:
    return get(base, "/api/state")


def hub_point(claim_id: str) -> dict | None:
    """The hub's copy of a claim, read straight from Qdrant's REST API (not through a device)."""
    pid = str(uuid.uuid5(uuid.NAMESPACE_URL, claim_id))
    r = http.get(f"{HUB}/collections/{COLLECTION}/points/{pid}")
    if r.status_code == 404:
        return None
    r.raise_for_status()
    return r.json()["result"]["payload"]


def hub_scroll(flt: dict | None = None) -> list[dict]:
    points, offset = [], None
    while True:
        body = {"limit": 256, "with_payload": True, "with_vector": False, "offset": offset}
        if flt:
            body["filter"] = flt
        r = http.post(f"{HUB}/collections/{COLLECTION}/points/scroll", json=body)
        r.raise_for_status()
        result = r.json()["result"]
        points += result["points"]
        offset = result.get("next_page_offset")
        if offset is None:
            return points


def wait_for(fn: Callable[[], Any], timeout: float = SYNC_WAIT_S, every: float = 0.25) -> tuple[Any, float]:
    """Poll fn until it returns something truthy; returns (value, seconds waited) or (None, timeout)."""
    started = time.perf_counter()
    while True:
        value = fn()
        if value:
            return value, time.perf_counter() - started
        if time.perf_counter() - started > timeout:
            return None, timeout
        time.sleep(every)


def claim_in(st: dict, claim_id: str) -> dict | None:
    return next((c for c in st["claims"] if c["claim_id"] == claim_id), None)


def conflict_in(st: dict, conflict_id: str) -> dict | None:
    return next((c for c in st["conflicts"] if c["conflict_id"] == conflict_id), None)


def sharma_due(claims: list[dict], value: str) -> dict | None:
    return next((c for c in claims if c["attribute"] == "due_date" and "sharma" in c["entity"].lower()
                 and c["value"] == value), None)


# ---- the demo --------------------------------------------------------------------------------


def preflight() -> None:
    t0 = step(0, "Preflight: hub and both devices are up and freshly seeded")
    require(http.get(f"{HUB}/readyz").status_code == 200, "hub answers /readyz")
    for name, base in (("tanishk", TANISHK), ("lakshya", LAKSHYA)):
        st = state(base)
        require(st["device"] == name, f"{name} answers /api/state")
        require(st["sync"]["online"] and not st["conflicts"],
                f"{name} is online with no conflicts (fresh demo.ps1 run)",
                f"{len(st['claims'])} claims, outbox {st['sync']['outbox']}")
    require(len(get(LAKSHYA, "/api/inbox")) == 1, "lakshya has the client email pending")
    done(t0)


def step1_due_this_week() -> None:
    t0 = step(1, "Populated clouds; Lakshya asks what's due this week")
    for name, base in (("tanishk", TANISHK), ("lakshya", LAKSHYA)):
        claims = state(base)["claims"]
        check(len(claims) >= 15 and all(len(c.get("xyz") or []) == 3 for c in claims),
              f"{name}'s cloud is populated with positioned claims", f"{len(claims)} claims")
    r = post(LAKSHYA, "/api/ask", {"q": "What's due this week?", "view": "mine"})
    print(f"      answer: {r['answer']}")
    check("due this week" in r["answer"], "answer lists what's due this week")
    cites = r["citations"]
    check(len(cites) >= 2 and all(c.get("kind") and c.get("author") and c.get("at") for c in cites),
          "answer is cited (kind, author, date on every citation)", f"{len(cites)} citations")
    check(r["took_ms"] < 500, "answered on device in ms", f"{r['took_ms']} ms")
    done(t0)


def step2_tanishk_offline() -> None:
    t0 = step(2, "Tanishk: no connection to hub; his network counter freezes")
    st = post(TANISHK, "/api/net", {"online": False})
    require(st["online"] is False, "tanishk's sync worker is offline")
    before = state(TANISHK)["sync"]
    time.sleep(OFFLINE_WATCH_S)
    after = state(TANISHK)["sync"]
    check((before["bytes_up"], before["bytes_down"]) == (after["bytes_up"], after["bytes_down"]),
          f"tanishk's bytes don't change over {OFFLINE_WATCH_S:.0f} s",
          f"up {after['bytes_up']} B, down {after['bytes_down']} B")
    r = post(TANISHK, "/api/ask", {"q": "What's due this week?", "view": "mine"})
    check(bool(r["answer"]) and r["took_ms"] < 500, "asking still answers while offline", f"{r['took_ms']} ms")
    done(t0)


def step3_note_offline(note: str) -> dict:
    t0 = step(3, "Tanishk types the note while offline: queued, not on the hub")
    bytes_before = state(TANISHK)["sync"]
    r = post(TANISHK, "/api/ingest", {"kind": "note", "text": note})
    claim = sharma_due(r["claims"], "2026-10-18")
    require(claim is not None, "note became a Sharma due-date claim for 18 Oct",
            f"extractor {r['extractor']}, {r['took_ms']:.0f} ms, {[c['text'] for c in r['claims']]}")
    check(claim["tier"] == "team" and claim["sync"] == "queued", "claim is team tier and queued (amber)")
    st = state(TANISHK)["sync"]
    check(st["outbox"] >= 1, "tanishk's outbox holds it", f"outbox {st['outbox']}")
    time.sleep(1.5)                                    # longer than one sync tick
    check(hub_point(claim["claim_id"]) is None, "the hub does NOT have the note (queried the hub directly)")
    st = state(TANISHK)["sync"]
    check((st["bytes_up"], st["bytes_down"]) == (bytes_before["bytes_up"], bytes_before["bytes_down"]),
          "still zero bytes to the hub after capturing")
    done(t0)
    return claim


def step4_email_syncs() -> dict:
    t0 = step(4, "Lakshya receives the client email: the claim reaches the hub")
    email = get(LAKSHYA, "/api/inbox")[0]
    r = post(LAKSHYA, f"/api/inbox/{email['id']}/receive")
    claim = sharma_due(r["claims"], "2026-10-16")
    require(claim is not None, "email became a Sharma due-date claim for 16 Oct",
            f"extractor {r['extractor']}, {r['took_ms']:.0f} ms, {[c['text'] for c in r['claims']]}")
    on_hub, waited = wait_for(lambda: hub_point(claim["claim_id"]))
    check(on_hub is not None, "claim reached the hub", f"{waited:.1f} s")
    synced, waited = wait_for(lambda: (claim_in(state(LAKSHYA), claim["claim_id"]) or {}).get("sync") == "synced")
    check(bool(synced), "lakshya shows it synced (green)", f"{waited:.1f} s")
    done(t0)
    return claim


def step5_reconnect_conflict(note_claim: dict, email_claim: dict) -> dict:
    t0 = step(5, "Tanishk reconnects: outbox drains and both devices find the same conflict")
    post(TANISHK, "/api/net", {"online": True})
    pair = sorted([note_claim["claim_id"], email_claim["claim_id"]])

    def both_see_it():
        found = []
        for base in (TANISHK, LAKSHYA):
            cf = next((c for c in state(base)["conflicts"] if sorted(c["claim_ids"]) == pair), None)
            if cf is None:
                return None
            found.append(cf)
        return found

    found, waited = wait_for(both_see_it)
    require(found is not None, f"both devices have the conflict within {SYNC_WAIT_S:.0f} s", f"{waited:.1f} s")
    t_cf, l_cf = found
    check(t_cf["conflict_id"] == l_cf["conflict_id"], "same conflict_id on both devices", t_cf["conflict_id"])
    check(t_cf["status"] == l_cf["status"] == "open", "conflict is open on both")
    sims = f"tanishk {t_cf['similarity']:.3f}, lakshya {l_cf['similarity']:.3f}"
    check(min(t_cf["similarity"], l_cf["similarity"]) >= THRESHOLD, f"similarity >= {THRESHOLD}", sims)
    check(t_cf["owner"] == l_cf["owner"] == "tanishk", "both agree Tanishk owns it")
    st = state(TANISHK)
    check(st["sync"]["outbox"] == 0, "tanishk's outbox drained")
    check(hub_point(note_claim["claim_id"]) is not None, "the note is on the hub now")
    statuses = {c["claim_id"]: c["status"] for c in st["claims"] if c["claim_id"] in pair}
    check(set(statuses.values()) == {"disputed"}, "both claims are disputed on tanishk")
    done(t0)
    return t_cf


def step6_disputed_answer(conflict: dict) -> None:
    t0 = step(6, "Tanishk asks when the Sharma delivery is")
    r = post(TANISHK, "/api/ask", {"q": "When is the Sharma delivery?", "view": "mine"})
    print(f"      answer: {r['answer']}")
    check(r["answer"].startswith("Disputed"), "answer leads with \"Disputed\"")
    check(r["disputed"] is True, "response is flagged disputed")
    cited = {c["claim_id"] for c in r["citations"]}
    check(set(conflict["claim_ids"]) <= cited, "both sources are cited",
          ", ".join(f"{c['kind']} from {c['author']}" for c in r["citations"][:2]))
    check(r["took_ms"] < 500, "answered in ms", f"{r['took_ms']} ms")
    done(t0)


def step7_draft_and_resolve(conflict: dict, winner: dict, loser: dict) -> None:
    t0 = step(7, "Lakshya drafts a message to Tanishk; Tanishk resolves")
    cid = conflict["conflict_id"]
    d = post(LAKSHYA, f"/api/conflicts/{cid}/draft")
    check(d["to"] == "Tanishk" and d["text"] and d["mailto"].startswith("mailto:")
          and d["wa_link"].startswith("https://wa.me/"), "lakshya's draft has text, mailto and WhatsApp link")
    print(f"      draft: {d['text']}")
    r = http.post(f"{LAKSHYA}/api/conflicts/{cid}/resolve", json={"winner_claim_id": winner["claim_id"]})
    check(r.status_code == 403, "lakshya can't resolve (not the owner)", f"HTTP {r.status_code}")
    resolved = post(TANISHK, f"/api/conflicts/{cid}/resolve", {"winner_claim_id": winner["claim_id"]})
    check(resolved["status"] == "resolved", f"tanishk keeps {winner['value_label']}")

    def lakshya_settled():
        st = state(LAKSHYA)
        cf = conflict_in(st, cid) or {}
        w, l = claim_in(st, winner["claim_id"]) or {}, claim_in(st, loser["claim_id"]) or {}
        ok = (cf.get("status") == "resolved" and cf.get("winner_claim_id") == winner["claim_id"]
              and w.get("status") == "active" and l.get("status") == "superseded")
        return ok

    settled, waited = wait_for(lakshya_settled)
    check(bool(settled), "lakshya shows it resolved, winner active, loser superseded", f"{waited:.1f} s")
    st = state(TANISHK)
    check((claim_in(st, loser["claim_id"]) or {}).get("status") == "superseded"
          and (claim_in(st, winner["claim_id"]) or {}).get("status") == "active",
          "tanishk shows the same")
    drained, waited = wait_for(lambda: state(TANISHK)["sync"]["outbox"] == 0)
    check(bool(drained), "resolution pushed (tanishk's outbox empty)", f"{waited:.1f} s")
    done(t0)


def step8_privacy() -> None:
    t0 = step(8, "Team view hides device-only claims; the hub holds none")
    for name, base in (("tanishk", TANISHK), ("lakshya", LAKSHYA)):
        claims = state(base)["claims"]
        private = [c for c in claims if c["tier"] == "device"]
        check(bool(private) and all(c["sync"] == "private" for c in private),
              f"{name} has device-only claims, marked private", f"{len(private)}")
        mine = post(base, "/api/ask", {"q": "salary credited", "view": "mine"})
        team = post(base, "/api/ask", {"q": "salary credited", "view": "team"})
        mine_tiers = {h["claim"]["tier"] for h in mine["hits"]}
        team_tiers = {h["claim"]["tier"] for h in team["hits"]}
        check("device" in mine_tiers and team_tiers <= {"team"},
              f"{name}: mine view finds private claims, team view shows only team claims",
              f"mine {sorted(mine_tiers)}, team {sorted(team_tiers)}")
    device_points = hub_scroll({"must": [{"key": "tier", "match": {"value": "device"}}]})
    check(not device_points, "hub has zero device-tier points", f"{len(device_points)} found")
    everything = hub_scroll()
    tiers = sorted({p["payload"].get("tier") for p in everything})
    check(set(tiers) <= {"team", "my_devices"}, "every hub point is team or my_devices",
          f"{len(everything)} points, tiers {tiers}")
    check(all(p["payload"].get("status") != "disputed" for p in everything),
          "local 'disputed' marks never reached the hub")
    done(t0)


class Until(Exception):
    """--until N reached: stop cleanly, leaving the demo mid-way for a presenter to continue."""


def main() -> int:
    parser = argparse.ArgumentParser(description="Drive and assert the 8-step demo.")
    parser.add_argument("--until", type=int, default=8, metavar="N",
                        help="stop after step N (e.g. 5 leaves the conflict open for a rehearsal)")
    until = parser.parse_args().until

    def reached(n: int) -> None:
        if n >= until:
            raise Until()

    note = json.loads((FIXTURES / "demo_inputs.json").read_text(encoding="utf-8"))["tanishk_note"]
    started = time.perf_counter()
    try:
        preflight()
        step1_due_this_week(); reached(1)
        step2_tanishk_offline(); reached(2)
        note_claim = step3_note_offline(note); reached(3)
        email_claim = step4_email_syncs(); reached(4)
        conflict = step5_reconnect_conflict(note_claim, email_claim); reached(5)
        step6_disputed_answer(conflict); reached(6)
        # The call came after the email, so the 18th is the current date.
        step7_draft_and_resolve(conflict, winner=note_claim, loser=email_claim); reached(7)
        step8_privacy()
    except Until:
        print(f"\nStopped after step {until} as asked (--until).")
    except Abort as exc:
        print(f"\nStopped early: '{exc}' failed and later steps depend on it.")
    except (httpx.HTTPError, AssertionError, KeyError) as exc:
        check(False, f"unexpected error: {type(exc).__name__}: {exc}")
    finally:
        http.close()

    failed = [what for ok, what in results if not ok]
    total = time.perf_counter() - started
    print(f"\ndemo_check: {len(results) - len(failed)} passed, {len(failed)} failed in {total:.1f} s")
    for what in failed:
        print(f"  FAILED: {what}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
