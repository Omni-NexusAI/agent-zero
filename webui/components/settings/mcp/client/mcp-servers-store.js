import { createStore } from "/js/AlpineStore.js";
import { scrollModal } from "/js/modals.js";
import sleep from "/js/sleep.js";
import * as API from "/js/api.js";

const BATCH_DELAY_MS = 500;

function normalizeName(value) {
  return (value || "")
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_");
}

function toggleDisabledFlag(serverConfig) {
  if (!serverConfig || typeof serverConfig !== "object") return false;
  serverConfig.disabled = !Boolean(serverConfig.disabled);
  return true;
}

function applyToggleToConfig(config, targetName) {
  if (!config) return false;

  const matchInObject = (collection) => {
    if (!collection) return false;
    for (const [key, value] of Object.entries(collection)) {
      if (normalizeName(key) === targetName) {
        return toggleDisabledFlag(value);
      }
      if (value && typeof value === "object" && normalizeName(value.name) === targetName) {
        return toggleDisabledFlag(value);
      }
    }
    return false;
  };

  if (Array.isArray(config)) {
    for (const item of config) {
      if (item && typeof item === "object" && normalizeName(item.name) === targetName) {
        return toggleDisabledFlag(item);
      }
    }
    return false;
  }

  if (typeof config === "object") {
    if (config.mcpServers && matchInObject(config.mcpServers)) return true;
    if (config.servers && matchInObject(config.servers)) return true;
    if (matchInObject(config)) return true;
  }

  return false;
}

const model = {
  editor: null,
  servers: [],
  loading: true,
  statusCheck: false,
  serverLog: "",
  batchTimer: null,
  pendingConfig: null,
  pendingToggles: new Set(),
  applyInFlight: false,
  statusTimer: null,

  async initialize() {
    const container = document.getElementById("mcp-servers-config-json");
    if (container) {
      const editor = ace.edit("mcp-servers-config-json");
      const dark = localStorage.getItem("darkMode");
      editor.setTheme(dark !== "false" ? "ace/theme/github_dark" : "ace/theme/tomorrow");
      editor.session.setMode("ace/mode/json");
      editor.setValue(this.getSettingsField().value);
      editor.clearSelection();
      this.editor = editor;
    }
    this.startStatusCheck();
  },

  getSettingsField() {
    return settingsModalProxy.settings.sections
      .find((section) => section.id === "mcp_client")
      .fields.find((field) => field.id === "mcp_servers");
  },

  getEditorValue() {
    return this.editor ? this.editor.getValue() : this.getSettingsField().value;
  },

  setEditorValue(value) {
    if (this.editor) {
      this.editor.setValue(value);
      this.editor.clearSelection();
    }
    this.getSettingsField().value = value;
  },

  formatJson() {
    try {
      const content = this.getEditorValue();
      const parsed = JSON.parse(content);
      this.setEditorValue(JSON.stringify(parsed, null, 2));
      if (this.editor) this.editor.navigateFileStart();
    } catch (error) {
      console.error("Failed to format JSON:", error);
      alert("Invalid JSON: " + error.message);
    }
  },

  onClose() {
    this.getSettingsField().value = this.getEditorValue();
    this.stopStatusCheck();
  },

  async startStatusCheck() {
    this.statusCheck = true;
    let firstPass = true;

    while (this.statusCheck) {
      await this.refreshStatus();
      if (firstPass) {
        this.loading = false;
        firstPass = false;
      }
      await sleep(3000);
    }
  },

  async refreshStatus() {
    try {
      const resp = await API.callJsonApi("mcp_servers_status", null);
      if (resp.success) {
        this.servers = resp.status;
        this.servers.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      console.error("Failed to refresh MCP server status:", error);
    }
  },

  stopStatusCheck() {
    this.statusCheck = false;
  },

  async toggleServer(name) {
    const normalizedName = normalizeName(name);

    try {
      const currentValue = this.getEditorValue();
      const parsed = currentValue ? JSON.parse(currentValue) : {};

      if (!applyToggleToConfig(parsed, normalizedName)) {
        console.error(`Server ${name} not found in configuration`);
        return;
      }

      const formatted = JSON.stringify(parsed, null, 2);
      this.setEditorValue(formatted);
      this.pendingConfig = formatted;
      this.pendingToggles.add(normalizedName);

      if (this.batchTimer) {
        clearTimeout(this.batchTimer);
      }
      this.batchTimer = setTimeout(() => this.flushPending(), BATCH_DELAY_MS);
    } catch (error) {
      console.error("Failed to toggle server:", error);
      alert("Failed to toggle server: " + error.message);
    }
  },

  async flushPending() {
    if (!this.pendingConfig) return;

    const configToApply = this.pendingConfig;
    const toggles = Array.from(this.pendingToggles);

    this.pendingConfig = null;
    this.pendingToggles.clear();
    this.batchTimer = null;

    await this.applyConfig(configToApply, toggles);
  },

  async applyConfig(config, toggledServers = []) {
    if (!config) return;

    this.applyInFlight = true;
    this.loading = true;
    this.stopStatusCheck();
    scrollModal("mcp-servers-status");

    try {
      let response = null;
      if (toggledServers.length === 1) {
        response = await API.callJsonApi("mcp_servers_toggle", {
          mcp_servers: config,
          server_name: toggledServers[0],
        });
      } else {
        response = await API.callJsonApi("mcp_servers_apply", {
          mcp_servers: config,
        });
      }

      if (response && response.success) {
        this.servers = response.status;
        this.servers.sort((a, b) => a.name.localeCompare(b.name));
      }
    } catch (error) {
      console.error("Failed to apply MCP servers:", error);
      alert("Failed to apply MCP servers: " + error.message);
    } finally {
      this.applyInFlight = false;
      this.loading = false;
      await sleep(150);
      scrollModal("mcp-servers-status");
      this.scheduleStatusRestart();
    }
  },

  scheduleStatusRestart() {
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
    }
    this.statusTimer = setTimeout(() => this.startStatusCheck(), 2000);
  },

  async applyNow() {
    if (this.applyInFlight || this.loading) return;

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const config = this.pendingConfig || this.getEditorValue();
    const toggles = Array.from(this.pendingToggles);
    this.pendingConfig = null;
    this.pendingToggles.clear();

    await this.applyConfig(config, toggles);
  },

  async getServerLog(serverName) {
    this.serverLog = "";
    const resp = await API.callJsonApi("mcp_server_get_log", {
      server_name: serverName,
    });
    if (resp.success) {
      this.serverLog = resp.log;
      openModal("settings/mcp/client/mcp-servers-log.html");
    }
  },

  async onToolCountClick(serverName) {
    const resp = await API.callJsonApi("mcp_server_get_detail", {
      server_name: serverName,
    });
    if (resp.success) {
      this.serverDetail = resp.detail;
      openModal("settings/mcp/client/mcp-server-tools.html");
    }
  },
};

const store = createStore("mcpServersStore", model);

export { store };
