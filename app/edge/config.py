"""Per-device configuration."""
import os
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path

from edge import MODELS_DIR

APP_DIR = Path(__file__).resolve().parents[1]
WEB_DIR = APP_DIR / "web"
FIXTURES_DIR = APP_DIR / "fixtures"

DISPLAY_NAMES = {"tanishk": "Tanishk · on set", "lakshya": "Lakshya · office"}
PEERS = {"tanishk": "http://127.0.0.1:8001", "lakshya": "http://127.0.0.1:8002"}
# UI looks. "classic" is the page exactly as built; any other look is opt-in (app/web/looks/<name>.css).
LOOKS = ("classic", "studio")


def _default_today() -> date:
    return date.fromisoformat(os.environ.get("QUORUM_TODAY") or "2026-10-03")


def first_name(device: str) -> str:
    """'tanishk' -> 'Tanishk' (display names carry a role suffix that reads badly mid-sentence)."""
    return DISPLAY_NAMES.get(device, device).split(" · ")[0].capitalize()


@dataclass
class Config:
    device: str
    display_name: str = ""
    port: int = 8001
    hub_url: str = "http://127.0.0.1:6333"
    data_dir: Path = APP_DIR / "data"
    models_dir: Path = MODELS_DIR
    today: date = field(default_factory=_default_today)
    conflict_threshold: float = 0.82
    ollama_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"
    hub_collection: str = "quorum_team"
    look: str = "classic"

    def __post_init__(self):
        self.data_dir = Path(self.data_dir)
        self.models_dir = Path(self.models_dir)
        if not self.display_name:
            self.display_name = DISPLAY_NAMES.get(self.device, self.device)

    @property
    def device_dir(self) -> Path:
        return self.data_dir / self.device

    @property
    def device_id(self) -> str:
        return f"dev_{self.device}"
