import { createStore } from "/js/AlpineStore.js";

// Sidebar Bottom store manages version info display
const model = {
  versionNo: "",
  commitTime: "",
  versionBanner: "",

  get versionLabel() {
    const hasBanner =
      this.versionBanner &&
      this.versionBanner.trim() &&
      this.versionBanner.toLowerCase() !== "version unknown unknown";
    if (hasBanner) {
      return this.versionBanner;
    }

    if (this.versionNo && this.commitTime && this.versionNo !== "unknown") {
      return `Version ${this.versionNo} ${this.commitTime}`;
    }

    return "Version unknown";
  },

  init() {
    // Load version info from global scope (exposed in index.html)
    const gi = globalThis.gitinfo;
    if (gi && gi.version && gi.commit_time) {
      this.versionNo = gi.version;
      this.commitTime = gi.commit_time;
    }
    if (globalThis.a0VersionBanner) {
      this.versionBanner = globalThis.a0VersionBanner;
    }
  },
};

export const store = createStore("sidebarBottom", model);

