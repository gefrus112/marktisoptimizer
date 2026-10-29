"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Deliberately narrow compatibility bridge: the shared desktop renderer can
// invoke only commands validated by main.cjs/backend.cjs. No Node, shell, fs,
// arbitrary IPC, or remote APIs are exposed to the renderer.
contextBridge.exposeInMainWorld("__TAURI__", {
  core: {
    invoke(command, args) {
      return ipcRenderer.invoke("roptimer:invoke", command, args || {});
    }
  },
  event: {
    listen(eventName, callback) {
      if (eventName !== "tray-action" || typeof callback !== "function") {
        return Promise.reject(new Error("Unsupported local desktop event listener."));
      }
      const listener = (_event, payload) => callback({ payload });
      ipcRenderer.on("roptimer:tray-action", listener);
      return Promise.resolve(() => ipcRenderer.removeListener("roptimer:tray-action", listener));
    }
  }
});
