import { createStore } from "/js/AlpineStore.js";
import { scrollModal } from "/js/modals.js";
import sleep from "/js/sleep.js";
import * as API from "/js/api.js";

function normalizeServerName(name) {
  if (!name) return "";
  return name
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[\W]/gu, "_");
}

function ensureDisabledOnServerMap(serverMap) {
  if (!serverMap || typeof serverMap !== "object") return;
  for (const key of Object.keys(serverMap)) {
    const entry = serverMap[key];
    if (entry && typeof entry === "object" && !("disabled" in entry)) {
      entry.disabled = false;
    }
  }
}

function ensureDisabledEverywhere(configRoot) {
  if (!configRoot) return configRoot;
  // Top-level array of servers
  if (Array.isArray(configRoot)) {
    for (const entry of configRoot) {
      if (entry && typeof entry === "object" && !("disabled" in entry)) {
        entry.disabled = false;
      }
    }
    return configRoot;
  }
  // Object shapes
  if (typeof configRoot === "object") {
    // { mcpServers: { name: {..}, ... } } or { mcpServers: [ {..}, ... ] }
    if (configRoot.mcpServers) {
      if (Array.isArray(configRoot.mcpServers)) {
        for (const entry of configRoot.mcpServers) {
          if (entry && typeof entry === "object" && !("disabled" in entry)) {
            entry.disabled = false;
          }
        }
      } else {
        ensureDisabledOnServerMap(configRoot.mcpServers);
      }
    }
    // { servers: [...] }
    if (configRoot.servers && Array.isArray(configRoot.servers)) {
      for (const entry of configRoot.servers) {
        if (entry && typeof entry === "object" && !("disabled" in entry)) {
          entry.disabled = false;
        }
      }
    }
    // Or a flat object-as-map of servers
    ensureDisabledOnServerMap(configRoot);
  }
  return configRoot;
}

function toggleDisabledFlag(serverConfig) {
  if (!serverConfig || typeof serverConfig !== "object") return null;
  const currentlyDisabled = Boolean(serverConfig.disabled);
  const nextDisabled = !currentlyDisabled;
  serverConfig.disabled = nextDisabled;
  return nextDisabled;
}

function tryToggleInCollection(collection, targetName) {
  if (!collection) return null;

  const evaluateMatch = (serverItem, keyName) => {
    const candidates = [];
    if (keyName) candidates.push(normalizeServerName(keyName));
    if (serverItem && typeof serverItem === "object") {
      if (serverItem.name) candidates.push(normalizeServerName(serverItem.name));
      if (serverItem.displayName)
        candidates.push(normalizeServerName(serverItem.displayName));
      if (serverItem.id) candidates.push(normalizeServerName(serverItem.id));
    }
    return candidates.filter(Boolean).includes(targetName);
  };

  if (Array.isArray(collection)) {
    for (const server of collection) {
      if (evaluateMatch(server)) {
        const toggled = toggleDisabledFlag(server);
        if (toggled !== null) return toggled;
      }
    }
    return null;
  }

  if (typeof collection === "object") {
    for (const [key, server] of Object.entries(collection)) {
      if (evaluateMatch(server, key)) {
        const toggled = toggleDisabledFlag(server);
        if (toggled !== null) return toggled;
      }
    }
  }

  return null;
}

