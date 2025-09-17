import { createStore } from "/js/AlpineStore.js";
import { scrollModal } from "/js/modals.js";
import sleep from "/js/sleep.js";
import * as API from "/js/api.js";

const normalizeName = (name) => (name || "").toLowerCase().replace(/[\-_]/g, "");
const normalizeLoose = (name) => normalizeName(name).replace(/(mcp|server)/g, "");

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
    // Loose compare ignoring tokens
    const loose = normalizeLoose(serverName);
    let found = null;
    for (const key of Object.keys(serversMap)) {
      if (normalizeLoose(key) === loose) { found = key; break; }
    }
    return found;
  },

  _approxMcpServersInsertionLine(rawJson) {
    try {
      const idx = rawJson.indexOf('"mcpServers"');
      if (idx === -1) return null;
      const head = rawJson.slice(0, idx);
      const line = (head.match(/\n/g) || []).length + 1;
      return line;
    } catch { return null; }
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
    if (this.applyTimer) clearTimeout(this.applyTimer);
    this.applyTimer = setTimeout(() => {
      this.applyTimer = null;
      this.applyNow();
    }, delayMs);
  },

  _parseEditorJsonStrict() {
    try {
      const cfg = JSON.parse(this.getEditorValue() || "{}");
      return { cfg };
    } catch (e) {
      console.error("Invalid MCP JSON, refusing to modify:", e);
      alert("MCP JSON is invalid. Please fix or click Reformat before toggling.\n" + e.message);
      return { error: e };
    }
  },

  async toggleServerEnabled(name, enabled) {
    try {
      const parsed = this._parseEditorJsonStrict();
      if (parsed.error) return; // do not mutate editor on invalid JSON
      const cfg = parsed.cfg;

      if (!cfg.mcpServers || typeof cfg.mcpServers !== "object") cfg.mcpServers = {};

      let key = this._resolveServerKey(name, cfg.mcpServers);
      if (!key) {
        // Suggest closest existing key
        const keys = Object.keys(cfg.mcpServers || {});
        const nLoose = normalizeLoose(name);
        const close = keys.find(k => normalizeLoose(k) === nLoose);
        const suggested = close || name.replace(/_/g, "-");
        const line = this._approxMcpServersInsertionLine(this.getEditorValue() || "");
        const want = !enabled;
        const ok = confirm(
          `Entry for "${name}" not found in mcpServers.\n\n` +
          `Add minimal block now as "${suggested}" with { \"disabled\": ${want} }?`
        );
        if (ok) {
          // Only add/merge the single suggested key; keep others intact
          cfg.mcpServers[suggested] = Object.assign({}, cfg.mcpServers[suggested] || {}, { disabled: want });
          key = suggested;
        } else {
          const hint = line ? ` near line ${line}` : " inside the mcpServers object";
          alert(
            `Add the following under mcpServers${hint}:\n\n` +
            `"${suggested}": { "disabled": ${want} }`
          );
          return;
        }
      }

      if (!cfg.mcpServers[key] || typeof cfg.mcpServers[key] !== "object") {
        cfg.mcpServers[key] = {};
      }

      cfg.mcpServers[key].disabled = !enabled; // set inside existing server block only

      const formatted = JSON.stringify(cfg, null, 2);
      this.editor.setValue(formatted);
      this.editor.clearSelection();

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
    if (this.applyTimer) { clearTimeout(this.applyTimer); this.applyTimer = null; }

    // Validate JSON before sending
    const parsed = this._parseEditorJsonStrict();
    if (parsed.error) return;

    this.applyInProgress = true;
    const prevLoading = this.loading;
    this.loading = true;
    const prevStatusCheck = this.statusCheck;
    this.statusCheck = false;
    await this._waitForStatusIdle();

    try {
      scrollModal("mcp-servers-status");
      const payload = { mcp_servers: JSON.stringify(parsed.cfg) };
      const resp = await API.callJsonApi("mcp_servers_apply", payload);
      if (resp.success && Array.isArray(resp.status)) {
        const serversMap = (parsed.cfg && parsed.cfg.mcpServers) || {};
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
      this.loading = prevLoading && false ? prevLoading : false;
      if (prevStatusCheck) this.startStatusCheck(); else this.statusCheck = false;
    }

    if (this.applyQueued) { this.applyQueued = false; await this.applyNow(); }
  },

  async getServerLog(serverName) {
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
