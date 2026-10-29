"use strict";

const path = require("node:path");
const { fileURLToPath } = require("node:url");
const { app, BrowserWindow, dialog, ipcMain, Menu, session, Tray } = require("electron");
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
const USER_PROFILE = process.env.USERPROFILE && path.isAbsolute(process.env.USERPROFILE)
  ? process.env.USERPROFILE
  : "C:\\Users\\Default";
const LOCAL_APP_DATA = process.env.LOCALAPPDATA && path.isAbsolute(process.env.LOCALAPPDATA)
  ? process.env.LOCALAPPDATA
  : path.join(USER_PROFILE, "AppData", "Local");
// Shared with the Rust/Tauri build so both desktop shells see the same encrypted tunnel profile.
const VPN_DATA_DIR = path.join(LOCAL_APP_DATA, "MarktisOptimizer");
const backend = createBackend({ allowlistPath: ALLOWLIST_PATH, vpnDataDir: VPN_DATA_DIR, exitApp: () => app.quit() });

app.setAppUserModelId(APP_ID);

let mainWindow = null;
let tray = null;
let isQuitting = false;

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
  mainWindow = window;
  window.once("ready-to-show", () => window.show());
  window.on("close", (event) => {
    if (process.platform === "win32" && tray && !isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = null;
  });
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

function focusMainWindow(action) {
  let window = mainWindow;
  if (!window || window.isDestroyed()) window = createWindow();
  mainWindow = window;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  if (!action) return;
  const dispatch = () => {
    if (!window.isDestroyed()) window.webContents.send("roptimer:tray-action", action);
  };
  if (window.webContents.isLoading()) window.webContents.once("did-finish-load", dispatch);
  else dispatch();
}

function createTray() {
  if (process.platform !== "win32" || tray) return;
  tray = new Tray(APP_ICON);
  tray.setToolTip("Marktis Optimizer");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Open Marktis Optimizer", click: () => focusMainWindow() },
    { type: "separator" },
    { label: "Open Roblox settings location", click: () => focusMainWindow("settings") },
    { label: "Launch Roblox normally", click: () => focusMainWindow("launch") },
    { label: "Restore managed settings…", click: () => focusMainWindow("restore") },
    { type: "separator" },
    { label: "Quit Marktis Optimizer", click: () => app.quit() }
  ]));
  tray.on("click", () => focusMainWindow());
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
  // The in-app control explicitly calls Notification.requestPermission(). Keep
  // the grant limited to the trusted local UI and notification permission.
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
    permission === "notifications"
      && Boolean(webContents && isTrustedUiUrl(webContents.getURL()))
  ));
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const trustedUi = Boolean(webContents && isTrustedUiUrl(webContents.getURL()));
    const mainFrame = !details || details.isMainFrame !== false;
    callback(permission === "notifications" && trustedUi && mainFrame);
  });

  if (!require("node:fs").existsSync(UI_ENTRY)) {
    dialog.showErrorBox("Marktis Optimizer could not start", `The packaged desktop interface is missing:\n${UI_ENTRY}`);
    app.quit();
    return;
  }
  createTray();
  createWindow();
});

app.on("before-quit", () => { isQuitting = true; });
app.on("will-quit", () => {
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !(process.platform === "win32" && tray && !isQuitting)) app.quit();
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) focusMainWindow();
  else if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
