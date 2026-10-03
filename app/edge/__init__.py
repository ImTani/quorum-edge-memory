"""Quorum device node: one Qdrant Edge shard per device, synced through a hub.

Isolation happens here, before anything imports fastembed or huggingface_hub: this machine exports
HF_HOME globally (pointing at another project's cache), so we overwrite it rather than default it.
"""
import os
from pathlib import Path

QUORUM_ROOT = Path(os.environ.get("QUORUM_ROOT") or r"X:\Projects_X\code_cubicle_6")
MODELS_DIR = QUORUM_ROOT / "models"

os.environ["HF_HOME"] = str(MODELS_DIR / "hf")
os.environ["FASTEMBED_CACHE_PATH"] = str(MODELS_DIR / "fastembed")
