"""Run one device:  python -m edge --device tanishk --port 8001"""
import argparse
import threading

import uvicorn

from edge import extract
from edge.api import create_app
from edge.config import APP_DIR, LOOKS, Config


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m edge", description="Run one Quorum device node.")
    parser.add_argument("--device", required=True, help="device name, e.g. tanishk or lakshya")
    parser.add_argument("--port", type=int, required=True)
    parser.add_argument("--hub", default="http://127.0.0.1:6333", help="team hub (Qdrant server) URL")
    parser.add_argument("--data", default=str(APP_DIR / "data"), help="parent dir of per-device data")
    parser.add_argument("--look", default="classic", choices=LOOKS,
                        help="UI look served to the pages (classic = as built; ?look=<name> overrides per page)")
    args = parser.parse_args()

    cfg = Config(device=args.device, port=args.port, hub_url=args.hub, data_dir=args.data, look=args.look)
    # A cold llama3.2 load takes longer than the extractor's 6 s budget; load it before the first ingest.
    threading.Thread(target=extract.warm_up, args=(cfg,), name="ollama-warm-up", daemon=True).start()
    # A short graceful timeout: open SSE streams would otherwise hold shutdown (and the shard lock).
    uvicorn.run(create_app(cfg), host="127.0.0.1", port=cfg.port, timeout_graceful_shutdown=2)


if __name__ == "__main__":
    main()
