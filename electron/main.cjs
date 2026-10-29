"use strict";

const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { app, BrowserWindow, dialog, ipcMain, session } = require("electron");
const { createBackend } = require("./backend.cjs");

const APP_ID = "com.roptimer.electron";
const UI_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, "frontend")
  : path.resolve(__dirname, "..", "rust", "frontend");
const UI_ENTRY = path.join(UI_ROOT, "index.html");
const APP_ICON = app.isPackaged
  ? path.join(process.resourcesPath, "Marktis-Optimizer.ico")
  : path.resolve(__dirname, "..", "rust", "src-tauri", "icons", "icon.ico");
const ALLOWLIST_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "fastflags-allowlist.json")
  : path.resolve(__dirname, "..", "fastflags-allowlist.json");
const backend = createBackend({ allowlistPath: ALLOWLIST_PATH });

app.setAppUserModelId(APP_ID);

function isTrustedUiUrl(rawUrl) {
  try {
    const candidate = path.resolve(fileURLToPath(rawUrl));
    return process.platform === "win32"
      ? candidate.toLowerCase() === path.resolve(UI_ENTRY).toLowerCase()
      : candidate === path.resolve(UI_ENTRY);
  } catch (_error) {
    return false;
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 900,
    minHeight: 640,
    show: false,
    center: true,
    icon: APP_ICON,
    backgroundColor: "#030307",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isTrustedUiUrl(targetUrl)) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.once("ready-to-show", () => window.show());
  window.on("closed", () => { /* The shell owns no long-lived backend state. */ });
  window.loadFile(UI_ENTRY).catch(async (error) => {
    await dialog.showMessageBox({
      type: "error",
      title: "Marktis Optimizer could not start",
      message: "The local desktop interface could not be loaded.",
      detail: error.message
    });
    app.quit();
  });
  return window;
}

ipcMain.handle("roptimer:invoke", async (event, command, args) => {
  if (!event.senderFrame || !isTrustedUiUrl(event.senderFrame.url)) {
    throw new Error("This local command is available only to the packaged Marktis Optimizer interface.");
  }
  return backend.invoke(command, args || {});
});

app.whenReady().then(() => {
  // The renderer has no remote content. Only the explicit user-triggered TCP probe can reach the fixed Roblox web endpoint from the backend.
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"] },
    (_details, callback) => callback({ cancel: true })
  );

  if (!require("node:fs").existsSync(UI_ENTRY)) {
    dialog.showErrorBox("Marktis Optimizer could not start", `The packaged desktop interface is missing:\n${UI_ENTRY}`);
    app.quit();
    return;
  }
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
