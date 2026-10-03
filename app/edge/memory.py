"""The device's memory: one Qdrant Edge shard holding claims with three named vectors."""
import threading
import time
import uuid
from contextlib import contextmanager

import numpy as np
import qdrant_edge as q

from edge.embed import DENSE_DIM

CONFLICT_ATTRIBUTES = {"due_date", "birthday", "assignee", "location", "amount", "count"}
LIVE_STATUSES = ["active", "disputed"]
UI_ONLY_FIELDS = ("sync", "xyz")

_PROJECTION = np.random.default_rng(7).normal(size=(DENSE_DIM, 3))
_XYZ_SCALE = 6.0


def point_id(claim_id: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, claim_id))


def key_text(claim: dict) -> str:
    return f"{claim['entity']} {claim['attribute'].replace('_', ' ')}"


def now_ms() -> int:
    return int(time.time() * 1000)


def _match(key: str, value) -> q.FieldCondition:
    return q.FieldCondition(key=key, match=q.MatchValue(value=value))


def _live(*extra: q.FieldCondition, must_not=None) -> q.Filter:
    return q.Filter(
        must=[q.FieldCondition(key="status", match=q.MatchAny(any=LIVE_STATUSES)), *extra],
        must_not=must_not,
    )


def _stored(claim: dict) -> dict:
    return {k: v for k, v in claim.items() if k not in UI_ONLY_FIELDS}


def _to_edge_sparse(v) -> q.SparseVector:
    """Accept a qdrant_edge SparseVector, a qdrant-client SparseVector, or {"indices", "values"}."""
    if isinstance(v, q.SparseVector):
        return v
    if isinstance(v, dict):
        return q.SparseVector(indices=list(v["indices"]), values=list(v["values"]))
    return q.SparseVector(indices=list(v.indices), values=list(v.values))


def _plain_vectors(vector: dict) -> dict:
    """Shard vectors -> JSON-friendly dict (the shape sync pushes and upsert_raw accepts)."""
    out = {}
    for name, v in (vector or {}).items():
        if hasattr(v, "indices"):
            out[name] = {"indices": list(v.indices), "values": list(v.values)}
        else:
            out[name] = list(v)
    return out


