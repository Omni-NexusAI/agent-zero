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
      const formatted = JSON.stringify(parsed, null, 2);

      // update editor content
      this.editor.setValue(formatted);
      this.editor.clearSelection();

      // move cursor to start
      this.editor.navigateFileStart();
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
      this.servers = resp.status;
      this.servers.sort((a, b) => a.name.localeCompare(b.name));
    }
  },

  async toggleServer(name) {
    try {
      // Stop status check completely to avoid conflicts
      this.statusCheck = false;
      
      const current = JSON.parse(this.getEditorValue() || "{}");
      if (!current.mcpServers || typeof current.mcpServers !== "object") {
        console.error("No mcpServers configuration found");
        this.startStatusCheck();
        return;
      }
      
      // Find the server by name (case-insensitive)
      let found = false;
      for (const [key, server] of Object.entries(current.mcpServers)) {
        if (key.toLowerCase() === name.toLowerCase()) {
          server.disabled = !server.disabled;
          found = true;
          break;
        }
      }
      
      if (!found) {
        console.error(`Server ${name} not found in configuration`);
        this.startStatusCheck();
        return;
      }
      
      const formatted = JSON.stringify(current, null, 2);
      this.editor.setValue(formatted);
      this.editor.clearSelection();
      
      // Set loading state
      this.loading = true;
      
      // Apply changes immediately using the same logic as applyNow
      scrollModal("mcp-servers-status");
      const resp = await API.callJsonApi("mcp_servers_apply", {
        mcp_servers: formatted,
      });
      
      if (resp.success) {
        this.servers = resp.status;
        this.servers.sort((a, b) => a.name.localeCompare(b.name));
      }
      
      this.loading = false;
      await sleep(100); // wait for ui and scroll
      scrollModal("mcp-servers-status");
      
      // Restart status check after a delay
      setTimeout(() => this.startStatusCheck(), 2000);
    } catch (error) {
      console.error("Failed to toggle server:", error);
      alert("Failed to toggle server: " + error.message);
      this.loading = false;
      // Restart status check on error
      setTimeout(() => this.startStatusCheck(), 2000);
    }
  },

  async stopStatusCheck() {
    this.statusCheck = false;
  },

  async applyNow() {
    if (this.loading) return;
    this.loading = true;
    try {
      scrollModal("mcp-servers-status");
      const resp = await API.callJsonApi("mcp_servers_apply", {
        mcp_servers: this.getEditorValue(),
      });
      if (resp.success) {
        this.servers = resp.status;
        this.servers.sort((a, b) => a.name.localeCompare(b.name));
      }
      this.loading = false;
      await sleep(100); // wait for ui and scroll
      scrollModal("mcp-servers-status");
    } catch (error) {
      console.error("Failed to apply MCP servers:", error);
      alert("Failed to apply MCP servers: " + error.message);
    }
    this.loading = false;
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
