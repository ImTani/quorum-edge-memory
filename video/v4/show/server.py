"""Quorum stage show: serves the live presentation and the phone remote, and holds the one shared
position (step, blank, mute, captions) that the projector page and every phone follow.

Run from the repo root:  app\\.venv\\Scripts\\python video\\v4\\show\\server.py   (or scripts\\show.ps1)
  projector page  http://127.0.0.1:9000/v4/show.html
  phone remote    http://<laptop LAN ip>:9000/remote
Only video/v4 and site/ are served; nothing else in the repo is reachable.
"""
import asyncio
import io
import json
import socket
import sys
import time
from pathlib import Path

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, RedirectResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

HERE = Path(__file__).resolve().parent
V4 = HERE.parent
ROOT = V4.parent.parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9000

app = FastAPI()


class Revalidate:
    """The kiosk Chrome keeps its profile between runs: make it re-check every page and script (a cheap
    304 when unchanged) so an updated show is never served stale. Frames and audio can cache. Plain ASGI,
    headers only, so the event stream passes through untouched."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        path = scope.get("path", "")
        if scope["type"] != "http" or path.startswith("/v4/clips/") or path.endswith(".wav"):
            return await self.app(scope, receive, send)

        async def send_wrapped(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() != b"cache-control"]
                message = {**message, "headers": headers + [(b"cache-control", b"no-cache")]}
            await send(message)

        await self.app(scope, receive, send_wrapped)


app.add_middleware(Revalidate)
state = {"step": 0, "count": 1, "blank": False, "mute": False, "captions": False,
         "timer_start": None, "deck": None, "rev": 0, "steps": []}
listeners: set[asyncio.Queue] = set()
phones: set[asyncio.Queue] = set()          # listeners that are phone remotes (/api/events?who=remote)

HUB = "http://127.0.0.1:6333"
DEVICES = {"tanishk": "http://127.0.0.1:8001", "lakshya": "http://127.0.0.1:8002"}
OLLAMA = "http://127.0.0.1:11434"
SEED_HUB_POINTS = 18                        # what scripts/demo.ps1 seeds the hub with


def public() -> dict:
    return {k: v for k, v in state.items() if k != "steps"}


async def broadcast() -> None:
    state["rev"] += 1
    msg = json.dumps(public())
    for q in list(listeners):
        q.put_nowait(msg)


@app.post("/api/steps")
async def set_steps(req: Request):
    """The projector page registers its step list (titles and notes) on load."""
    body = await req.json()
    state["steps"] = body.get("steps", [])
    state["count"] = max(1, len(state["steps"]))
    state["step"] = min(state["step"], state["count"] - 1)
    await broadcast()
    return public()


@app.get("/api/steps")
async def get_steps():
    return {"steps": state["steps"], **public()}


def step_from(i: int, d: int) -> int:
    """Next/Back skip backup steps (skip: true); those are reached only by jumping to them."""
    steps, j = state["steps"], i + d
    while 0 <= j < len(steps) and steps[j].get("skip"):
        j += d
    return i if not 0 <= j < state["count"] else j


@app.post("/api/cmd")
async def cmd(req: Request):
    body = await req.json()
    c = body.get("cmd")
    if c == "next":
        state["step"] = step_from(state["step"], +1)
        if state["timer_start"] is None:
            state["timer_start"] = time.time()
    elif c == "back":
        state["step"] = step_from(state["step"], -1)
    elif c == "goto":
        state["step"] = max(0, min(int(body.get("step", 0)), state["count"] - 1))
    elif c in ("blank", "mute", "captions"):
        state[c] = not state[c] if "value" not in body else bool(body["value"])
    elif c == "deck":
        # Q&A: the deck over the show at a slide (1-based), or None to go back to the show
        slide = body.get("slide")
        state["deck"] = None if slide is None else max(1, min(int(slide), 99))
    elif c == "deck_step":
        if state["deck"] is not None:
            state["deck"] = max(1, state["deck"] + int(body.get("delta", 1)))
    elif c == "timer_reset":
        state["timer_start"] = None
    elif c == "timer_start":
        state["timer_start"] = time.time()
    await broadcast()
    return public()


@app.get("/api/events")
async def events(req: Request, who: str = ""):
    q: asyncio.Queue = asyncio.Queue()
    listeners.add(q)
    if who == "remote":
        phones.add(q)

    async def gen():
        try:
            yield f"data: {json.dumps(public())}\n\n"
            while True:
                if await req.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(q.get(), timeout=10)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            listeners.discard(q)
            phones.discard(q)

    return StreamingResponse(gen(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/preflight")
async def preflight():
    """Before walking on: is the live demo up, connected and freshly reset; is the model warm; is a phone
    connected. Each check is {name, ok: true | false | "warn", detail}."""
    import httpx

    async def get(client, url):
        try:
            r = await client.get(url, timeout=1.5)
            return r.json() if r.status_code == 200 else None
        except (httpx.HTTPError, ValueError):
            return None

    async with httpx.AsyncClient() as c:
        hub, tan, lak, oll = await asyncio.gather(get(c, f"{HUB}/collections/quorum_team"), get(c, f"{DEVICES['tanishk']}/api/state"),
                                                  get(c, f"{DEVICES['lakshya']}/api/state"), get(c, f"{OLLAMA}/api/ps"))
    checks = []
    points = hub and hub.get("result", {}).get("points_count")
    checks.append({"name": "Team hub", "ok": hub is not None, "detail": f"{points} claims" if hub else "not reachable: run scripts/show.ps1"})
    for name, st in (("Tanishk's laptop", tan), ("Lakshya's laptop", lak)):
        if st is None:
            checks.append({"name": name, "ok": False, "detail": "not running"})
        else:
            sync = st.get("sync") or {}
            good = sync.get("online") and sync.get("hub_ok")
            checks.append({"name": name, "ok": bool(good), "detail": "connected to the hub" if good else "not connected to the hub (switch on?)"})
    if hub and tan and lak:
        fresh = (points == SEED_HUB_POINTS and not tan.get("conflicts") and not lak.get("conflicts")
                 and not (tan.get("sync") or {}).get("outbox"))
        checks.append({"name": "Demo reset", "ok": True if fresh else False,
                       "detail": "fresh, ready for the live beats" if fresh else "already played: re-run scripts/show.ps1 to reset"})
    if oll is None:
        checks.append({"name": "Local model", "ok": "warn", "detail": "Ollama not running: the rules parser will read the note (same result)"})
    else:
        loaded = [m.get("name", "") for m in oll.get("models", [])]
        warm = any(n.startswith("llama3.2") for n in loaded)
        checks.append({"name": "Local model", "ok": True if warm else "warn",
                       "detail": "llama3.2 loaded" if warm else "Ollama up, model not loaded yet: the first note may take ~8 s"})
    checks.append({"name": "Phone remote", "ok": True if phones else "warn",
                   "detail": f"{len(phones)} connected" if phones else "no phone connected yet"})
    return {"checks": checks}


@app.get("/api/now")
async def now():
    return {"now": time.time()}


@app.get("/remote")
async def remote():
    return FileResponse(HERE / "remote.html", headers={"Cache-Control": "no-store"})


@app.get("/")
async def index():
    return RedirectResponse("/v4/show.html")


app.mount("/v4", StaticFiles(directory=V4), name="v4")
app.mount("/site", StaticFiles(directory=ROOT / "site"), name="site")   # the landing page, the Q&A deck, fonts


def primary_ip() -> str | None:
    """The address of the interface with the default route: the one a phone on the same Wi-Fi or hotspot
    can reach. (A UDP connect sends nothing; it only asks the OS which interface it would use.)"""
    for target in ("8.8.8.8", "10.255.255.255", "192.168.255.255"):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
                s.connect((target, 1))
                ip = s.getsockname()[0]
                if not ip.startswith(("127.", "0.")):
                    return ip
        except OSError:
            continue
    return None


def remote_urls() -> list[str]:
    """Phone remote URLs, the most likely one first. Recomputed on every call, so switching to a phone
    hotspot after the server started is picked up."""
    first = primary_ip()
    ips = ([first] if first else []) + [i for i in lan_ips() if i != first]
    return [f"http://{ip}:{PORT}/remote" for ip in ips]


@app.get("/api/remote")
async def remote_info():
    return {"urls": remote_urls()}


@app.get("/api/qr.svg")
async def qr_svg():
    """QR code of the first remote URL, for the phone to scan off the screen (needs segno)."""
    urls = remote_urls()
    if not urls:
        return Response(status_code=404)
    try:
        import segno
    except ImportError:
        return Response(status_code=404)
    buf = io.BytesIO()
    segno.make(urls[0], error="m").save(buf, kind="svg", scale=10, border=2, dark="#14171f", light="#ffffff", xmldecl=False)
    return Response(buf.getvalue(), media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


def lan_ips() -> list[str]:
    ips = set()
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ips.add(info[4][0])
    except OSError:
        pass
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(i for i in ips if not i.startswith("127."))


if __name__ == "__main__":
    print(f"Projector page: http://127.0.0.1:{PORT}/v4/show.html")
    for url in remote_urls():
        print(f"Phone remote:   {url}")
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="warning")
