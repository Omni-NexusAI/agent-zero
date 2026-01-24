# v0.9.8 Hybrid Recovered vs Development — Version Diff

**Bake branch**: `bake/v0.9.8-hybrid-recovered`  
**Baseline**: `origin/development`  
**Tag baked**: `v0.9.8-custom-pre-hybrid-gpu` (points to bake)

---

## Summary

The recovered hybrid (from extract) adds **9 file changes** vs development:

| Change | Description |
|--------|-------------|
| **prompts/agent.system.projects.active.md** | New — active project template (path, title, instructions) |
| **prompts/agent.system.projects.inactive.md** | New — "no project currently activated" |
| **prompts/agent.system.projects.main.md** | New — projects overview for system prompt |
| **prompts/agent.system.tool.call_sub.py** | Add `**kwargs` to `get_variables` |
| **prompts/agent.system.tools.py** | Add `**kwargs` to `get_variables` |
| **prompts/fw.msg_critical_error.md** | New — error message template |
| **prompts/fw.wait_complete.md** | New — wait-complete message template |
| **webui/index.html** | Add `<x-component path="projects/project-selector.html">` in header |
| **webui/index.js** | Add `import { store as projectsStore } from ".../projects-store.js"` |

---

## Rationale

- **Projects prompts**: Fix `FileNotFoundError` for `agent.system.projects.*` and support project-aware system prompt.
- **fw.msg_critical_error / fw.wait_complete**: Required prompt templates; avoid runtime `FileNotFoundError`.
- **`**kwargs` in call_sub / tools**: Prevents `get_variables() got an unexpected keyword argument '_agent'` (or similar).
- **Project selector + projectsStore**: Restore projects dropdown in main header; ensure store is loaded.

---

## Images

- **Main**: `ghcr.io/omni-nexusai/agent-zero:v0.9.8-custom-pre-hybrid-gpu` (built from tag → bake)
- **Worker**: `ghcr.io/omni-nexusai/agent-zero-kokoro-worker:v0.9.8-custom-pre-hybrid-gpu` (built from recovered `python`)

---

*Generated after baking recovered hybrid and before merging to development.*
