# Quorum: working rules

Offline-first team memory on Qdrant Edge (Code Cubicle 6.0, PS3). The app lives in `app/`; its
interfaces are frozen in `app/CONTRACT.md`. Read that before touching `app/`. `docs/MVP.md` is the plan.

## Commands (run from the repo root, in PowerShell)
- Isolation first, in every shell: `. .\scripts\env.ps1`
- Deps: `. .\scripts\env.ps1; uv pip install -p app\.venv\Scripts\python.exe -r app\requirements.txt`
- Tests: `app\.venv\Scripts\python -m pytest app\tests -q`
- Hub binary: `.\scripts\fetch_hub.ps1` (Qdrant server into `app\hub\bin`, gitignored)
- Full demo: `.\scripts\demo.ps1` (reset + seed + hub + two devices on :8001 / :8002); stop with `-Stop`
- End-to-end check (right after demo.ps1): `app\.venv\Scripts\python scripts\demo_check.py` (`--until 5` to rehearse)
- Isolation guard: `.\scripts\check_isolation.ps1`

## Rules
1. **Isolation.** Every cache and model lives in this repo's main checkout
   (`X:\Projects_X\code_cubicle_6\.cache`, `\models`), never in user or machine dirs. This machine
   exports `UV_CACHE_DIR`, `PIP_CACHE_DIR` and `HF_HOME` globally (pointing at another project's
   caches), and **env vars beat `uv.toml`**, so always dot-source `scripts\env.ps1` before
   uv/pip/npm. Python code sets its own model paths (`app/edge/__init__.py`), so it is safe
   from any shell. Never `pip install` into the system Python, never `ollama pull`
   (use the installed `llama3.2`), never install Playwright browsers outside `.cache\ms-playwright`.
2. **Git.** Work happens on branch `worktree-mvp` in `.claude/worktrees/mvp`. Small commits after
   verified changes. Subagents running in parallel do **not** commit; the orchestrator does.
3. **Qdrant Edge API is beta.** Use only the methods verified in `app/CONTRACT.md` ("Verified
   API"). Introspect (`dir()`, `__text_signature__`) before using anything else; never guess.
4. **Processes.** Anything you start (hub, devices, http servers) you stop before you finish.
   Check ports with `Get-NetTCPConnection -LocalPort <p>`. Windows holds file locks on open
   shards, so stop a device before deleting its data.
5. **Pitch rules.** Never call it "Jarvis". Never mention ADHD.
