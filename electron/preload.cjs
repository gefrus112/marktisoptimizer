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
  }
});
