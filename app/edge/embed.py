"""Embeddings: dense bge-small via FastEmbed, sparse BM25 from qdrant_edge itself."""
import threading

import numpy as np
import qdrant_edge as q

DENSE_MODEL = "BAAI/bge-small-en-v1.5"
DENSE_DIM = 384


class Embedder:
    def __init__(self, models_dir):
        from fastembed import TextEmbedding  # imported late so edge/__init__ has pinned the cache paths

        cache_dir = str(models_dir / "fastembed")
        try:
            # Without local_files_only, fastembed asks the HF API before touching the cache, so an
            # offline device would fail to start. Cache first; download only if the cache is empty.
            self._dense = TextEmbedding(DENSE_MODEL, cache_dir=cache_dir, local_files_only=True)
        except ValueError:
            self._dense = TextEmbedding(DENSE_MODEL, cache_dir=cache_dir)
        self._bm25 = q.Bm25(q.Bm25Config())
        self._lock = threading.Lock()

    def dense(self, texts: list[str]) -> list[list[float]]:
        with self._lock:
            vecs = np.array(list(self._dense.embed(list(texts))), dtype=np.float32)
        vecs /= np.linalg.norm(vecs, axis=1, keepdims=True).clip(min=1e-12)
        return vecs.tolist()

    def bm25_doc(self, text: str) -> q.SparseVector:
        return self._bm25.embed_document(text)

    def bm25_query(self, text: str) -> q.SparseVector:
        return self._bm25.embed_query(text)


_instance: Embedder | None = None
_instance_lock = threading.Lock()


def get_embedder(cfg) -> Embedder:
    """Process-wide singleton: the ONNX model takes seconds to load and ~100 MB of RAM."""
    global _instance
    with _instance_lock:
        if _instance is None:
            _instance = Embedder(cfg.models_dir)
        return _instance
