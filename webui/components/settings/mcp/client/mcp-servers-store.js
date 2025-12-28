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

function isLikelyServerEntry(entry) {
  if (!entry || typeof entry !== "object") return false;
  return (
    Object.prototype.hasOwnProperty.call(entry, "command") ||
    Object.prototype.hasOwnProperty.call(entry, "args") ||
    Object.prototype.hasOwnProperty.call(entry, "url") ||
    Object.prototype.hasOwnProperty.call(entry, "serverUrl")
  );
}

function parseConfigString(raw) {
  if (!raw || !raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch (jsonError) {
    try {
      // eslint-disable-next-line no-new-func
      const result = Function(`"use strict"; return (${raw});`)();
      if (result && (typeof result === "object" || Array.isArray(result))) {
        return result;
      }
      throw funcError;
    } catch (funcError) {
      throw funcError;
    }
  }
}

function collectServerEntries(root) {
  const seen = new WeakSet();
  const entries = [];

  function visit(node, keyHint) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, null));
      return;
    }

    if (isLikelyServerEntry(node)) {
      entries.push({ entry: node, keyHint });
    }

    for (const [childKey, childValue] of Object.entries(node)) {
      visit(childValue, childKey);
    }
  }

  visit(root, null);
  return entries;
}

function ensureDisabledEverywhere(configRoot) {
  for (const { entry } of collectServerEntries(configRoot)) {
    if (!Object.prototype.hasOwnProperty.call(entry, "disabled")) {
      entry.disabled = false;
    }
  }
  return configRoot;
}

function readDisabledFromConfig(configRoot, normalizedName) {
  for (const { entry, keyHint } of collectServerEntries(configRoot)) {
    const candidates = [];
    if (keyHint) candidates.push(normalizeServerName(keyHint));
    if (entry.name) candidates.push(normalizeServerName(entry.name));
    if (entry.displayName) candidates.push(normalizeServerName(entry.displayName));
    if (entry.id) candidates.push(normalizeServerName(entry.id));
    if (candidates.filter(Boolean).includes(normalizedName)) {
      if (Object.prototype.hasOwnProperty.call(entry, "disabled")) {
        return Boolean(entry.disabled);
      }
      return null;
    }
  }
  return null;
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
  applyDelayMs: 120,

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
      const formatted = this._normalizeConfigString(this.editor.getValue());
      this.editor.setValue(formatted);
      this.editor.clearSelection();
      this.editor.navigateFileStart();
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

  statusBurstCount: 0,

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
      const interval = this.statusBurstCount > 0 ? 500 : 1200;
      if (this.statusBurstCount > 0) this.statusBurstCount -= 1;
      await sleep(interval);
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

  _scheduleStatusRestart(delayMs = 600) {
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
      current = parseConfigString(currentRaw || "{}");
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
      const parsed = parseConfigString(configString);
      return readDisabledFromConfig(parsed, normalizedName);
    } catch {
      return null;
    }
  },

  _normalizeConfigString(raw) {
    const parsed = parseConfigString(raw);
    ensureDisabledEverywhere(parsed);
    return JSON.stringify(parsed, null, 2);
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

      // Fire-and-forget to avoid blocking the UI on network latency.
      this._applyConfig(configToApply, toggledServers).catch((error) => {
        console.error("Toggle apply failed:", error);
        this._scheduleStatusRestart();
      });
    };

    this.pendingApplyTimer = setTimeout(attemptApply, this.applyDelayMs);
  },

  async toggleServer(name) {
    try {
      this.stopStatusCheck();
      const { normalizedTarget } = this._applyToggleLocally(name);
      this.pendingToggles.add(normalizedTarget);

      // Burst status checks briefly after a toggle to surface state faster
      this.statusBurstCount = 4;

      // If we're not currently applying and only one toggle is pending, fire immediately without await
      if (!this.isApplying && this.pendingToggles.size === 1) {
        const configToApply =
          this.pendingConfigString !== null
            ? this.pendingConfigString
            : this.getEditorValue();
        const toggles = Array.from(this.pendingToggles);
        this.pendingToggles = new Set();
        this._applyConfig(configToApply, toggles).catch((error) => {
          console.error("Toggle apply failed:", error);
          this._scheduleStatusRestart();
        });
      } else {
        this._scheduleApply();
      }
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
      let normalizedConfig = configString;
      normalizedConfig = this._normalizeConfigString(configString);

      if (normalizedConfig !== configString) {
        this.editor.setValue(normalizedConfig);
        this.editor.clearSelection();
        this.getSettingsFieldConfigJson().value = normalizedConfig;
        this.pendingConfigString = normalizedConfig;
      }

      let response = null;
      if (toggledServers.length === 0) {
        response = await API.callJsonApi("mcp_servers_apply", {
          mcp_servers: normalizedConfig,
        });
      } else {
        for (const serverName of toggledServers) {
          response = await API.callJsonApi("mcp_servers_toggle", {
            mcp_servers: normalizedConfig,
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
        const sourceCfg = normalizedConfig || this.pendingConfigString || this.getEditorValue();
        if (toggledServers.length === 0) {
          try {
            const parsedSource = JSON.parse(sourceCfg);
            for (const { entry, keyHint } of collectServerEntries(parsedSource)) {
              if (!Object.prototype.hasOwnProperty.call(entry, "disabled")) continue;
              const candidates = [];
              if (keyHint) candidates.push(normalizeServerName(keyHint));
              if (entry.name) candidates.push(normalizeServerName(entry.name));
              if (entry.displayName) candidates.push(normalizeServerName(entry.displayName));
              if (entry.id) candidates.push(normalizeServerName(entry.id));
              for (const name of candidates.filter(Boolean)) {
                overrides.set(name, Boolean(entry.disabled));
              }
            }
          } catch {
            // ignore and fall back to derived status
          }
        } else {
          for (const name of toggledServers) {
            const norm = normalizeServerName(name);
            const val = this._getDisabledFromConfig(sourceCfg, norm);
            if (val !== null) overrides.set(norm, val);
          }
        }

        const statusList = Array.isArray(response.status) ? response.status : null;
        if (statusList) {
          this.servers = statusList
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
        } else {
          // Fallback: refresh from status endpoint so we don't throw on missing status
          await this._statusCheck();
        }
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