class Memory:
    def __init__(self, cfg, embedder):
        self.cfg = cfg
        self.embedder = embedder
        # Serialises read-modify-write on payloads; the API threadpool and the sync thread share us.
        self._lock = threading.RLock()
        self._batch_depth = 0
        path = cfg.data_dir / cfg.device / "shard"
        if (path / "edge_config.json").exists():
            self.shard = q.EdgeShard.load(str(path))
        else:
            path.mkdir(parents=True, exist_ok=True)
            self.shard = q.EdgeShard.create(str(path), self._edge_config())

    @staticmethod
    def _edge_config() -> q.EdgeConfig:
        def dense():
            return q.EdgeVectorParams(size=DENSE_DIM, distance=q.Distance.Cosine)

        return q.EdgeConfig(
            vectors={"text": dense(), "key": dense()},
            sparse_vectors={"bm25": q.EdgeSparseVectorParams(modifier=q.Modifier.Idf)},
        )

    # ---- writes -------------------------------------------------------------------------------

    def add_claim(self, claim: dict) -> dict:
        """Store a locally created claim, computing all three vectors."""
        text_vec, key_vec = self.embedder.dense([claim["text"], key_text(claim)])
        vectors = {"text": text_vec, "key": key_vec, "bm25": self.embedder.bm25_doc(claim["text"])}
        self._upsert(_stored(claim), vectors)
        return claim

    def upsert_raw(self, claim: dict, vectors: dict) -> dict:
        """Store a claim pulled from the hub, using its vectors as received."""
        converted = {
            "text": list(vectors["text"]),
            "key": list(vectors["key"]),
            "bm25": _to_edge_sparse(vectors["bm25"]),
        }
        self._upsert(_stored(claim), converted)
        return claim

    def _upsert(self, payload: dict, vectors: dict) -> None:
        point = q.Point(id=point_id(payload["claim_id"]), vector=vectors, payload=payload)
        with self._lock:
            self.shard.update(q.UpdateOperation.upsert_points([point]))
            self._flush_unless_batching()

    # Edge shard updates live in memory until flush(); a hard kill (demo.ps1 -Stop, a crash) would
    # otherwise lose every claim since startup while SQLite (outbox, cursor) keeps its state.
    # A flush is ~28 ms, so single writes flush at once and bulk writes flush once at the end.
    @contextmanager
    def batch(self):
        """Group writes (a sync pull, seeding) under a single flush."""
        with self._lock:
            self._batch_depth += 1
            try:
                yield self
            finally:
                self._batch_depth -= 1
                self._flush_unless_batching()

    def _flush_unless_batching(self) -> None:
        if self._batch_depth == 0:
            self.shard.flush()

    def update_fields(self, claim_id: str, bump_version: bool = True, **fields) -> dict:
        """Patch a claim's payload. bump_version=False is for local-only marks (e.g. disputed) that
        must not outrank the next real version pulled from the hub."""
        with self._lock:
            claim = self.get(claim_id)
            if claim is None:
                raise KeyError(claim_id)
            claim.update(_stored(fields))
            if bump_version:
                claim["version"] = int(claim.get("version", 1)) + 1
                claim["modified_at"] = now_ms()
                claim["modified_by"] = fields.get("modified_by", self.cfg.device)
            self.shard.update(q.UpdateOperation.overwrite_payload([point_id(claim_id)], claim))
            self._flush_unless_batching()
        return claim

    # ---- reads --------------------------------------------------------------------------------

    def get(self, claim_id: str) -> dict | None:
        records = self.shard.retrieve([point_id(claim_id)], True, False)
        return dict(records[0].payload) if records else None

    def get_with_vectors(self, claim_id: str) -> tuple[dict | None, dict | None]:
        records = self.shard.retrieve([point_id(claim_id)], True, True)
        if not records:
            return None, None
        return dict(records[0].payload), _plain_vectors(records[0].vector)

    def all_claims(self) -> list[dict]:
        return [dict(r.payload) for r in self._scroll(with_vector=False)]

    def all_claims_with_xyz(self) -> list[tuple[dict, list[float]]]:
        """One scroll for the whole cloud instead of a retrieve per point."""
        return [(dict(r.payload), self._project(r.vector["text"])) for r in self._scroll(with_vector=True)]

    def _scroll(self, with_vector: bool) -> list:
        records, offset = [], None
        while True:
            page, offset = self.shard.scroll(
                q.ScrollRequest(offset=offset, limit=256, with_payload=True, with_vector=with_vector)
            )
            records.extend(page)
            if offset is None or not page:
                return records

    def search(self, q_text: str, view: str, limit: int = 6) -> list[tuple[dict, float]]:
        """Hybrid BM25 + dense search fused with RRF. view "team" hides device/my_devices tiers."""
        extra = [_match("tier", "team")] if view == "team" else []
        dense = self.embedder.dense([q_text])[0]
        request = q.QueryRequest(
            limit=limit,
            prefetches=[
                q.Prefetch(limit=20, query=q.Query.Nearest(self.embedder.bm25_query(q_text), using="bm25")),
                q.Prefetch(limit=20, query=q.Query.Nearest(dense, using="text")),
            ],
            query=q.Fusion.Rrf(k=60),
            filter=_live(*extra),
            with_payload=True,
        )
        return [(dict(h.payload), float(h.score)) for h in self.shard.query(request)]

    def key_vector(self, claim: dict) -> list[float]:
        _, vectors = self.get_with_vectors(claim["claim_id"])
        if vectors and "key" in vectors:
            return vectors["key"]
        return self.embedder.dense([key_text(claim)])[0]

    def conflict_candidates(self, claim: dict) -> list[tuple[dict, float]]:
        """Live claims about the same thing (dense cosine on the key vector >= threshold)."""
        if claim.get("attribute") not in CONFLICT_ATTRIBUTES:
            return []
        request = q.QueryRequest(
            limit=5,
            query=q.Query.Nearest(self.key_vector(claim), using="key"),
            filter=_live(_match("attribute", claim["attribute"]), must_not=[_match("claim_id", claim["claim_id"])]),
            score_threshold=self.cfg.conflict_threshold,
            with_payload=True,
        )
        return [(dict(h.payload), float(h.score)) for h in self.shard.query(request)]

    def find_entity(self, entity: str, attribute: str) -> dict | None:
        """An existing claim about the same entity: exact name first, else key-vector match on any
        attribute (same entity, other attribute scores ~0.89; other clients score <= 0.76)."""
        wanted = entity.strip().lower()
        for claim in self.all_claims():
            if claim.get("entity", "").strip().lower() == wanted and claim.get("attribute") != "resolution":
                return claim
        vec = self.embedder.dense([key_text({"entity": entity, "attribute": attribute})])[0]
        hits = self.shard.query(
            q.QueryRequest(
                limit=1,
                query=q.Query.Nearest(vec, using="key"),
                filter=q.Filter(must_not=[_match("attribute", "resolution")]),
                score_threshold=self.cfg.conflict_threshold,
                with_payload=True,
            )
        )
        return dict(hits[0].payload) if hits else None

    def xyz(self, claim: dict) -> list[float]:
        _, vectors = self.get_with_vectors(claim["claim_id"])
        if vectors and "text" in vectors:
            return self._project(vectors["text"])
        return self._project(self.embedder.dense([claim["text"]])[0])

    @staticmethod
    def _project(text_vec) -> list[float]:
        """Fixed random projection: same claim, same spot on every device; points never jump."""
        return [round(float(v), 4) for v in (np.asarray(text_vec) @ _PROJECTION) * _XYZ_SCALE]

    def count(self) -> int:
        return int(self.shard.count(q.CountRequest()))

    def close(self) -> None:
        with self._lock:
            self.shard.flush()
            self.shard.close()
