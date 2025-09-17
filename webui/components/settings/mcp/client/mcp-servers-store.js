import { createStore } from "/js/AlpineStore.js";
import { scrollModal } from "/js/modals.js";
import sleep from "/js/sleep.js";
import * as API from "/js/api.js";

const normalizeName = (name) => (name || "").toLowerCase().replace(/[\-_]/g, "");

const model = {
  editor: null,
  servers: [],
  loading: true,
  statusCheck: false,
  statusInProgress: false,
  statusReqId: 0,
  applyInProgress: false,
  applyQueued: false,
  applyTimer: null,
  serverLog: "",

  async initialize() {
    const container = document.getElementById("mcp-servers-config-json");
    if (container) {
      const editor = ace.edit("mcp-servers-config-json");
      const dark = localStorage.getItem("darkMode");
      editor.setTheme(dark != "false" ? "ace/theme/github_dark" : "ace/theme/tomorrow");
      editor.session.setMode("ace/mode/json");
      const json = this.getSettingsFieldConfigJson().value;
      editor.setValue(json);
      editor.clearSelection();
      this.editor = editor;
    }
    this.startStatusCheck();
  },

  formatJson() {
    try {
      const parsed = JSON.parse(this.editor.getValue());
      const formatted = JSON.stringify(parsed, null, 2);
      this.editor.setValue(formatted);
      this.editor.clearSelection();
      this.editor.navigateFileStart();
    } catch (error) {
      console.error("Failed to format JSON:", error);
      alert("Invalid JSON: " + error.message);
    }
  },

  getEditorValue() { return this.editor.getValue(); },

  getSettingsFieldConfigJson() {
    return settingsModalProxy.settings.sections
      .filter((x) => x.id == "mcp_client")[0]
      .fields.filter((x) => x.id == "mcp_servers")[0];
  },

  onClose() {
    const val = this.getEditorValue();
    this.getSettingsFieldConfigJson().value = val;
    this.stopStatusCheck();
    this.serverLog = ""; // avoid stale modal state on reopen
  },

  _resolveServerKey(serverName, serversMap) {
    if (!serversMap || typeof serversMap !== "object") return null;
    const direct = [serverName, serverName.replace(/_/g, "-"), serverName.replace(/-/g, "_")];
    for (const cand of direct) {
      if (Object.prototype.hasOwnProperty.call(serversMap, cand)) return cand;
    }
    const target = normalizeName(serverName);
    for (const key of Object.keys(serversMap)) {
      if (normalizeName(key) === target) return key;
    }
    return null;
  },

  async startStatusCheck() {
    if (this.statusCheck) return;
    this.statusCheck = true;
    let firstLoad = true;
    while (this.statusCheck) {
      if (!this.applyInProgress) {
        await this._statusCheck();
        if (firstLoad) { this.loading = false; firstLoad = false; }
      } else {
        // Apply has priority; pause polling briefly
        await sleep(200);
      }
      await sleep(3000);
    }
  },

  async _statusCheck() {
    this.statusInProgress = true;
    const reqId = ++this.statusReqId;
    try {
      const resp = await API.callJsonApi("mcp_servers_status", null);
      // Ignore out-of-order responses
      if (reqId !== this.statusReqId) return;
      if (resp.success) {
        let cfg = {};
        try { cfg = JSON.parse(this.getEditorValue() || "{}"); } catch (_) {}
        const serversMap = (cfg && cfg.mcpServers) || {};

        this.servers = (resp.status || []).map((s) => {
          const key = this._resolveServerKey(s.name, serversMap);
          const disabledFromCfg = key ? !!(serversMap[key] && serversMap[key].disabled) : false;
          return { ...s, disabled: (typeof s.disabled === "boolean") ? s.disabled : disabledFromCfg };
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (e) {
      console.error("Status check failed:", e);
    } finally {
      this.statusInProgress = false;
    }
  },

  scheduleApply(delayMs = 300) {
    // Debounce repeated toggles
    if (this.applyTimer) clearTimeout(this.applyTimer);
    this.applyTimer = setTimeout(() => {
      this.applyTimer = null;
      this.applyNow();
    }, delayMs);
  },

  async toggleServerEnabled(name, enabled) {
    try {
      let cfg = {};
      try { cfg = JSON.parse(this.getEditorValue() || "{}"); } catch (_) { cfg = {}; }
      if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") cfg.mcpServers = {};

      const key = this._resolveServerKey(name, cfg.mcpServers);
      if (!key) {
        alert("Cannot find this MCP in the configuration JSON. Please ensure it exists.");
        return;
      }

      if (!cfg.mcpServers[key] || typeof cfg.mcpServers[key] !== "object") {
        cfg.mcpServers[key] = {};
      }

      cfg.mcpServers[key].disabled = !enabled; // set inside existing server block only

      const formatted = JSON.stringify(cfg, null, 2);
      this.editor.setValue(formatted);
      this.editor.clearSelection();

      // Do NOT apply immediately; debounce to avoid races with polling
      this.scheduleApply(350);
    } catch (error) {
      console.error("Failed to toggle server:", error);
      alert("Failed to toggle server: " + (error?.message || error));
    }
  },

  async stopStatusCheck() { this.statusCheck = false; },

  async _waitForStatusIdle(timeoutMs = 4000) {
    const start = Date.now();
    while (this.statusInProgress) {
      if (Date.now() - start > timeoutMs) break;
      await sleep(50);
    }
  },

  async applyNow() {
    if (this.applyInProgress) { this.applyQueued = true; return; }
    // Cancel pending debounce timer if present
    if (this.applyTimer) { clearTimeout(this.applyTimer); this.applyTimer = null; }

    this.applyInProgress = true;
    // Show busy and pause polling
    const prevLoading = this.loading;
    this.loading = true;
    const prevStatusCheck = this.statusCheck;
    this.statusCheck = false;
    await this._waitForStatusIdle();

    try {
      scrollModal("mcp-servers-status");
      const payload = { mcp_servers: this.getEditorValue() };
      const resp = await API.callJsonApi("mcp_servers_apply", payload);
      if (resp.success && Array.isArray(resp.status)) {
        // Immediately refresh view with returned status
        let cfg = {};
        try { cfg = JSON.parse(this.getEditorValue() || "{}"); } catch (_) {}
        const serversMap = (cfg && cfg.mcpServers) || {};
        this.servers = resp.status.map((s) => {
          const key = this._resolveServerKey(s.name, serversMap);
          const disabledFromCfg = key ? !!(serversMap[key] && serversMap[key].disabled) : false;
          return { ...s, disabled: (typeof s.disabled === "boolean") ? s.disabled : disabledFromCfg };
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
      await sleep(100);
      scrollModal("mcp-servers-status");
    } catch (error) {
      console.error("Failed to apply MCP servers:", error);
      alert("Failed to apply MCP servers: " + (error?.message || error));
    } finally {
      this.applyInProgress = false;
      // Resume polling and ensure UI unblocks
      this.loading = prevLoading && false ? prevLoading : false;
      if (prevStatusCheck) this.startStatusCheck(); else this.statusCheck = false;
    }

    // If more changes queued during apply, run once more
    if (this.applyQueued) { this.applyQueued = false; await this.applyNow(); }
  },

  async getServerLog(serverName) {
    // Show modal immediately with a loading state, then update content
    this.serverLog = "Loading…";
    openModal("settings/mcp/client/mcp-servers-log.html");
    try {
      const resp = await API.callJsonApi("mcp_server_get_log", { server_name: serverName });
      if (resp.success) {
        this.serverLog = resp.log && resp.log.trim() ? resp.log : "Log empty";
      } else {
        this.serverLog = "Failed to load log.";
      }
    } catch (e) {
      this.serverLog = "Failed to load log: " + (e?.message || e);
    }
  },

  async onToolCountClick(serverName) {
    const resp = await API.callJsonApi("mcp_server_get_detail", { server_name: serverName });
    if (resp.success) { this.serverDetail = resp.detail; openModal("settings/mcp/client/mcp-server-tools.html"); }
  },
};

const store = createStore("mcpServersStore", model);
export { store };