const model = {
  editor: null,
  servers: [],
  loading: true,
  statusCheck: false,
  serverLog: "",
  pendingApplyTimer: null,
  statusRestartTimer: null,
  pendingConfigString: null,
  pendingToggles: new Set(),
  isApplying: false,
  lastAppliedConfig: null,
  applyDelayMs: 350,

  async initialize() {
    // Initialize the JSON Viewer after the modal is rendered
    const container = document.getElementById("mcp-servers-config-json");
    if (container) {
      const editor = ace.edit("mcp-servers-config-json");

      const dark = localStorage.getItem("darkMode");
      if (dark != "false") {
        editor.setTheme("ace/theme/github_dark");
      } else {
        editor.setTheme("ace/theme/tomorrow");
      }

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
      // get current content
      const currentContent = this.editor.getValue();

      // parse and format with 2 spaces indentation
      const parsed = JSON.parse(currentContent);
      // Add missing "disabled" fields so toggles always work
      ensureDisabledEverywhere(parsed);
      const formatted = JSON.stringify(parsed, null, 2);

      // update editor content
      this.editor.setValue(formatted);
      this.editor.clearSelection();

      // move cursor to start
      this.editor.navigateFileStart();
      // also sync the hidden field backing settings
      this.getSettingsFieldConfigJson().value = formatted;
      this.pendingConfigString = formatted;
    } catch (error) {
      console.error("Failed to format JSON:", error);
      alert("Invalid JSON: " + error.message);
    }
  },

  getEditorValue() {
    return this.editor.getValue();
  },

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

  async startStatusCheck() {
    if (this.statusCheck) return;
    this.statusCheck = true;
    let firstLoad = true;

    while (this.statusCheck) {
      await this._statusCheck();
      if (firstLoad) {
        this.loading = false;
        firstLoad = false;
      }
      await sleep(3000);
    }
  },

  async _statusCheck() {
    const resp = await API.callJsonApi("mcp_servers_status", null);
    if (resp.success) {
      // Always derive disabled state from the current editor value (or pending)
      const baseline = this.pendingConfigString || this.getEditorValue();
      this.servers = resp.status
        .map((server) => {
          const disabledFromCfg = this._getDisabledFromConfig(
            baseline,
            normalizeServerName(server.name)
          );
          const disabled =
            disabledFromCfg !== null ? disabledFromCfg : this._deriveDisabled(server);
          return { ...server, disabled };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  },

  _clearPendingApply() {
    if (this.pendingApplyTimer) {
      clearTimeout(this.pendingApplyTimer);
      this.pendingApplyTimer = null;
    }
  },

  _scheduleStatusRestart(delayMs = 2000) {
    if (this.statusRestartTimer) {
      clearTimeout(this.statusRestartTimer);
    }
    this.statusRestartTimer = setTimeout(() => {
      this.statusRestartTimer = null;
      this.startStatusCheck();
    }, delayMs);
  },

  _applyToggleLocally(name) {
    const currentRaw = this.getEditorValue();
    const normalizedTarget = normalizeServerName(name);

    let current;
    try {
      current = currentRaw ? JSON.parse(currentRaw) : {};
    } catch (error) {
      throw new Error("Invalid MCP configuration JSON");
    }

    let updated = null;

    if (Array.isArray(current)) {
      updated = tryToggleInCollection(current, normalizedTarget);
    }

    if (updated === null && current && typeof current === "object") {
      if (current.mcpServers) {
        updated = tryToggleInCollection(current.mcpServers, normalizedTarget);
      }

      if (updated === null && current.servers) {
        updated = tryToggleInCollection(current.servers, normalizedTarget);
      }

      if (updated === null) {
        updated = tryToggleInCollection(current, normalizedTarget);
      }
    }

    if (updated === null) {
      throw new Error(`Server '${name}' not found in configuration`);
    }

    const formatted = JSON.stringify(current, null, 2);
    this.editor.setValue(formatted);
    this.editor.clearSelection();
    this.getSettingsFieldConfigJson().value = formatted;
    this.pendingConfigString = formatted;
    this._reflectToggleInStatus(normalizedTarget, updated);
    return { formatted, normalizedTarget, disabled: updated };
  },

  _reflectToggleInStatus(normalizedName, disabled) {
    const normalizedTarget = normalizeServerName(normalizedName);
    this.servers = this.servers.map((server) => {
      if (normalizeServerName(server.name) === normalizedTarget) {
        return {
          ...server,
          disabled,
          connected: disabled ? false : server.connected,
        };
      }
      return server;
    });
  },

  _deriveDisabled(server) {
    if (Object.prototype.hasOwnProperty.call(server, "disabled")) {
      return Boolean(server.disabled);
    }
    if (typeof server.error === "string") {
      const lower = server.error.toLowerCase();
      return lower.includes("disabled") || lower.includes("not enabled");
    }
    return false;
  },

  _getDisabledFromConfig(configString, normalizedName) {
    try {
      const parsed = configString ? JSON.parse(configString) : {};
      const target = normalizedName;
      const readFromCollection = (collection) => {
        if (!collection) return null;
        if (Array.isArray(collection)) {
          for (const server of collection) {
            const nameCand =
              (server && (server.name || server.displayName || server.id || "")) + "";
            if (normalizeServerName(nameCand) === target) {
              return server && typeof server === "object" && "disabled" in server
                ? Boolean(server.disabled)
                : null;
            }
          }
        } else if (typeof collection === "object") {
          for (const [key, server] of Object.entries(collection)) {
            const keyNorm = normalizeServerName(key);
            const nameCand =
              (server && (server.name || server.displayName || server.id || "")) + "";
            if (keyNorm === target || normalizeServerName(nameCand) === target) {
              return server && typeof server === "object" && "disabled" in server
                ? Boolean(server.disabled)
                : null;
            }
          }
        }
        return null;
      };

      // check various shapes
      let found = null;
      if (Array.isArray(parsed)) {
        found = readFromCollection(parsed);
      }
      if (found === null && parsed && typeof parsed === "object") {
        if (parsed.mcpServers) found = readFromCollection(parsed.mcpServers);
        if (found === null && parsed.servers) found = readFromCollection(parsed.servers);
        if (found === null) found = readFromCollection(parsed);
      }
      return found;
    } catch {
      return null;
    }
  },

  _scheduleApply() {
    this._clearPendingApply();

    const attemptApply = async () => {
      if (this.isApplying) {
        this.pendingApplyTimer = setTimeout(attemptApply, this.applyDelayMs);
        return;
      }

      const configToApply =
        this.pendingConfigString !== null
          ? this.pendingConfigString
          : this.getEditorValue();

      const toggledServers = Array.from(this.pendingToggles);
      this.pendingToggles = new Set();
      this.pendingConfigString = null;

      await this._applyConfig(configToApply, toggledServers);
    };

    this.pendingApplyTimer = setTimeout(attemptApply, this.applyDelayMs);
  },

  async toggleServer(name) {
    try {
      this.stopStatusCheck();
      const { normalizedTarget } = this._applyToggleLocally(name);
      this.pendingToggles.add(normalizedTarget);
      this._scheduleApply();
    } catch (error) {
      console.error("Failed to toggle server:", error);
      alert("Failed to toggle server: " + error.message);
      this.loading = false;
      this._scheduleStatusRestart();
    }
  },

  async stopStatusCheck() {
    this.statusCheck = false;
  },

  async _applyConfig(configString, toggledServers = []) {
    if (!configString) return;

    const showFullLoading = toggledServers.length === 0;
    this.stopStatusCheck();
    this.isApplying = true;
    this.loading = showFullLoading;
    if (showFullLoading) {
      scrollModal("mcp-servers-status");
    }

    try {
      let response = null;
      // Normalize config to ensure every server has "disabled" for togglability
      let toSend = configString;
      try {
        const parsedForSend = JSON.parse(configString);
        ensureDisabledEverywhere(parsedForSend);
        toSend = JSON.stringify(parsedForSend, null, 2);
        // If normalization changed content, reflect it in the editor and settings field
        if (toSend !== configString) {
          this.editor.setValue(toSend);
          this.editor.clearSelection();
          this.getSettingsFieldConfigJson().value = toSend;
          this.pendingConfigString = toSend;
        }
      } catch {
        // if JSON parse fails here, upstream catch will notify the user
      }

      if (toggledServers.length === 0) {
        response = await API.callJsonApi("mcp_servers_apply", {
          mcp_servers: toSend,
        });
      } else {
        for (const serverName of toggledServers) {
          response = await API.callJsonApi("mcp_servers_toggle", {
            mcp_servers: toSend,
            server_name: serverName,
          });
          if (!response?.success) {
            break;
          }
        }
      }

      if (response?.success) {
        // Compute disabled state from the config we just applied (authoritative)
        const overrides = new Map();
        const sourceCfg = toSend || this.pendingConfigString || this.getEditorValue();
        for (const name of toggledServers) {
          const norm = normalizeServerName(name);
          const val = this._getDisabledFromConfig(sourceCfg, norm);
          if (val !== null) overrides.set(norm, val);
        }

        this.servers = response.status
          .map((server) => {
            const norm = normalizeServerName(server.name);
            const disabled =
              overrides.has(norm)
                ? overrides.get(norm)
                : this._getDisabledFromConfig(sourceCfg, norm) ??
                  this._deriveDisabled(server);
            return { ...server, disabled };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
        this.lastAppliedConfig = configString;
      }

      if (showFullLoading) {
        this.loading = false;
        await sleep(100);
        scrollModal("mcp-servers-status");
      }
    } catch (error) {
      console.error("Failed to apply MCP servers:", error);
      alert("Failed to apply MCP servers: " + error.message);
    } finally {
      if (!showFullLoading) {
        this.loading = false;
      }
      this.isApplying = false;
      this._scheduleStatusRestart();
    }
  },

  async applyNow() {
    if (this.loading) return;
    this._clearPendingApply();
    this.pendingToggles = new Set();
    await this._applyConfig(this.getEditorValue(), []);
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
