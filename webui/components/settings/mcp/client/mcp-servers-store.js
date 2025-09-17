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
    this.statusCheck = true;
    let firstLoad = true;
    while (this.statusCheck) {
      await this._statusCheck();
      if (firstLoad) { this.loading = false; firstLoad = false; }
      await sleep(3000);
    }
  },

  async _statusCheck() {
    const resp = await API.callJsonApi("mcp_servers_status", null);
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

      const resp = await API.callJsonApi("mcp_servers_apply", { mcp_servers: formatted });
      if (resp.success && Array.isArray(resp.status)) {
        // refresh status list; prefer backend disabled but fall back to config
        const serversMap = cfg.mcpServers || {};
        this.servers = resp.status.map((s) => {
          const resolved = this._resolveServerKey(s.name, serversMap);
          const disabledFromCfg = resolved ? !!(serversMap[resolved] && serversMap[resolved].disabled) : false;
          return { ...s, disabled: (typeof s.disabled === "boolean") ? s.disabled : disabledFromCfg };
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      console.error("Failed to toggle server:", error);
      alert("Failed to toggle server: " + (error?.message || error));
    }
  },

  async stopStatusCheck() { this.statusCheck = false; },

  async applyNow() {
    if (this.loading) return;
    this.loading = true;
    try {
      scrollModal("mcp-servers-status");
      const resp = await API.callJsonApi("mcp_servers_apply", { mcp_servers: this.getEditorValue() });
      if (resp.success && Array.isArray(resp.status)) {
        const cfg = JSON.parse(this.getEditorValue() || "{}");
        const serversMap = (cfg && cfg.mcpServers) || {};
        this.servers = resp.status.map((s) => {
          const key = this._resolveServerKey(s.name, serversMap);
          const disabledFromCfg = key ? !!(serversMap[key] && serversMap[key].disabled) : false;
          return { ...s, disabled: (typeof s.disabled === "boolean") ? s.disabled : disabledFromCfg };
        }).sort((a, b) => a.name.localeCompare(b.name));
      }
      this.loading = false;
      await sleep(100);
      scrollModal("mcp-servers-status");
    } catch (error) { console.error("Failed to apply MCP servers:", error); }
    this.loading = false;
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
