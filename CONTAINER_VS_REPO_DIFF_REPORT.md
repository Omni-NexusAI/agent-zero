# Container vs Repo Diff Report

**Date**: 2026-01-24  
**Containers analyzed**: `A0-v098-cpu` (CPU), `A0-hybrid-new` (Hybrid main), `Kokoro-GPU-worker-new` (Kokoro worker).  
**Repo baseline**: `a0-test-clone` (development).

---

## 1. Summary

- **Repo is ahead** for most fix-related code: TTS reactivity (4-field grey-out), disabled/readonly CSS, `build_type.py`, `settings.py`, welcome screen, Kokoro worker `"success"` fix, `call_sub` **kwargs**, and `fw.msg_critical_error` / projects prompts.
- **Containers** use an older UI layout (e.g. project-selector in header, some legacy webui paths). The **only** fix-relevant gap in the repo is that the **projects dropdown is not rendered** in the main header. The project-selector component exists, and `chat-top` (which embeds it) is used elsewhere, but the main **index.html** right-panel header (time-date block) does **not** include `<x-component path="projects/project-selector.html">`. The **CPU/Hybrid** containers **do** include it there.

**Recommendation**: Add the project-selector to the main header (time-date container) in `webui/index.html`. Keep all other fix-related code from the **repo**; do not overwrite with container versions.

---

## 2. Findings by Area

### 2.1 Prompts and chat fix

| Item | Repo | Container |
|------|------|-----------|
| `agent.system.projects.main.md` | `prompts/prompts/` | `prompts/` and `prompts/prompts/` |
| `agent.system.projects.active.md` / `.inactive.md` | Present | Present |
| `fw.msg_critical_error.md` | `prompts/prompts/` | `prompts/` and `prompts/prompts/` |
| `_10_system_prompt.py` | Uses `read_prompt` for projects; same logic | Same |

**Verdict**: Repo has all required prompt files and resolution. No change.

### 2.2 Projects dropdown (header)

| Item | Repo | Container |
|------|------|-----------|
| `project-selector.html` | Exists | Exists |
| `projects-store.js` | Used by components | Also loaded via script in `index.html` |
| **Placement in main UI** | **Not** in `index.html` time-date block; `chat-top` has it but is not included in main layout | **In** `index.html` inside `#time-date-container` |

**Verdict**: **Repo is missing** the project-selector in the visible main header. Containers show it next to time-date. **Action**: Add `<x-component path="projects/project-selector.html"></x-component>` to the time-date block in `webui/index.html`.

### 2.3 TTS reactivity and settings

| Item | Repo | Container |
|------|------|-----------|
| `index.html` TTS fields | `:disabled` with `tts_kokoro` checks for the 4 remote fields; voice/speed always editable | `:readonly` only; no 4-field logic |
| `settings.css` | Disabled/readonly block; voice-select tweaks | No disabled block; older voice-select |
| `settings.py` | `readonly: False` for voice/speed | Older logic |

**Verdict**: Repo has the TTS fixes. Keep repo versions.

### 2.4 Welcome / dashboard

| Item | Repo | Container |
|------|------|-----------|
| Welcome screen | `welcome-screen.html`, `x-show` for chat-history / input | Same |
| Chat layout | Conditional show/hide | Same |

**Verdict**: Aligned. No change.

### 2.5 Kokoro worker

| Item | Repo | Container |
|------|------|-----------|
| `kokoro_gpu_worker.py` | Newer: `"success": True` in `/health` and `/synthesize`, device_utils, etc. | Older: no `success`; different structure |

**Verdict**: Repo has the fix. Keep repo version.

### 2.6 Build type and backend

| Item | Repo | Container |
|------|------|-----------|
| `build_type.py` | CPU remote TTS, visibility, descriptions | Same or older |
| `settings.py` | Voice/speed always editable | Same or older |
| `call_sub` / `agent.system.tool.call_sub.py` | `**kwargs` in `get_variables` | No `**kwargs` |

**Verdict**: Repo is ahead. Keep repo versions.

### 2.7 Other webui

Container has legacy layout (e.g. `file_browser`, `history.css`, `modals2`, nested `webui/webui`). Repo has refactored components (context, history, image-viewer, notifications, etc.). **Use repo** throughout.

---

## 3. Actions Taken

1. **Project-selector in header**: Add `<x-component path="projects/project-selector.html"></x-component>` to the `#time-date-container` block in `webui/index.html` (and optionally ensure `projects-store` is loaded if needed; it is already imported by other components).
2. **No overwrites** from container for: `settings.css`, `index.html` (except the project-selector addition), `build_type.py`, `settings.py`, `kokoro_gpu_worker.py`, prompts, or `call_sub`.

---

## 4. Files Differing (Reference)

- **CPU vs repo**: Many webui layout/structure differences; repo ahead. Python: mostly `__pycache__`; `build_type`/`settings` match or repo ahead. Prompts: layout differs; content covered above.
- **Hybrid vs repo**: Same direction. `build_type.py` and `settings.py` in repo have the new logic; container matches or lags.
- **Kokoro worker vs repo**: Worker container has older `kokoro_gpu_worker.py`; repo has success fix and updates.

---

**End of report.**
