import { createStore } from "/js/AlpineStore.js";
import { scrollModal } from "/js/modals.js";
import sleep from "/js/sleep.js";
import * as API from "/js/api.js";

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
  },

  _resolveConfigKey(name, cfg) {
    // Prefer exact match, otherwise try hyphenated variant
    if (cfg && Object.prototype.hasOwnProperty.call(cfg, name)) return name;
    const hyph = name.replace(/_/g, "-");
    if (cfg && Object.prototype.hasOwnProperty.call(cfg, hyph)) return hyph;
    return name; // fallback
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
      // Merge disabled flag from backend; if missing, fall back to editor config
      let cfg = {};
      try { cfg = JSON.parse(this.getEditorValue() || "{}"); } catch (_) {}
      this.servers = (resp.status || []).map((s) => {
        const key = this._resolveConfigKey(s.name, cfg);
        const disabledFromCfg = !!(cfg && cfg[key] && cfg[key].disabled);
        return { ...s, disabled: (typeof s.disabled === 'boolean') ? s.disabled : disabledFromCfg };
      }).sort((a, b) => a.name.localeCompare(b.name));
    }
  },

  async toggleServerEnabled(name, enabled) {
    try {
      let cfg = {};
      try { cfg = JSON.parse(this.getEditorValue() || "{}"); } catch (_) { cfg = {}; }
      const key = this._resolveConfigKey(name, cfg);
      if (!cfg[key] || typeof cfg[key] !== 'object') {
        alert("Cannot find this MCP in the configuration JSON. Please ensure it exists.");
        return;
      }
      cfg[key].disabled = !enabled; // inside existing block

      const formatted = JSON.stringify(cfg, null, 2);
      this.editor.setValue(formatted);
      this.editor.clearSelection();

      const resp = await API.callJsonApi("mcp_servers_apply", { mcp_servers: formatted });
      if (resp.success) {
        // refresh status; backend should now include updated disabled state
        this.servers = resp.status.sort((a, b) => a.name.localeCompare(b.name));
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
      if (resp.success) {
        this.servers = resp.status;
        this.servers.sort((a, b) => a.name.localeCompare(b.name));
      }
      this.loading = false;
      await sleep(100);
      scrollModal("mcp-servers-status");
    } catch (error) { console.error("Failed to apply MCP servers:", error); }
    this.loading = false;
  },

  async getServerLog(serverName) {
    this.serverLog = "";
    const resp = await API.callJsonApi("mcp_server_get_log", { server_name: serverName });
    if (resp.success) { this.serverLog = resp.log; openModal("settings/mcp/client/mcp-servers-log.html"); }
  },

  async onToolCountClick(serverName) {
    const resp = await API.callJsonApi("mcp_server_get_detail", { server_name: serverName });
    if (resp.success) { this.serverDetail = resp.detail; openModal("settings/mcp/client/mcp-server-tools.html"); }
  },
};

const store = createStore("mcpServersStore", model);
export { store };
