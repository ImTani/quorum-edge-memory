"""Demo reset: `python -m edge.seed [--hub URL] [--data DIR] [--seed FILE]`.

Run with the devices stopped and the hub running. Wipes each device's data, recreates the hub
collection, and loads the pre-extracted fixture claims: `shared` into both devices and the hub,
each person's own list into their device only (plus the hub for non-device tiers, so a
`my_devices` claim can reach that person's other devices). Each shared claim is embedded once and
the same vectors are written everywhere, so all three copies are identical.
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

from edge.config import APP_DIR, FIXTURES_DIR, PEERS, Config
from edge.store import Store
from edge.sync import PUSHABLE_TIERS, ensure_collection, hub_point, make_client

DEVICES = tuple(PEERS)                       # ("tanishk", "lakshya")
REQUIRED = ("claim_id", "text", "entity", "attribute", "tier", "version", "modified_at", "modified_by")


def load_seed(path: Path) -> dict:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    for group, claims in data.items():
        for claim in claims:
            missing = [k for k in REQUIRED if k not in claim]
            if missing:
                raise SystemExit(f"{path}: claim {claim.get('claim_id', '?')} in '{group}' lacks {missing}")
    return data


def wipe_device(data_dir: Path, device: str) -> None:
    target = data_dir / device
    if not target.exists():
        return
    try:
        shutil.rmtree(target)
    except PermissionError as exc:           # Windows: a running device holds its shard open
        raise SystemExit(f"cannot wipe {target}: is the '{device}' device still running? "
                         f"Stop it first (scripts\\demo.ps1 -Stop). ({exc})")


def seed(hub_url: str, data_dir: Path, seed_path: Path, collection: str | None = None) -> dict:
    from edge.embed import get_embedder      # heavy imports only once we know the inputs are sane
    from edge.memory import Memory

    data = load_seed(seed_path)
    data_dir = Path(data_dir)
    configs = {d: Config(device=d, hub_url=hub_url, data_dir=data_dir) for d in DEVICES}
    collection = collection or configs[DEVICES[0]].hub_collection

    client = make_client(hub_url)
    try:
        try:
            client.get_collections()
        except Exception as exc:
            raise SystemExit(f"hub not reachable at {hub_url}: {exc}")

        for device in DEVICES:
            wipe_device(data_dir, device)
        if client.collection_exists(collection):
            client.delete_collection(collection)
        ensure_collection(client, collection)

        embedder = get_embedder(configs[DEVICES[0]])
        memories = {d: Memory(configs[d], embedder) for d in DEVICES}
        hub_points, counts, seeded = [], {d: 0 for d in DEVICES}, []
        try:
            first, *others = DEVICES
            for claim in data.get("shared", []):
                memories[first].add_claim(claim)
                _, vectors = memories[first].get_with_vectors(claim["claim_id"])
                for device in others:
                    memories[device].upsert_raw(claim, vectors)
                if claim["tier"] in PUSHABLE_TIERS:
                    hub_points.append(hub_point(claim, vectors))
                else:
                    print(f"warning: shared claim {claim['claim_id']} has tier {claim['tier']!r}; kept off the hub")
                for device in DEVICES:
                    counts[device] += 1
                seeded.append(claim)

            for device in DEVICES:
                for claim in data.get(device, []):
                    memories[device].add_claim(claim)
                    if claim["tier"] in PUSHABLE_TIERS:
                        _, vectors = memories[device].get_with_vectors(claim["claim_id"])
                        hub_points.append(hub_point(claim, vectors))
                    counts[device] += 1
                    seeded.append(claim)

            if hub_points:
                client.upsert(collection, points=hub_points, wait=True)
        finally:
            for memory in memories.values():
                memory.close()

        # Everything seeded is already on every device that should have it: start pulling after it.
        cursor = max((int(c["modified_at"]) for c in seeded), default=0)
        for device in DEVICES:
            store = Store(configs[device])
            try:
                store.kv_set("pull_cursor", cursor)
            finally:
                store.close()

        return {"devices": counts, "hub": client.count(collection, exact=True).count, "pull_cursor": cursor}
    finally:
        client.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m edge.seed", description=__doc__.splitlines()[0])
    parser.add_argument("--hub", default="http://127.0.0.1:6333")
    parser.add_argument("--data", type=Path, default=APP_DIR / "data")
    parser.add_argument("--seed", type=Path, default=FIXTURES_DIR / "seed.json")
    parser.add_argument("--collection", default=None, help="hub collection (default: Config.hub_collection)")
    args = parser.parse_args(argv)

    result = seed(args.hub, args.data, args.seed, args.collection)
    per_device = ", ".join(f"{d} {n}" for d, n in result["devices"].items())
    print(f"seeded: {per_device}; hub {result['hub']}; pull_cursor {result['pull_cursor']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
