/* Marktis Optimizer standalone Windows desktop UI, shared by the Tauri and Electron builds.
 * No website bundle or remote code. A fixed TCP probe is user-triggered in the local backend.
 * No process handles or game-memory access; settings use the narrow local bridge.
 */
(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const invoke = resolveInvoke();
  const profileKey = "roptimer.desktop.profile.v1";
  const profileLibraryKey = "roptimer.desktop.profileLibrary.v1";
  const maxSavedProfiles = 12;
  const maxProfileImportBytes = 64 * 1024;
  const appearanceKey = "roptimer.desktop.appearance.v1";
  const benchmarkJournalKey = "roptimer.desktop.manualBenchmark.v1";
  const robloxUserIdKey = "roptimer.desktop.robloxUserId.v1";
  const notificationPreferencesKey = "roptimer.desktop.notifications.v1";
  const notificationHistoryKey = "roptimer.desktop.notificationHistory.v1";
  const rejoinTargetKey = "roptimer.desktop.rejoinTarget.v1";
  const notificationEventKeys = ["playerStatus", "safetyAlerts", "settingsChanges", "lowStorage"];
  const lowStorageBytes = 10 * 1024 * 1024 * 1024;
  const lowStoragePercent = 5;
  const animeThemes = [
    { id: "goku-ultra-instinct", name: "Ultra Instinct Goku", series: "Dragon Ball Super", file: "goku-ultra-instinct.jpg", accent: "blue" },
    { id: "vegeta-ultra-ego", name: "Ultra Ego Vegeta", series: "Dragon Ball Super", file: "vegeta-ultra-ego.jpg", accent: "violet" },
    { id: "broly-legendary", name: "Legendary Broly", series: "Dragon Ball Super", file: "broly-legendary.jpg", accent: "emerald" },
    { id: "gohan-beast", name: "Beast Gohan", series: "Dragon Ball Super", file: "gohan-beast.jpg", accent: "violet" },
    { id: "naruto-sage", name: "Sage Mode Naruto", series: "Naruto", file: "naruto-sage.jpg", accent: "amber" },
    { id: "sasuke-rinnegan", name: "Rinnegan Sasuke", series: "Naruto Shippuden", file: "sasuke-rinnegan.jpg", accent: "violet" },
    { id: "luffy-gear-five", name: "Gear Five Luffy", series: "One Piece", file: "luffy-gear-five.jpg", accent: "rose" },
    { id: "zoro-swordsman", name: "Three-Sword Zoro", series: "One Piece", file: "zoro-swordsman.jpg", accent: "emerald" },
    { id: "gojo-limitless", name: "Limitless Gojo", series: "Jujutsu Kaisen", file: "gojo-limitless.jpg", accent: "cyan" },
    { id: "sukuna-cursed", name: "Cursed Sukuna", series: "Jujutsu Kaisen", file: "sukuna-cursed.jpg", accent: "crimson" }
  ];
  const defaultProfile = {
    mode: "Reduce building lag",
    tier: 21,
    texture: 0,
    renderer: "Auto",
    fps: 240,
    legacyFps: false,
    geometryDistance: 64,
    vfx: true,
    allVersions: true
  };
  const defaultAppearance = { accent: "mint", iconStyle: "outline", animeTheme: "none" };
  const fallbackAllowlist = readEmbeddedAllowlist();
  let bootFinishScheduled = false;
  const bootStartedAt = Date.now();
  const minimumBootVisibleMs = 850;
  const state = {
    detection: null,
    activePlayer: null,
    executorScan: null,
    deviceSnapshot: null,
    storageSnapshot: null,
    storagePending: false,
    storageNoticeShown: false,
    recommendedPreset: null,
    latencyPending: false,
    appInfo: null,
    allowlist: fallbackAllowlist,
    allowlistFilter: "all",
    savedProfiles: [],
    selectedSavedProfileId: "",
    geometryManuallyChanged: false,
    devicePending: false,
    quickRefreshPending: false,
    benchmarkJournal: null,
    notificationPrefs: null,
    notificationHistory: [],
    notificationPermission: "unsupported",
    pendingAction: null,
    confirmReturnFocus: null,
    wireguardStatus: null,
    wireguardPending: false,
    playerObservedAt: null,
    pendingWireguardConfig: "",
    pendingWireguardFilename: "",
    statusPending: false,
    safetyScanPending: false,
    lastSafetyScanSignature: "",
    lastSafetyAlertSignature: "",
    toastTimer: 0,
    saveTimer: 0
  };

  function resolveInvoke() {
    try {
      const bridge = window.__TAURI__;
      if (bridge && bridge.core && typeof bridge.core.invoke === "function") {
        return bridge.core.invoke.bind(bridge.core);
      }
      if (bridge && typeof bridge.invoke === "function") return bridge.invoke.bind(bridge);
      if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
        return window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
      }
    } catch (_error) { /* Desktop-shell IPC is not exposed in a browser preview. */ }
    return null;
  }

  function readEmbeddedAllowlist() {
    const node = byId("fastflagAllowlist");
    if (!node) return { categories: [] };
    try {
      const data = JSON.parse(node.textContent || "{}");
      return data && Array.isArray(data.categories) ? data : { categories: [] };
    } catch (_error) {
      return { categories: [] };
    }
  }

  function setBoot(message, progress) {
    const text = byId("bootMessage");
    const fill = byId("bootProgress");
    if (text) text.textContent = message;
    if (fill) fill.style.width = Math.max(0, Math.min(100, Number(progress) || 0)) + "%";
  }

  function finishBoot() {
    if (!document.body.classList.contains("is-booting") || bootFinishScheduled) return;
    bootFinishScheduled = true;
    setBoot("Workspace ready · local settings stay on this device", 100);
    const remaining = Math.max(0, minimumBootVisibleMs - (Date.now() - bootStartedAt));
    window.setTimeout(function () {
      document.body.classList.remove("is-booting");
      document.body.classList.add("is-ready");
    }, remaining + 300);
  }

  function safeStorageGet(key) {
    try { return window.localStorage.getItem(key); } catch (_error) { return null; }
  }

  function safeStorageSet(key, value) {
    try { window.localStorage.setItem(key, value); } catch (_error) { /* Storage is a convenience only. */ }
  }

  function safeStorageRemove(key) {
    try { window.localStorage.removeItem(key); } catch (_error) { /* Storage is a convenience only. */ }
  }

  function readNotificationPreferences() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(notificationPreferencesKey) || "null"); } catch (_error) { stored = null; }
    const values = stored && typeof stored === "object" ? stored : {};
    const eventValues = values.events && typeof values.events === "object" ? values.events : {};
    const events = {};
    notificationEventKeys.forEach(function (key) { events[key] = eventValues[key] !== false; });
    return { enabled: values.enabled === true, events: events };
  }

  function readNotificationHistory() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(notificationHistoryKey) || "[]"); } catch (_error) { stored = null; }
    if (!Array.isArray(stored)) return [];
    return stored.map(function (item) {
      if (!item || typeof item !== "object") return null;
      const timestamp = Date.parse(item.createdAt);
      const category = notificationEventKeys.includes(item.category) ? item.category : "settingsChanges";
      return {
        id: String(item.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 7)).slice(0, 64),
        title: String(item.title || "Marktis Optimizer update").slice(0, 120),
        body: String(item.body || "").slice(0, 500),
        category: category,
        tone: ["success", "warning", "error"].includes(item.tone) ? item.tone : "default",
        createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
        read: item.read === true
      };
    }).filter(Boolean).slice(0, 50);
  }

  function writeNotificationPreferences() {
    if (!state.notificationPrefs) return;
    safeStorageSet(notificationPreferencesKey, JSON.stringify(state.notificationPrefs));
  }

  function writeNotificationHistory() {
    safeStorageSet(notificationHistoryKey, JSON.stringify(state.notificationHistory.slice(0, 50)));
  }

  function getNotificationPermission() {
    try {
      const api = window.Notification;
      if (!api || typeof api.requestPermission !== "function") return "unsupported";
      return ["default", "granted", "denied"].includes(api.permission) ? api.permission : "unsupported";
    } catch (_error) {
      return "unsupported";
    }
  }

  function renderNotificationPermission() {
    state.notificationPermission = getNotificationPermission();
    const badge = byId("notificationPermissionBadge");
    const detail = byId("notificationPermissionDetail");
    const button = byId("requestNotifications");
    if (!badge || !detail || !button) return;
    if (state.notificationPermission === "granted") {
      badge.textContent = "ALLOWED";
      badge.className = "state-pill state-found";
      detail.textContent = "WebView permission is granted. Windows notification settings may still suppress toasts; choose events and enable app notifications below.";
      button.textContent = "Desktop permission granted";
      button.disabled = true;
    } else if (state.notificationPermission === "denied") {
      badge.textContent = "BLOCKED";
      badge.className = "state-pill state-error";
      detail.textContent = "Desktop alerts were denied by the browser or Windows. You can still use the in-app notification center.";
      button.textContent = "Desktop permission blocked";
      button.disabled = true;
    } else if (state.notificationPermission === "default") {
      badge.textContent = "NOT REQUESTED";
      badge.className = "state-pill state-pending";
      detail.textContent = "Request permission only when you choose. The in-app notification center works even if you say no.";
      button.textContent = "Request desktop permission";
      button.disabled = false;
    } else {
      badge.textContent = "IN-APP ONLY";
      badge.className = "state-pill state-pending";
      detail.textContent = "Desktop toasts are unavailable in this WebView. Local in-app notifications are still supported.";
      button.textContent = "Desktop alerts unavailable";
      button.disabled = true;
    }
  }

  function renderNotificationPreferences() {
    if (!state.notificationPrefs) state.notificationPrefs = readNotificationPreferences();
    byId("notificationEnabled").checked = state.notificationPrefs.enabled;
    byId("notifyPlayerStatus").checked = state.notificationPrefs.events.playerStatus;
    byId("notifySafetyAlerts").checked = state.notificationPrefs.events.safetyAlerts;
    byId("notifySettingsChanges").checked = state.notificationPrefs.events.settingsChanges;
    byId("notifyLowStorage").checked = state.notificationPrefs.events.lowStorage;
    renderNotificationPermission();
  }

  function notificationCategoryTitle(category) {
    const titles = {
      playerStatus: "Roblox Player",
      safetyAlerts: "Local safety",
      settingsChanges: "Settings",
      lowStorage: "Storage"
    };
    return titles[category] || "App update";
  }

  function notificationIcon(category) {
    const icons = { playerStatus: "i-roblox", safetyAlerts: "i-shield", settingsChanges: "i-settings", lowStorage: "i-memory" };
    return icons[category] || "i-bell";
  }

  function formatNotificationTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Just now";
    return date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function renderNotificationCenter() {
    if (!Array.isArray(state.notificationHistory)) state.notificationHistory = [];
    const list = byId("notificationList");
    const badge = byId("notificationBadge");
    const trigger = byId("toggleNotifications");
    const summary = byId("notificationUnreadSummary");
    if (!list || !badge || !trigger || !summary) return;
    const unreadCount = state.notificationHistory.filter(function (item) { return !item.read; }).length;
    byId("markNotificationsRead").disabled = unreadCount === 0;
    byId("clearNotifications").disabled = state.notificationHistory.length === 0;
    badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
    badge.hidden = unreadCount === 0;
    trigger.setAttribute("aria-label", unreadCount ? "Open notifications, " + unreadCount + " unread" : "Open notifications");
    summary.textContent = unreadCount ? unreadCount + " unread · " + state.notificationHistory.length + " saved locally" : state.notificationHistory.length ? "All caught up · " + state.notificationHistory.length + " saved locally" : "Your local updates will appear here.";
    list.replaceChildren();
    if (!state.notificationHistory.length) {
      const empty = document.createElement("p");
      empty.className = "notification-empty";
      empty.textContent = state.notificationPrefs && state.notificationPrefs.enabled
        ? "No notifications yet. Your selected local events will appear here."
        : "Notifications are off. Enable them in Settings to collect local app updates.";
      list.appendChild(empty);
      return;
    }
    state.notificationHistory.slice(0, 30).forEach(function (item) {
      const row = document.createElement("button");
      row.className = "notification-item" + (item.read ? "" : " is-unread") + " tone-" + item.tone;
      row.type = "button";
      row.dataset.notificationId = item.id;
      const mark = document.createElement("span");
      mark.className = "notification-item-mark";
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "icon");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#" + notificationIcon(item.category));
      svg.appendChild(use);
      mark.appendChild(svg);
      const copy = document.createElement("span");
      copy.className = "notification-item-copy";
      const heading = document.createElement("strong");
      heading.textContent = item.title;
      const body = document.createElement("span");
      body.className = "notification-item-body";
      body.textContent = item.body;
      const meta = document.createElement("span");
      meta.className = "notification-item-meta";
      const category = document.createElement("span");
      category.textContent = notificationCategoryTitle(item.category);
      const time = document.createElement("time");
      time.dateTime = item.createdAt;
      time.textContent = formatNotificationTime(item.createdAt);
      meta.append(category, time);
      copy.append(heading, body, meta);
      row.append(mark, copy);
      row.addEventListener("click", function () { markNotificationRead(item.id); });
      list.appendChild(row);
    });
  }

  function addAppNotification(title, body, category, tone) {
    if (!state.notificationPrefs || !state.notificationPrefs.enabled) return null;
    if (!notificationEventKeys.includes(category) || !state.notificationPrefs.events[category]) return null;
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: String(title || "Marktis Optimizer update").slice(0, 120),
      body: String(body || "").slice(0, 500),
      category: category,
      tone: ["success", "warning", "error"].includes(tone) ? tone : "default",
      createdAt: new Date().toISOString(),
      read: false
    };
    state.notificationHistory.unshift(item);
    state.notificationHistory = state.notificationHistory.slice(0, 50);
    writeNotificationHistory();
    renderNotificationCenter();
    if (state.notificationPermission === "granted") {
      try {
        const desktopAlert = new window.Notification(item.title, {
          body: item.body || "A local app update is ready to review.",
          tag: "marktis-" + item.category,
          renotify: false
        });
        desktopAlert.onclick = function () {
          window.focus();
          if (byId("notificationDrawer").hidden) toggleNotificationDrawer();
        };
      } catch (_error) { /* The local notification center remains available if OS toasts fail. */ }
    }
    return item;
  }

  async function requestDesktopNotifications() {
    const api = window.Notification;
    if (!api || typeof api.requestPermission !== "function") {
      renderNotificationPermission();
      showToast("Desktop toasts are not available here. Enable in-app alerts to use the notification center.", "warning");
      return;
    }
    const button = byId("requestNotifications");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await api.requestPermission();
      renderNotificationPermission();
      if (state.notificationPermission === "granted") {
        showToast("Desktop notification permission granted. Choose event types and enable app notifications below.", "success");
      } else if (state.notificationPermission === "denied") {
        showToast("Desktop notifications were denied. The in-app notification center still works.", "warning");
      } else {
        showToast("No desktop permission was granted. You can still use in-app notifications.", "warning");
      }
    } catch (_error) {
      renderNotificationPermission();
      showToast("Desktop permission could not be requested. In-app notifications remain available.", "warning");
    } finally {
      button.removeAttribute("aria-busy");
      renderNotificationPermission();
    }
  }

  function setNotificationEnabled(enabled) {
    if (!state.notificationPrefs) state.notificationPrefs = readNotificationPreferences();
    state.notificationPrefs.enabled = Boolean(enabled);
    writeNotificationPreferences();
    renderNotificationPreferences();
    renderNotificationCenter();
    showToast(state.notificationPrefs.enabled ? "Local app notifications enabled." : "Local app notifications paused.", "success");
  }

  function setNotificationEventEnabled(key, enabled) {
    if (!notificationEventKeys.includes(key)) return;
    if (!state.notificationPrefs) state.notificationPrefs = readNotificationPreferences();
    state.notificationPrefs.events[key] = Boolean(enabled);
    writeNotificationPreferences();
    renderNotificationPreferences();
    showToast(notificationCategoryTitle(key) + " alerts " + (enabled ? "enabled." : "muted."), "success");
  }

  function toggleQuickActionTray() {
    const tray = byId("quickActionTray");
    const trigger = byId("toggleQuickActions");
    if (!tray || !trigger) return;
    const opening = tray.hidden;
    if (opening) closeNotificationDrawer(false);
    tray.hidden = !opening;
    trigger.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) byId("quickActionMain").focus();
    else trigger.focus();
  }

  function closeQuickActionTray(restoreFocus) {
    const tray = byId("quickActionTray");
    if (!tray || tray.hidden) return;
    tray.hidden = true;
    byId("toggleQuickActions").setAttribute("aria-expanded", "false");
    if (restoreFocus !== false) byId("toggleQuickActions").focus();
  }

  function handleSystemTrayAction(action) {
    if (action === "settings") openSettingsFolder();
    else if (action === "launch") launchRoblox();
    else if (action === "restore") openConfirmation("restore");
  }

  function listenForSystemTrayActions() {
    const bridge = window.__TAURI__;
    const eventApi = bridge && bridge.event;
    if (!eventApi || typeof eventApi.listen !== "function") return;
    try {
      const registration = eventApi.listen("tray-action", function (event) {
        const action = event && typeof event.payload === "string" ? event.payload : "";
        handleSystemTrayAction(action);
      });
      if (registration && typeof registration.catch === "function") registration.catch(function () { /* Tray support is Windows-only. */ });
    } catch (_error) { /* Browser previews and non-Windows shells have no tray event bridge. */ }
  }

  function toggleNotificationDrawer() {
    const drawer = byId("notificationDrawer");
    const trigger = byId("toggleNotifications");
    const opening = drawer.hidden;
    if (opening) closeQuickActionTray(false);
    drawer.hidden = !opening;
    trigger.setAttribute("aria-expanded", opening ? "true" : "false");
    if (opening) {
      renderNotificationCenter();
      byId("closeNotifications").focus();
    } else {
      trigger.focus();
    }
  }

  function closeNotificationDrawer(restoreFocus) {
    const drawer = byId("notificationDrawer");
    if (!drawer || drawer.hidden) return;
    drawer.hidden = true;
    byId("toggleNotifications").setAttribute("aria-expanded", "false");
    if (restoreFocus !== false) byId("toggleNotifications").focus();
  }

  function markNotificationRead(id) {
    const item = state.notificationHistory.find(function (entry) { return entry.id === id; });
    if (!item || item.read) return;
    item.read = true;
    writeNotificationHistory();
    renderNotificationCenter();
  }

  function markAllNotificationsRead() {
    state.notificationHistory.forEach(function (item) { item.read = true; });
    writeNotificationHistory();
    renderNotificationCenter();
  }

  function clearNotificationHistory() {
    state.notificationHistory = [];
    writeNotificationHistory();
    renderNotificationCenter();
    showToast("Notification history cleared on this device.", "success");
  }

  function normalizeRobloxUserId(value) {
    const digits = String(value == null ? "" : value).trim();
    if (!/^\d{1,20}$/.test(digits) || /^0+$/.test(digits)) return "";
    const normalized = digits.replace(/^0+(?=\d)/, "");
    if (normalized.length === 20 && normalized > "18446744073709551615") return "";
    return normalized;
  }

  function normalizeRobloxPlaceId(value) {
    const digits = String(value == null ? "" : value).trim();
    if (!/^[0-9]{1,20}$/.test(digits) || /^0+$/.test(digits)) return "";
    const normalized = digits.replace(/^0+(?=[0-9])/, "");
    if (normalized.length === 20 && normalized > "18446744073709551615") return "";
    return normalized;
  }

  function normalizeRobloxGameInstanceId(value) {
    const id = String(value == null ? "" : value).trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? id.toLowerCase() : "";
  }

  function readRejoinTarget() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(rejoinTargetKey) || "null"); } catch (_error) { stored = null; }
    const placeId = normalizeRobloxPlaceId(stored && stored.placeId);
    const gameInstanceId = normalizeRobloxGameInstanceId(stored && stored.gameInstanceId);
    return placeId && gameInstanceId ? { placeId: placeId, gameInstanceId: gameInstanceId } : { placeId: "", gameInstanceId: "" };
  }

  function updateRejoinButton() {
    const placeInput = byId("rejoinPlaceId");
    const instanceInput = byId("rejoinGameInstanceId");
    const button = byId("rejoinSameServer");
    const status = byId("rejoinStatus");
    if (!placeInput || !instanceInput || !button || !status) return;
    const placeId = normalizeRobloxPlaceId(placeInput.value);
    const gameInstanceId = normalizeRobloxGameInstanceId(instanceInput.value);
    if (!String(placeInput.value || "").trim() && !String(instanceInput.value || "").trim()) safeStorageRemove(rejoinTargetKey);
    button.disabled = !invoke || !placeId || !gameInstanceId;
    if (!invoke) {
      status.textContent = "A packaged Windows desktop app is required to send a rejoin request; this preview cannot launch Roblox.";
    } else if (placeId && gameInstanceId) {
      status.textContent = "Target ready. IDs stay on this device; Roblox may reject a full, private, closed, or unavailable server.";
    } else {
      status.textContent = "Enter a numeric Place ID and the exact server Job ID (UUID). The app cannot read these from a running game.";
    }
  }

  function updateRobloxProfileButton() {
    const input = byId("robloxUserId");
    const button = byId("openRobloxProfile");
    const note = byId("robloxProfileNote");
    if (!input || !button || !note) return;
    const userId = normalizeRobloxUserId(input.value);
    button.disabled = !invoke || !userId;
    if (!invoke) {
      note.textContent = "The official profile opens from the packaged desktop app. No account login or private profile data is accessed.";
    } else if (userId) {
      note.textContent = "This opens the official public profile in your system browser. Only the numeric ID is saved locally; no login, cookies, or profile scraping.";
    } else {
      note.textContent = "Enter a positive numeric Roblox User ID. Only the public ID is saved locally; no login or private account data is accessed.";
    }
  }

  function normalizeBenchmarkReading(value) {
    if (!value || typeof value !== "object") return null;
    const fps = Number(value.fps);
    const ping = Number(value.ping);
    if (!Number.isFinite(fps) || fps < 0 || fps > 1000 || !Number.isFinite(ping) || ping < 0 || ping > 10000) return null;
    const timestamp = Date.parse(value.recordedAt);
    const modes = ["Reduce building lag", "Maximum performance", "Balanced", "High quality"];
    return {
      fps: Math.round(fps * 10) / 10,
      ping: Math.round(ping * 10) / 10,
      recordedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
      profileMode: modes.includes(value.profileMode) ? value.profileMode : "Unknown profile"
    };
  }

  function readBenchmarkJournal() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(benchmarkJournalKey) || "null"); } catch (_error) { stored = null; }
    const value = stored && typeof stored === "object" ? stored : {};
    const history = Array.isArray(value.history) ? value.history.map(function (entry) {
      if (!entry || typeof entry !== "object") return null;
      const before = normalizeBenchmarkReading(entry.before);
      const after = normalizeBenchmarkReading(entry.after);
      return before && after ? { before: before, after: after } : null;
    }).filter(Boolean).slice(0, 20) : [];
    return { baseline: normalizeBenchmarkReading(value.baseline), history: history };
  }

  function formatBenchmarkNumber(value) {
    return Number.isInteger(value) ? String(value) : Number(value).toFixed(1);
  }

  function formatBenchmarkDate(value, compact) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return "Unknown time";
    return date.toLocaleString(undefined, compact
      ? { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }
      : { dateStyle: "medium", timeStyle: "short" });
  }

  function formatBenchmarkDifference(after, before, unit) {
    const difference = Math.round((after - before) * 10) / 10;
    const sign = difference > 0 ? "+" : (difference < 0 ? "−" : "");
    return sign + formatBenchmarkNumber(Math.abs(difference)) + (unit ? " " + unit : "");
  }

  function renderBenchmarkMetricChart(hostId, entries, metricKey) {
    const host = byId(hostId);
    if (!host) return;
    host.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "benchmark-chart-empty";
      empty.textContent = "Record a manual comparison to start this chart.";
      host.appendChild(empty);
      return;
    }
    const maximum = Math.max(1, ...entries.reduce(function (values, entry) {
      values.push(entry.before[metricKey], entry.after[metricKey]);
      return values;
    }, []));
    entries.forEach(function (entry) {
      const before = Number(entry.before[metricKey]);
      const after = Number(entry.after[metricKey]);
      const group = document.createElement("div");
      group.className = "benchmark-chart-group";
      const date = new Date(entry.after.recordedAt);
      const dateLabel = Number.isFinite(date.getTime())
        ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
        : "Manual";
      group.setAttribute("role", "img");
      group.setAttribute("aria-label", dateLabel + ": before " + formatBenchmarkNumber(before) + ", after " + formatBenchmarkNumber(after));
      const values = document.createElement("span");
      values.className = "benchmark-chart-number";
      values.textContent = formatBenchmarkNumber(before) + " → " + formatBenchmarkNumber(after);
      const bars = document.createElement("div");
      bars.className = "benchmark-chart-values";
      bars.setAttribute("aria-hidden", "true");
      [[before, "is-before"], [after, "is-after"]].forEach(function (reading) {
        const bar = document.createElement("span");
        bar.className = "benchmark-chart-bar " + reading[1];
        bar.style.height = Math.max(3, Math.round((reading[0] / maximum) * 78)) + "px";
        bar.title = formatBenchmarkNumber(reading[0]);
        bars.appendChild(bar);
      });
      const label = document.createElement("span");
      label.className = "benchmark-chart-label";
      label.textContent = dateLabel;
      group.append(values, bars, label);
      host.appendChild(group);
    });
  }

  function renderBenchmarkStoryboard() {
    const entries = state.benchmarkJournal && Array.isArray(state.benchmarkJournal.history)
      ? state.benchmarkJournal.history.slice(0, 6).reverse()
      : [];
    renderBenchmarkMetricChart("benchmarkFpsChart", entries, "fps");
    renderBenchmarkMetricChart("benchmarkPingChart", entries, "ping");
  }

  function renderBenchmarkJournal() {
    if (!state.benchmarkJournal) state.benchmarkJournal = readBenchmarkJournal();
    const journal = state.benchmarkJournal;
    const baselineSummary = byId("benchmarkBaselineSummary");
    const latestSummary = byId("benchmarkLatestSummary");
    const historyHost = byId("benchmarkHistory");
    const afterButton = byId("saveBenchmarkAfter");
    const clearButton = byId("clearBenchmarkJournal");
    if (!baselineSummary || !latestSummary || !historyHost) return;

    if (journal.baseline) {
      const baseline = journal.baseline;
      baselineSummary.textContent = "Baseline saved: " + formatBenchmarkNumber(baseline.fps) + " FPS · " + formatBenchmarkNumber(baseline.ping) + " ms ping · " + baseline.profileMode + " · " + formatBenchmarkDate(baseline.recordedAt, false) + ".";
    } else {
      baselineSummary.textContent = "No baseline saved yet. Enter the values shown in Roblox Shift+F5, then save a baseline.";
    }
    const latest = journal.history[0];
    if (latest) {
      latestSummary.textContent = "Latest difference: FPS " + formatBenchmarkDifference(latest.after.fps, latest.before.fps, "") + " · ping " + formatBenchmarkDifference(latest.after.ping, latest.before.ping, "ms") + ". Before " + latest.before.profileMode + " → after " + latest.after.profileMode + ".";
    } else {
      latestSummary.textContent = journal.baseline
        ? "Baseline ready. Record an after reading when you have tested your changes."
        : "A comparison will show the change in your manually entered FPS and ping.";
    }

    historyHost.replaceChildren();
    if (journal.history.length === 0) {
      const empty = document.createElement("p");
      empty.className = "benchmark-history-empty";
      empty.textContent = "No comparisons recorded.";
      historyHost.appendChild(empty);
    } else {
      journal.history.slice(0, 5).forEach(function (entry) {
        const row = document.createElement("div");
        row.className = "benchmark-history-row";
        const copy = document.createElement("p");
        const title = document.createElement("strong");
        title.textContent = "FPS " + formatBenchmarkNumber(entry.before.fps) + " → " + formatBenchmarkNumber(entry.after.fps) + " (" + formatBenchmarkDifference(entry.after.fps, entry.before.fps, "") + ") · ping " + formatBenchmarkNumber(entry.before.ping) + " → " + formatBenchmarkNumber(entry.after.ping) + " ms (" + formatBenchmarkDifference(entry.after.ping, entry.before.ping, "ms") + ")";
        const details = document.createElement("span");
        details.textContent = "Before " + entry.before.profileMode + " · after " + entry.after.profileMode;
        copy.append(title, details);
        const time = document.createElement("time");
        time.dateTime = entry.after.recordedAt;
        time.textContent = formatBenchmarkDate(entry.after.recordedAt, true);
        row.append(copy, time);
        historyHost.appendChild(row);
      });
    }
    if (afterButton) afterButton.disabled = !journal.baseline;
    if (clearButton) clearButton.disabled = !journal.baseline && journal.history.length === 0;
    renderBenchmarkStoryboard();
  }

  function readBenchmarkInputs(prefix) {
    const fpsInput = byId(prefix + "Fps");
    const pingInput = byId(prefix + "Ping");
    if (!fpsInput || !pingInput || !fpsInput.value.trim() || !pingInput.value.trim()) {
      showToast("Enter both FPS and ping values from Roblox Shift+F5.", "warning");
      return null;
    }
    const fps = Number(fpsInput.value);
    const ping = Number(pingInput.value);
    if (!Number.isFinite(fps) || fps < 0 || fps > 1000 || !Number.isFinite(ping) || ping < 0 || ping > 10000) {
      showToast("Enter FPS from 0–1000 and ping from 0–10000 ms.", "warning");
      return null;
    }
    return {
      fps: Math.round(fps * 10) / 10,
      ping: Math.round(ping * 10) / 10,
      recordedAt: new Date().toISOString(),
      profileMode: currentProfile().mode
    };
  }

  function saveBenchmarkBaseline() {
    const reading = readBenchmarkInputs("benchmarkBefore");
    if (!reading) return;
    if (!state.benchmarkJournal) state.benchmarkJournal = readBenchmarkJournal();
    state.benchmarkJournal.baseline = reading;
    safeStorageSet(benchmarkJournalKey, JSON.stringify(state.benchmarkJournal));
    renderBenchmarkJournal();
    showToast("Baseline saved on this device. Compare using similar gameplay conditions.", "success");
  }

  function saveBenchmarkAfter() {
    if (!state.benchmarkJournal) state.benchmarkJournal = readBenchmarkJournal();
    if (!state.benchmarkJournal.baseline) {
      showToast("Save a before-changes baseline first.", "warning");
      return;
    }
    const reading = readBenchmarkInputs("benchmarkAfter");
    if (!reading) return;
    state.benchmarkJournal.history.unshift({ before: state.benchmarkJournal.baseline, after: reading });
    state.benchmarkJournal.history = state.benchmarkJournal.history.slice(0, 20);
    safeStorageSet(benchmarkJournalKey, JSON.stringify(state.benchmarkJournal));
    renderBenchmarkJournal();
    showToast("Comparison recorded locally. The app does not verify or measure these game values.", "success");
  }

  function clearBenchmarkJournal() {
    state.benchmarkJournal = { baseline: null, history: [] };
    safeStorageSet(benchmarkJournalKey, JSON.stringify(state.benchmarkJournal));
    renderBenchmarkJournal();
    showToast("Local benchmark journal cleared.", "success");
  }

  function normalizeProfile(values) {
    const source = values && typeof values === "object" && !Array.isArray(values) ? values : {};
    return {
      mode: ["Reduce building lag", "Maximum performance", "Balanced", "High quality"].includes(source.mode) ? source.mode : defaultProfile.mode,
      tier: clampInteger(source.tier, 0, 21, defaultProfile.tier),
      texture: clampInteger(source.texture, 0, 3, defaultProfile.texture),
      renderer: ["Auto", "Direct3D 11", "Vulkan", "OpenGL"].includes(source.renderer) ? source.renderer : defaultProfile.renderer,
      fps: clampInteger(source.fps, 60, 1000, defaultProfile.fps),
      legacyFps: typeof source.legacyFps === "boolean" ? source.legacyFps : defaultProfile.legacyFps,
      geometryDistance: clampInteger(source.geometryDistance, 32, 256, defaultProfile.geometryDistance),
      vfx: typeof source.vfx === "boolean" ? source.vfx : defaultProfile.vfx,
      allVersions: typeof source.allVersions === "boolean" ? source.allVersions : defaultProfile.allVersions
    };
  }

  function readProfile() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(profileKey) || "null"); } catch (_error) { stored = null; }
    return normalizeProfile(stored);
  }

  function readAppearance() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(appearanceKey) || "null"); } catch (_error) { stored = null; }
    const values = stored && typeof stored === "object" ? stored : {};
    const accents = ["mint", "amber", "blue", "crimson", "violet", "emerald", "rose", "cyan", "gold"];
    const theme = animeThemes.find(function (item) { return item.id === values.animeTheme; });
    return {
      accent: accents.includes(values.accent) ? values.accent : defaultAppearance.accent,
      iconStyle: ["outline", "bold", "minimal"].includes(values.iconStyle) ? values.iconStyle : defaultAppearance.iconStyle,
      animeTheme: theme ? theme.id : "none"
    };
  }

  function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
  }

  function writeProfile(profile) {
    safeStorageSet(profileKey, JSON.stringify(profile));
  }

  function normalizeProfileName(value) {
    return String(value || "")
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 40);
  }

  function newSavedProfileId() {
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function normalizedTimestamp(value) {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : new Date().toISOString();
  }

  function readSavedProfiles() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(profileLibraryKey) || "null"); } catch (_error) { stored = null; }
    const entries = Array.isArray(stored) ? stored : (stored && Array.isArray(stored.profiles) ? stored.profiles : []);
    const profiles = [];
    const usedNames = new Set();
    const usedIds = new Set();
    entries.forEach(function (entry) {
      if (profiles.length >= maxSavedProfiles || !entry || typeof entry !== "object") return;
      const name = normalizeProfileName(entry.name);
      const key = name.toLocaleLowerCase();
      if (!name || usedNames.has(key) || !entry.profile || typeof entry.profile !== "object" || Array.isArray(entry.profile)) return;
      usedNames.add(key);
      let id = typeof entry.id === "string" && /^[a-z0-9-]{1,64}$/i.test(entry.id) && !usedIds.has(entry.id) ? entry.id : newSavedProfileId();
      while (usedIds.has(id)) id = newSavedProfileId();
      usedIds.add(id);
      profiles.push({
        id: id,
        name: name,
        profile: normalizeProfile(entry.profile),
        createdAt: normalizedTimestamp(entry.createdAt),
        updatedAt: normalizedTimestamp(entry.updatedAt)
      });
    });
    return profiles;
  }

  function writeSavedProfiles() {
    safeStorageSet(profileLibraryKey, JSON.stringify({ schemaVersion: 1, profiles: state.savedProfiles }));
  }

  function updateSavedProfileControls() {
    const selected = state.savedProfiles.find(function (item) { return item.id === state.selectedSavedProfileId; });
    const name = normalizeProfileName(byId("profileNameInput").value);
    const duplicate = name && state.savedProfiles.some(function (item) { return item.name.toLocaleLowerCase() === name.toLocaleLowerCase(); });
    byId("saveNamedProfile").disabled = !name || (state.savedProfiles.length >= maxSavedProfiles && !duplicate);
    byId("loadSavedProfile").disabled = !selected;
    byId("exportSavedProfile").disabled = !selected;
    byId("deleteSavedProfile").disabled = !selected;
  }

  function renderSavedProfiles() {
    const select = byId("profileLibrarySelect");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = state.savedProfiles.length ? "Choose a saved profile…" : "No saved profiles yet";
    select.replaceChildren(placeholder);
    state.savedProfiles.forEach(function (item) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = item.name;
      select.appendChild(option);
    });
    if (!state.savedProfiles.some(function (item) { return item.id === state.selectedSavedProfileId; })) {
      state.selectedSavedProfileId = "";
    }
    select.value = state.selectedSavedProfileId;
    byId("profileLibraryStatus").textContent = state.savedProfiles.length + " of " + maxSavedProfiles + " profiles saved on this device";
    updateSavedProfileControls();
    renderTuningLab();
  }

  function tuningProfileForSelection(selection) {
    if (selection === "current") return { id: "current", name: "Current staged settings", profile: normalizeProfile(currentProfile()), isCurrent: true };
    const id = String(selection || "").startsWith("saved:") ? String(selection).slice(6) : "";
    const item = state.savedProfiles.find(function (entry) { return entry.id === id; });
    return item ? { id: item.id, name: item.name, profile: normalizeProfile(item.profile), isCurrent: false } : null;
  }

  function renderTuningLab() {
    const leftSelect = byId("tuningProfileA");
    const rightSelect = byId("tuningProfileB");
    if (!leftSelect || !rightSelect) return;
    const oldLeft = leftSelect.value;
    const oldRight = rightSelect.value;
    [leftSelect, rightSelect].forEach(function (select) {
      const options = [document.createElement("option")];
      options[0].value = "current";
      options[0].textContent = "Current staged settings";
      state.savedProfiles.forEach(function (item) {
        const option = document.createElement("option");
        option.value = "saved:" + item.id;
        option.textContent = item.name;
        options.push(option);
      });
      select.replaceChildren.apply(select, options);
    });
    const valid = function (select, value) { return Array.from(select.options).some(function (option) { return option.value === value; }); };
    leftSelect.value = valid(leftSelect, oldLeft) ? oldLeft : "current";
    rightSelect.value = valid(rightSelect, oldRight) ? oldRight : (state.savedProfiles.length ? "saved:" + state.savedProfiles[0].id : "current");
    renderTuningComparison();
  }

  function formatTuningValue(key, profile) {
    const textureNames = ["Lowest", "Low", "Medium", "Highest"];
    switch (key) {
      case "mode": return profile.mode;
      case "tier": return profile.tier + " / 21";
      case "texture": return profile.texture + " / 3 · " + (textureNames[profile.texture] || "Custom");
      case "renderer": return profile.renderer === "Auto" ? "System default" : profile.renderer;
      case "fps": return profile.legacyFps ? profile.fps + " FPS · experimental request" : "Off";
      case "geometryDistance": return profile.geometryDistance + " studs";
      case "vfx": return profile.vfx ? "Reduced sky / voxelizer effects" : "Standard effects";
      case "allVersions": return profile.allVersions ? "All detected versions" : "First detected settings file";
      default: return "—";
    }
  }

  function renderTuningComparison() {
    const host = byId("tuningDiffList");
    const summary = byId("tuningComparisonSummary");
    const leftSelect = byId("tuningProfileA");
    const rightSelect = byId("tuningProfileB");
    const stageLeft = byId("stageTuningProfileA");
    const stageRight = byId("stageTuningProfileB");
    if (!host || !summary || !leftSelect || !rightSelect) return;
    const left = tuningProfileForSelection(leftSelect.value);
    const right = tuningProfileForSelection(rightSelect.value);
    host.replaceChildren();
    if (!left || !right) {
      summary.textContent = "Choose two available profiles. Save or import named profiles in Settings · Rendering.";
      if (stageLeft) stageLeft.disabled = true;
      if (stageRight) stageRight.disabled = true;
      return;
    }
    const fields = [
      ["mode", "Optimization profile"],
      ["tier", "Graphics quality"],
      ["texture", "Texture quality"],
      ["renderer", "Renderer"],
      ["fps", "Experimental FPS request"],
      ["geometryDistance", "Geometry LOD distance"],
      ["vfx", "Optional effects"],
      ["allVersions", "Target versions"]
    ];
    const header = document.createElement("div");
    header.className = "tuning-diff-head";
    ["Setting", left.name, right.name].forEach(function (text) {
      const cell = document.createElement("span");
      cell.textContent = text;
      header.appendChild(cell);
    });
    host.appendChild(header);
    let changed = 0;
    fields.forEach(function (field) {
      const leftValue = formatTuningValue(field[0], left.profile);
      const rightValue = formatTuningValue(field[0], right.profile);
      const differs = leftValue !== rightValue;
      if (differs) changed += 1;
      const row = document.createElement("div");
      row.className = "tuning-diff-row" + (differs ? " is-changed" : "");
      row.setAttribute("role", "listitem");
      row.setAttribute("aria-label", field[1] + (differs ? ": differs" : ": matches"));
      const label = document.createElement("span");
      label.className = "tuning-diff-label";
      label.textContent = field[1];
      const leftCell = document.createElement("span");
      leftCell.className = "tuning-diff-value";
      leftCell.textContent = leftValue;
      const rightCell = document.createElement("span");
      rightCell.className = "tuning-diff-value";
      rightCell.textContent = rightValue;
      row.append(label, leftCell, rightCell);
      host.appendChild(row);
    });
    summary.textContent = changed
      ? changed + " of " + fields.length + " compared settings differ. Comparison is read-only; no profile or Roblox file was changed."
      : "These profiles match across all " + fields.length + " compared settings. Comparison is read-only; no file was changed.";
    if (stageLeft) stageLeft.disabled = left.isCurrent;
    if (stageRight) stageRight.disabled = right.isCurrent;
  }

  function stageTuningProfile(selection) {
    const selected = tuningProfileForSelection(selection);
    if (!selected || selected.isCurrent) return;
    state.geometryManuallyChanged = true;
    applyProfileToControls(selected.profile);
    byId("profileNameInput").value = selected.name;
    showToast(selected.name + " staged in Settings. Review it and confirm Apply to write local settings.", "success");
  }

  function upsertSavedProfile(nameValue, profileValue) {
    const name = normalizeProfileName(nameValue);
    if (!name) return "invalid";
    const existing = state.savedProfiles.find(function (item) { return item.name.toLocaleLowerCase() === name.toLocaleLowerCase(); });
    const now = new Date().toISOString();
    if (existing) {
      existing.name = name;
      existing.profile = normalizeProfile(profileValue);
      existing.updatedAt = now;
      state.selectedSavedProfileId = existing.id;
      writeSavedProfiles();
      renderSavedProfiles();
      return "updated";
    }
    if (state.savedProfiles.length >= maxSavedProfiles) return "limit";
    const item = { id: newSavedProfileId(), name: name, profile: normalizeProfile(profileValue), createdAt: now, updatedAt: now };
    state.savedProfiles.push(item);
    state.selectedSavedProfileId = item.id;
    writeSavedProfiles();
    renderSavedProfiles();
    return "created";
  }

  function saveNamedProfile() {
    const input = byId("profileNameInput");
    const name = normalizeProfileName(input.value);
    if (!name) {
      showToast("Enter a name for this local profile first.", "warning");
      input.focus();
      return;
    }
    const result = upsertSavedProfile(name, currentProfile());
    if (result === "limit") {
      showToast("The local library is full. Delete a profile before saving another.", "warning");
      return;
    }
    input.value = name;
    showToast(result === "updated" ? "Saved profile updated on this device." : "Named profile saved on this device.", "success");
  }

  function loadSelectedProfile() {
    const item = state.savedProfiles.find(function (entry) { return entry.id === state.selectedSavedProfileId; });
    if (!item) return;
    state.geometryManuallyChanged = true;
    applyProfileToControls(normalizeProfile(item.profile));
    byId("profileNameInput").value = item.name;
    updateSavedProfileControls();
    showToast("Profile loaded and staged. Review it, then use Apply settings to write changes.", "success");
  }

  function exportSelectedProfile() {
    const item = state.savedProfiles.find(function (entry) { return entry.id === state.selectedSavedProfileId; });
    if (!item) return;
    const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "profile";
    downloadJson("marktis-profile-" + slug + ".json", {
      schemaVersion: 1,
      product: "Marktis Optimizer",
      name: item.name,
      profile: item.profile
    });
    showToast("Profile exported as a JSON file.", "success");
  }

  function isValidImportedProfile(profile) {
    return profile && typeof profile === "object" && !Array.isArray(profile)
      && ["Reduce building lag", "Maximum performance", "Balanced", "High quality"].includes(profile.mode)
      && Number.isInteger(profile.tier) && profile.tier >= 0 && profile.tier <= 21
      && Number.isInteger(profile.texture) && profile.texture >= 0 && profile.texture <= 3
      && ["Auto", "Direct3D 11", "Vulkan", "OpenGL"].includes(profile.renderer)
      && Number.isInteger(profile.fps) && profile.fps >= 60 && profile.fps <= 1000
      && typeof profile.legacyFps === "boolean"
      && Number.isInteger(profile.geometryDistance) && profile.geometryDistance >= 32 && profile.geometryDistance <= 256
      && typeof profile.vfx === "boolean"
      && typeof profile.allVersions === "boolean";
  }

  async function importSavedProfile(file) {
    if (!file) return;
    try {
      if (file.size > maxProfileImportBytes) throw new Error("Profile files must be 64 KB or smaller.");
      if (typeof file.text !== "function") throw new Error("This desktop runtime cannot read the selected file.");
      const imported = JSON.parse(await file.text());
      if (!imported || imported.schemaVersion !== 1 || imported.product !== "Marktis Optimizer" || !isValidImportedProfile(imported.profile)) {
        throw new Error("Choose a valid Marktis Optimizer profile JSON file.");
      }
      const fileName = String(file.name || "").replace(/\.json$/i, "");
      const name = normalizeProfileName(imported.name || fileName || "Imported profile");
      if (!name) throw new Error("The profile name is empty or invalid.");
      const result = upsertSavedProfile(name, imported.profile);
      if (result === "limit") {
        showToast("The local library is full. Delete a profile before importing another.", "warning");
        return;
      }
      byId("profileNameInput").value = name;
      updateSavedProfileControls();
      showToast(result === "updated" ? "Imported profile updated the matching local entry." : "Profile imported to this device. Load it when you are ready.", "success");
    } catch (error) {
      showToast(error && error.message ? error.message : "Could not import the profile file.", "error");
    } finally {
      byId("importSavedProfileFile").value = "";
    }
  }

  function deleteSelectedProfile() {
    const item = state.savedProfiles.find(function (entry) { return entry.id === state.selectedSavedProfileId; });
    if (!item) return false;
    state.savedProfiles = state.savedProfiles.filter(function (entry) { return entry.id !== item.id; });
    state.selectedSavedProfileId = "";
    writeSavedProfiles();
    renderSavedProfiles();
    showToast("Saved profile deleted from this device; Roblox settings were not changed.", "success");
    return true;
  }

  function writeAppearance(appearance) {
    safeStorageSet(appearanceKey, JSON.stringify(appearance));
  }

  function currentProfile() {
    return {
      mode: byId("modeSelect").value,
      tier: clampInteger(byId("graphicsQuality").value, 0, 21, defaultProfile.tier),
      texture: clampInteger(byId("textureQuality").value, 0, 3, defaultProfile.texture),
      renderer: byId("rendererSelect").value,
      fps: clampInteger(byId("fpsTarget").value, 60, 1000, defaultProfile.fps),
      legacyFps: byId("legacyFpsToggle").checked,
      geometryDistance: clampInteger(byId("geometryDistance").value, 32, 256, defaultProfile.geometryDistance),
      vfx: byId("vfxToggle").checked,
      allVersions: byId("allVersionsToggle").checked
    };
  }

  function applyProfileToControls(profile) {
    byId("modeSelect").value = profile.mode;
    byId("graphicsQuality").value = String(profile.tier);
    byId("textureQuality").value = String(profile.texture);
    byId("rendererSelect").value = profile.renderer;
    byId("legacyFpsToggle").checked = profile.legacyFps;
    byId("fpsTarget").value = String(profile.fps);
    byId("fpsTarget").disabled = !profile.legacyFps;
    byId("geometryDistance").value = String(profile.geometryDistance);
    byId("vfxToggle").checked = profile.vfx;
    byId("allVersionsToggle").checked = profile.allVersions;
    updateProfileDisplay();
  }

  function scheduleProfileSave() {
    window.clearTimeout(state.saveTimer);
    state.saveTimer = window.setTimeout(function () { writeProfile(currentProfile()); }, 180);
  }

  function updateProfileDisplay() {
    const profile = currentProfile();
    const graphicsOut = byId("graphicsQualityValue");
    const textureOut = byId("textureQualityValue");
    const fpsOut = byId("fpsTargetValue");
    if (graphicsOut) graphicsOut.value = String(profile.tier);
    if (textureOut) textureOut.value = String(profile.texture);
    if (fpsOut) fpsOut.value = String(profile.fps);
    const textureNames = ["Lowest", "Low", "Medium", "Highest"];
    byId("textureQualityName").textContent = textureNames[profile.texture] || "Custom";
    byId("fpsTarget").disabled = !profile.legacyFps;
    byId("geometryDistanceValue").textContent = String(profile.geometryDistance);
    byId("lodBase").textContent = String(profile.geometryDistance);
    byId("lodL12").textContent = String(profile.geometryDistance);
    byId("lodL23").textContent = String(Math.floor(profile.geometryDistance / 2));
    byId("lodL34").textContent = String(Math.floor(profile.geometryDistance / 4));
    byId("profileTitle").textContent = profile.mode;
    byId("profileModeLabel").textContent = profile.mode === "Balanced" ? "BALANCED" : (profile.mode === "High quality" ? "HIGH DETAIL" : "PERFORMANCE");
    byId("summaryGraphics").textContent = profile.tier + " / 21";
    byId("summaryTexture").textContent = profile.texture + " / 3 · " + (textureNames[profile.texture] || "Custom");
    byId("summaryRenderer").textContent = profile.renderer === "Auto" ? "System default" : profile.renderer;
    byId("summaryGeometry").textContent = profile.geometryDistance + " studs";
    byId("summaryFps").textContent = profile.legacyFps ? profile.fps + " FPS · request" : "Off";
    byId("systemFpsTarget").textContent = profile.legacyFps ? profile.fps + " FPS requested · not measured" : "Off";
    updatePresetButtons(profile);
    scheduleProfileSave();
    renderTuningComparison();
  }

  const renderingPresets = {
    low: { mode: "Maximum performance", tier: 6, texture: 0, renderer: "Auto", geometryDistance: 64, vfx: true },
    balanced: { mode: "Balanced", tier: 12, texture: 1, renderer: "Auto", geometryDistance: 128, vfx: false },
    quality: { mode: "High quality", tier: 21, texture: 3, renderer: "Auto", geometryDistance: 256, vfx: false }
  };

  function presetMatches(profile, preset) {
    return profile.mode === preset.mode
      && profile.tier === preset.tier
      && profile.texture === preset.texture
      && profile.geometryDistance === preset.geometryDistance
      && profile.vfx === preset.vfx;
  }

  function updatePresetButtons(profile) {
    document.querySelectorAll("[data-preset]").forEach(function (button) {
      const preset = renderingPresets[button.dataset.preset];
      const selected = Boolean(preset && presetMatches(profile, preset));
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });
  }

  function applyRenderingPreset(name, fromRecommendation) {
    const preset = renderingPresets[name];
    if (!preset) return;
    state.geometryManuallyChanged = true;
    const profile = Object.assign({}, currentProfile(), preset);
    applyProfileToControls(profile);
    showToast(fromRecommendation
      ? "Suggested graphics preset staged. Review it, then confirm Apply to write local settings."
      : "Graphics preset staged locally. Review it, then confirm Apply to write local settings.", "success");
  }

  function renderAnimeThemes(selectedOverride) {
    const host = byId("animeThemeGrid");
    if (!host) return;
    const count = byId("animeThemeCount");
    const clearButton = byId("clearAnimeTheme");
    const needle = byId("animeThemeSearch").value.trim().toLowerCase();
    const selected = typeof selectedOverride === "string" ? selectedOverride : readAppearance().animeTheme;
    const matches = animeThemes.filter(function (theme) {
      return !needle || (theme.name + " " + theme.series).toLowerCase().includes(needle);
    });
    host.replaceChildren();
    if (count) count.textContent = needle
      ? matches.length + " of " + animeThemes.length + " themes"
      : animeThemes.length + " local themes";
    if (clearButton) clearButton.disabled = selected === "none";
    if (!matches.length) {
      const empty = document.createElement("p");
      empty.className = "anime-theme-empty";
      empty.textContent = "No matching themes. Try a character name or anime series.";
      host.appendChild(empty);
      return;
    }
    matches.forEach(function (theme) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "anime-theme-card" + (selected === theme.id ? " is-selected" : "");
      button.dataset.animeThemeId = theme.id;
      button.setAttribute("aria-pressed", selected === theme.id ? "true" : "false");
      button.setAttribute("aria-label", "Use " + theme.name + " theme from " + theme.series);
      const image = document.createElement("img");
      image.src = "assets/themes/" + theme.file;
      image.alt = "";
      image.loading = "lazy";
      image.draggable = false;
      const copy = document.createElement("span");
      copy.className = "anime-theme-copy";
      const title = document.createElement("strong");
      title.textContent = theme.name;
      const series = document.createElement("small");
      series.textContent = theme.series;
      copy.append(title, series);
      button.append(image, copy);
      host.appendChild(button);
    });
  }

  function selectAnimeTheme(id) {
    const theme = animeThemes.find(function (item) { return item.id === id; });
    const appearance = readAppearance();
    appearance.animeTheme = theme ? theme.id : "none";
    if (theme) appearance.accent = theme.accent;
    applyAppearance(appearance);
    showToast(theme ? theme.name + " theme applied locally." : "Anime background cleared; the local accent is unchanged.", "success");
  }

  function applyAppearance(appearance) {
    const theme = animeThemes.find(function (item) { return item.id === appearance.animeTheme; });
    document.documentElement.dataset.accent = appearance.accent;
    document.documentElement.dataset.iconStyle = appearance.iconStyle;
    document.documentElement.dataset.animeTheme = theme ? theme.id : "none";
    document.documentElement.style.setProperty("--anime-theme-image", theme ? "url(assets/themes/" + theme.file + ")" : "none");
    document.querySelectorAll("[data-accent-choice]").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.accentChoice === appearance.accent);
      button.setAttribute("aria-pressed", button.dataset.accentChoice === appearance.accent ? "true" : "false");
    });
    document.querySelectorAll("[data-icon-style-choice]").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.iconStyleChoice === appearance.iconStyle);
      button.setAttribute("aria-pressed", button.dataset.iconStyleChoice === appearance.iconStyle ? "true" : "false");
    });
    renderAnimeThemes(appearance.animeTheme);
    writeAppearance(appearance);
  }

  function renderVersionGarden(result, error) {
    const host = byId("versionGardenList");
    const summary = byId("versionGardenSummary");
    if (!host || !summary) return;
    host.replaceChildren();
    if (error || !result) {
      summary.textContent = "Local map unavailable";
      const empty = document.createElement("p");
      empty.className = "version-garden-empty";
      empty.textContent = error || "The packaged Windows app is required to scan Roblox version folders.";
      host.appendChild(empty);
      return;
    }
    const versions = Array.isArray(result.versions) ? result.versions : [];
    const settingsCount = versions.filter(function (version) { return Boolean(version && version.hasSettings); }).length;
    summary.textContent = versions.length + " version folder" + (versions.length === 1 ? "" : "s") + " · " + settingsCount + " settings file" + (settingsCount === 1 ? "" : "s") + " found";
    if (!versions.length) {
      const empty = document.createElement("p");
      empty.className = "version-garden-empty";
      empty.textContent = "No Roblox version folders were found in the standard Windows locations. Re-scan after installing or opening the Roblox desktop client.";
      host.appendChild(empty);
      return;
    }
    versions.forEach(function (version, index) {
      if (!version || typeof version !== "object") return;
      const card = document.createElement("article");
      card.className = "version-garden-item";
      const heading = document.createElement("div");
      heading.className = "version-garden-item-head";
      const number = document.createElement("span");
      number.className = "version-garden-number";
      number.textContent = String(index + 1).padStart(2, "0");
      number.setAttribute("aria-hidden", "true");
      const name = document.createElement("h3");
      name.textContent = String(version.name || "Unnamed version folder");
      heading.append(number, name);
      card.appendChild(heading);
      const chips = document.createElement("div");
      chips.className = "version-garden-chips";
      [["Player", Boolean(version.hasPlayer)], ["Studio", Boolean(version.hasStudio)], ["Settings JSON", Boolean(version.hasSettings)]].forEach(function (item) {
        const chip = document.createElement("span");
        chip.className = "version-garden-chip";
        chip.dataset.found = item[1] ? "true" : "false";
        chip.textContent = item[0] + " · " + (item[1] ? "FOUND" : "MISSING");
        chips.appendChild(chip);
      });
      card.appendChild(chips);
      const settings = document.createElement("p");
      settings.className = "version-garden-settings";
      settings.textContent = version.hasSettings ? "Settings file detected:" : "Expected settings file location (not found):";
      const settingsPath = document.createElement("code");
      settingsPath.className = "version-garden-path";
      settingsPath.textContent = typeof version.settingsPath === "string" && version.settingsPath
        ? version.settingsPath
        : "Path unavailable from local scan.";
      settings.appendChild(settingsPath);
      card.appendChild(settings);
      const versionPath = document.createElement("code");
      versionPath.className = "version-garden-path";
      versionPath.textContent = "Version folder: " + String(version.path || "Path unavailable");
      card.appendChild(versionPath);
      host.appendChild(card);
    });
  }

  function renderDetection(result, error) {
    state.detection = result || null;
    renderVersionGarden(result, error);
    const badge = byId("installBadge");
    const title = byId("installTitle");
    const detail = byId("installDetail");
    const versionCount = byId("versionCount");
    const settingsCount = byId("settingsCount");
    if (error || !result) {
      badge.textContent = "UNAVAILABLE";
      badge.className = "state-pill state-error";
      title.textContent = "Installation scan unavailable";
      detail.textContent = error || "The Windows app could not read the standard Roblox install folders.";
      versionCount.textContent = "—";
      settingsCount.textContent = "—";
      renderSystemClientStatus();
      return;
    }
    const versions = Array.isArray(result.versions) ? result.versions : [];
    const settings = Array.isArray(result.clientSettingsPaths) ? result.clientSettingsPaths : [];
    versionCount.textContent = String(versions.length);
    settingsCount.textContent = String(settings.length);
    if (result.installed) {
      badge.textContent = "INSTALLED";
      badge.className = "state-pill state-found";
      title.textContent = "Roblox was detected";
      detail.textContent = settings.length ? "Install folders were found. Existing local settings can be managed safely." : "Install folders were found; no existing ClientAppSettings file was detected.";
    } else {
      badge.textContent = "NOT FOUND";
      badge.className = "state-pill state-missing";
      title.textContent = "Roblox wasn't detected";
      detail.textContent = result.message || "Install the Roblox desktop client, then scan again.";
    }
    renderSystemClientStatus();
  }

  const troubleshootingGuides = {
    "not-detected": {
      title: "Roblox was not detected",
      steps: [
        "This scan checks standard Windows Roblox folders only. Install or open the Roblox desktop client once, then re-scan.",
        "Use the Version Garden to review every discovered folder and its Player, Studio, and settings-file status.",
        "If Roblox is installed in a nonstandard location, this read-only scanner may not find it; it does not search the whole drive."
      ],
      action: "rescan",
      label: "Re-scan Roblox folders"
    },
    "settings-not-applying": {
      title: "Settings do not seem to apply",
      steps: [
        "In Version Garden, check which detected ClientAppSettings.json paths exist. The map reports file presence, not whether Roblox honors a flag.",
        "Open Settings · Rendering, review the staged allowlisted values, then choose Apply settings and confirm. A timestamped backup is created before a successful write.",
        "Close and restart Roblox after applying. Roblox may ignore, replace, or change the behavior of a setting; no performance result is guaranteed."
      ],
      action: "rendering",
      label: "Open Rendering settings"
    },
    "fps-ping": {
      title: "FPS or experience ping did not change",
      steps: [
        "Use Roblox Shift+F5 and type the displayed FPS and experience ping into the manual journal; the app never reads live game values.",
        "For a useful comparison, record both readings in the same experience and conditions. Network, server, device, and game changes can affect results.",
        "The optional website TCP probe is not game-server ping. Settings do not guarantee higher FPS, lower ping, or a lag-free session."
      ],
      action: "benchmark",
      label: "Open benchmark journal"
    },
    restore: {
      title: "Restore managed settings",
      steps: [
        "Choose Restore managed settings in Settings. The app asks for confirmation before changing any local file.",
        "Restore removes only keys Marktis manages and keeps unrelated JSON keys. A backup of the current file is created first.",
        "Restart Roblox to let it read the restored file. Restore is available only when a usable local ClientSettings file is detected."
      ],
      action: "restore",
      label: "Review restore confirmation"
    },
    wireguard: {
      title: "WireGuard will not connect",
      steps: [
        "Confirm the official WireGuard for Windows client is installed and the .conf profile came from your VPN provider. Marktis does not provide a VPN server.",
        "Connecting or disconnecting the tunnel requires Windows administrator approval. Check the provider’s endpoint, DNS, and AllowedIPs in its own support material.",
        "A full-tunnel profile may route all traffic or trigger firewall behavior. Never share the profile’s private key; a VPN can increase ping."
      ],
      action: "vpn",
      label: "Open WireGuard settings"
    }
  };

  function renderTroubleshootingGuide() {
    const select = byId("troubleshootingIssue");
    const title = byId("troubleshootingAnswerTitle");
    const steps = byId("troubleshootingSteps");
    const action = byId("troubleshootingAction");
    if (!select || !title || !steps || !action) return;
    const guide = troubleshootingGuides[select.value] || troubleshootingGuides["not-detected"];
    title.textContent = guide.title;
    steps.replaceChildren();
    guide.steps.forEach(function (text) {
      const item = document.createElement("li");
      item.textContent = text;
      steps.appendChild(item);
    });
    action.textContent = guide.label;
    action.dataset.troubleshootingAction = guide.action;
    action.disabled = !invoke && ["rescan", "restore"].includes(guide.action);
  }

  function runTroubleshootingAction() {
    const action = byId("troubleshootingAction").dataset.troubleshootingAction;
    if (action === "rescan") { detectRoblox(); return; }
    if (action === "rendering") { setSettingsTab("rendering"); return; }
    if (action === "benchmark") { byId("benchmarkTitle").scrollIntoView({ behavior: "smooth", block: "start" }); return; }
    if (action === "restore") { openConfirmation("restore"); return; }
    if (action === "vpn") setSettingsTab("vpn");
  }

  function formatPlayerObservationDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map(function (value) { return String(value).padStart(2, "0"); }).join(":");
  }

  function renderPlayerRuntime(result, error) {
    const watch = byId("playerRuntimeWatch");
    const stateLabel = byId("playerRuntimeState");
    const duration = byId("playerObservedDuration");
    const note = byId("playerRuntimeNote");
    if (!watch || !stateLabel || !duration || !note) return;
    if (!invoke || (result && !result.supported)) {
      state.playerObservedAt = null;
      watch.dataset.state = "idle";
      stateLabel.textContent = "DESKTOP ONLY";
      duration.textContent = "00:00:00";
      note.textContent = "Available in the packaged Windows app; this is never exact game-session time.";
      return;
    }
    if (error || !result || !result.available) {
      state.playerObservedAt = null;
      watch.dataset.state = "paused";
      stateLabel.textContent = "CHECK UNAVAILABLE";
      duration.textContent = "00:00:00";
      note.textContent = "The local process check could not confirm status; the observation timer has reset.";
      return;
    }
    if (!result.running) {
      state.playerObservedAt = null;
      watch.dataset.state = "idle";
      stateLabel.textContent = "STANDBY";
      duration.textContent = "00:00:00";
      note.textContent = "Waiting for RobloxPlayerBeta.exe. An open Player process does not mean an experience is loaded.";
      return;
    }
    if (state.playerObservedAt === null) state.playerObservedAt = performance.now();
    watch.dataset.state = "running";
    stateLabel.textContent = "PROCESS OBSERVED";
    duration.textContent = formatPlayerObservationDuration(performance.now() - state.playerObservedAt);
    note.textContent = "Approximate time since this app first observed RobloxPlayerBeta.exe running. Resets if the process is not detected, a status check fails, or the app closes; not an in-game session timer.";
  }

  function updatePlayerRuntime() {
    if (state.playerObservedAt === null) return;
    const duration = byId("playerObservedDuration");
    if (duration) duration.textContent = formatPlayerObservationDuration(performance.now() - state.playerObservedAt);
  }

  function renderActivePlayer(result, error) {
    const previous = state.activePlayer;
    if (previous && previous.supported && previous.available && result && result.supported && result.available && typeof previous.running === "boolean" && typeof result.running === "boolean" && previous.running !== result.running) {
      addAppNotification(
        result.running ? "Roblox Player opened" : "Roblox Player closed",
        "Windows process-name check: " + (result.running ? "RobloxPlayerBeta.exe is running." : "RobloxPlayerBeta.exe is no longer running."),
        "playerStatus",
        "default"
      );
    }
    state.activePlayer = result || null;
    renderPlayerRuntime(result, error);
    const badge = byId("playerBadge");
    const title = byId("playerTitle");
    const detail = byId("playerDetail");
    if (error || !result) {
      badge.textContent = "UNAVAILABLE";
      badge.className = "state-pill state-error";
      title.textContent = "Player status unavailable";
      detail.textContent = error || "The Player process could not be checked.";
      renderSystemClientStatus();
      return;
    }
    if (!result.supported) {
      badge.textContent = "WINDOWS ONLY";
      badge.className = "state-pill state-pending";
      title.textContent = "Windows app required";
      detail.textContent = result.message || "Live Player presence is available in the Windows desktop client.";
    } else if (!result.available) {
      badge.textContent = "RETRY";
      badge.className = "state-pill state-error";
      title.textContent = "Player status unavailable";
      detail.textContent = result.message || "Refresh to retry the read-only process-name check.";
    } else if (result.running) {
      badge.textContent = "PROCESS OPEN";
      badge.className = "state-pill state-running";
      title.textContent = "Roblox Player is open";
      detail.textContent = "Only the Player process name was detected; an active experience is not confirmed.";
    } else {
      badge.textContent = "NOT RUNNING";
      badge.className = "state-pill state-idle";
      title.textContent = "Roblox Player is not running";
      detail.textContent = "The read-only process-name check did not find RobloxPlayerBeta.exe.";
    }
    renderSystemClientStatus();
  }

  async function detectRoblox() {
    if (!invoke) {
      renderDetection(null, "The desktop runtime is required for Windows install detection.");
      return null;
    }
    byId("installBadge").textContent = "SCANNING";
    byId("installBadge").className = "state-pill state-pending";
    byId("installTitle").textContent = "Checking local folders";
    byId("installDetail").textContent = "Read-only scan of standard Roblox install locations.";
    setBoot("Scanning standard Roblox folders…", 54);
    try {
      const result = await invoke("detect_roblox");
      renderDetection(result);
      return result;
    } catch (error) {
      renderDetection(null, error && error.message ? error.message : String(error));
      return null;
    }
  }

  async function refreshPlayerStatus() {
    if (state.statusPending) return null;
    if (!invoke) {
      renderActivePlayer({ supported: false, available: false, running: false, message: "The desktop runtime is required for Windows Player detection." });
      return null;
    }
    state.statusPending = true;
    const button = byId("refreshPlayer");
    if (button) button.disabled = true;
    try {
      const result = await invoke("active_roblox_status");
      renderActivePlayer(result);
      return result;
    } catch (error) {
      renderActivePlayer(null, error && error.message ? error.message : String(error));
      return null;
    } finally {
      state.statusPending = false;
      if (button) button.disabled = false;
    }
  }

  function renderSafetyScan(result, error) {
    const badge = byId("safetyScanBadge");
    const detail = byId("safetyScanDetail");
    const matchesHost = byId("safetyMatches");
    const scanButton = byId("scanSafety");
    const appsButton = byId("openInstalledApps");
    const securityButton = byId("openWindowsSecurity");
    const securityStatus = byId("securityScanStatus");
    const securityScanButton = byId("securityRescanProcesses");
    const securityOpenButton = byId("securityOpenWindowsSecurity");
    const securityProtectionButton = byId("securityOpenProtection");
    const matches = result && Array.isArray(result.matches) ? result.matches : [];
    matchesHost.replaceChildren();
    appsButton.hidden = true;
    securityButton.hidden = !invoke;
    scanButton.disabled = !invoke || state.safetyScanPending;
    if (securityScanButton) securityScanButton.disabled = !invoke || state.safetyScanPending;
    if (securityOpenButton) securityOpenButton.disabled = !invoke;
    if (securityProtectionButton) securityProtectionButton.disabled = !invoke;

    function addSummary(message) {
      const summary = document.createElement("p");
      summary.className = "safety-match-summary";
      summary.textContent = message;
      matchesHost.appendChild(summary);
    }

    if (!invoke || (result && !result.supported)) {
      badge.textContent = "DESKTOP ONLY";
      badge.className = "state-pill state-pending";
      detail.textContent = "The local process-name check runs only in the packaged Windows app.";
      addSummary(error || "No process scan runs in the website preview.");
      if (securityStatus) securityStatus.textContent = "The exact-name watchlist runs only in the packaged Windows app; it is not a file or malware scan.";
      return;
    }

    if (matches.length) {
      badge.textContent = result.available ? "REVIEW MATCH" : "PARTIAL SCAN";
      badge.className = "state-pill state-missing";
      detail.textContent = result.message || "Review the possible process-name match before launching Roblox.";
      matches.forEach(function (match) {
        const row = document.createElement("div");
        row.className = "safety-match-item";
        const product = document.createElement("strong");
        product.textContent = String(match.productName || "Known process name");
        const process = document.createElement("code");
        process.textContent = String(match.processName || "");
        row.append(product, process);
        matchesHost.appendChild(row);
      });
      addSummary("Potential malware/executor warning: a watched process name is present. This is not a malware verdict; use Windows Security → Virus & threat protection → Quick scan to check files.");
      if (!result.available) addSummary("The scan was incomplete; displayed matches are still name-only results.");
      if (securityStatus) {
        const matchedNames = matches.map(function (match) { return String(match.productName || match.processName || "watched name"); });
        securityStatus.textContent = "Potential process-name match: " + matchedNames.join(", ") + ". This does not prove malware; use Defender to scan files.";
      }
      appsButton.hidden = false;
      securityButton.hidden = false;
      scanButton.disabled = state.safetyScanPending;
      return;
    }

    if (error || !result || !result.available) {
      badge.textContent = "UNAVAILABLE";
      badge.className = "state-pill state-error";
      detail.textContent = error || (result && result.message) || "The local process-name check could not complete.";
      addSummary("No clean result is claimed when a scan is unavailable.");
      if (securityStatus) securityStatus.textContent = "The limited process-name check could not complete: " + (error || (result && result.message) || "result unavailable") + ". This is not an antivirus scan.";
      return;
    }

    badge.textContent = "NO MATCH";
    badge.className = "state-pill state-found";
    detail.textContent = result.message;
    addSummary("No exact Xeno.exe, Solara.exe, JJSploit.exe, or Delta.exe process name was found. This is not an antivirus verdict.");
    if (securityStatus) securityStatus.textContent = "No watched exact process name was found in this limited check. Files, inactive apps, and renamed processes are not scanned.";
  }

  function renderWireGuardStatus(result, error) {
    const badge = byId("wireguardStatusBadge");
    const detail = byId("wireguardStatusDetail");
    const profileDetail = byId("wireguardProfileDetail");
    const importButton = byId("wireguardImportButton");
    const connectButton = byId("wireguardConnectButton");
    const disconnectButton = byId("wireguardDisconnectButton");
    const removeButton = byId("wireguardRemoveButton");
    const refreshButton = byId("wireguardRefreshButton");
    const downloadButton = byId("wireguardDownloadButton");
    state.wireguardStatus = result || null;

    if (!invoke) {
      badge.textContent = "DESKTOP ONLY";
      badge.className = "state-pill state-pending";
      detail.textContent = "WireGuard integration is available only in the packaged Windows desktop app.";
      profileDetail.textContent = "No provider profile is read or stored in the website preview.";
    } else if (error || !result) {
      badge.textContent = "STATUS UNAVAILABLE";
      badge.className = "state-pill state-error";
      detail.textContent = error || "Windows could not return the WireGuard status.";
      profileDetail.textContent = "No connection or profile status is assumed when Windows cannot be queried.";
    } else if (!result.supported) {
      badge.textContent = "WINDOWS ONLY";
      badge.className = "state-pill state-pending";
      detail.textContent = result.message || "WireGuard integration is available only on Windows.";
      profileDetail.textContent = "Use the official WireGuard app on a supported Windows device.";
    } else if (!result.serviceQueryAvailable) {
      badge.textContent = "STATUS UNAVAILABLE";
      badge.className = "state-pill state-error";
      detail.textContent = result.message || "Windows could not confirm tunnel-service state.";
      profileDetail.textContent = "VPN actions are disabled until the current service status can be verified.";
    } else if (result.servicePresent && !result.serviceManaged) {
      badge.textContent = "NAME CONFLICT";
      badge.className = "state-pill state-error";
      detail.textContent = result.message || "A tunnel uses the reserved service name but cannot be verified as this app's profile.";
      profileDetail.textContent = "Marktis leaves unrecognized WireGuard services untouched. Resolve the name conflict in WireGuard for Windows, then refresh.";
    } else if (!result.wireguardInstalled) {
      badge.textContent = "CLIENT REQUIRED";
      badge.className = "state-pill state-pending";
      detail.textContent = result.message || "Install the official WireGuard for Windows client first.";
      profileDetail.textContent = "The app does not bundle WireGuard binaries or a VPN provider subscription.";
    } else if (result.serviceManaged && !result.profileFilePresent) {
      badge.textContent = "PROFILE MISSING";
      badge.className = "state-pill state-error";
      detail.textContent = result.message || "The app-managed service references a missing encrypted profile.";
      profileDetail.textContent = "Disconnect the verified tunnel, or remove its service. Import is disabled until the service is removed.";
    } else if (result.profileInstalled && result.serviceRunning) {
      badge.textContent = "TUNNEL RUNNING";
      badge.className = "state-pill state-found";
      detail.textContent = result.message;
      profileDetail.textContent = "WireGuard reports its tunnel service as running; this does not verify a recent handshake or internet reachability.";
    } else if (result.profileInstalled) {
      badge.textContent = "DISCONNECTED";
      badge.className = "state-pill state-pending";
      detail.textContent = result.message;
      profileDetail.textContent = "The provider profile remains encrypted locally. Connect starts it; Remove deletes the service and local profile.";
    } else if (result.profileFilePresent) {
      badge.textContent = "PROFILE SAVED";
      badge.className = "state-pill state-pending";
      detail.textContent = result.message;
      profileDetail.textContent = "The encrypted profile is present, but no managed tunnel service is installed. Connect can retry installation.";
    } else {
      badge.textContent = "NO PROFILE";
      badge.className = "state-pill state-idle";
      detail.textContent = result.message || "Import a provider .conf file to configure a tunnel.";
      profileDetail.textContent = "The selected .conf is held in memory until you confirm import; the plaintext file is not copied into app data.";
    }

    const unavailable = !invoke || !result || !result.supported || !result.serviceQueryAvailable || state.wireguardPending;
    const clientMissing = !result || !result.wireguardInstalled;
    const foreignService = Boolean(result && result.servicePresent && !result.serviceManaged);
    const removeNeedsWireGuard = Boolean(result && result.serviceManaged);
    const removeHasTarget = Boolean(result && (result.profileFilePresent || result.serviceManaged));
    importButton.disabled = unavailable || clientMissing || Boolean(result && (result.servicePresent || result.profileFilePresent));
    connectButton.disabled = unavailable || clientMissing || !result || !result.profileFilePresent || foreignService || Boolean(result && result.serviceRunning);
    disconnectButton.disabled = unavailable || clientMissing || !result || !result.serviceManaged || !result.serviceRunning;
    removeButton.disabled = unavailable || !result || foreignService || !removeHasTarget || (clientMissing && removeNeedsWireGuard);
    refreshButton.disabled = !invoke || state.wireguardPending;
    downloadButton.disabled = !invoke || state.wireguardPending;
  }

  async function refreshWireGuardStatus() {
    if (!invoke) {
      renderWireGuardStatus(null, "The packaged Windows desktop app is required.");
      return null;
    }
    if (state.wireguardPending) return state.wireguardStatus;
    const refreshButton = byId("wireguardRefreshButton");
    if (refreshButton) refreshButton.disabled = true;
    try {
      const result = await invoke("wireguard_vpn_status");
      renderWireGuardStatus(result);
      return result;
    } catch (error) {
      renderWireGuardStatus(null, error && error.message ? error.message : String(error));
      return null;
    } finally {
      if (refreshButton) refreshButton.disabled = !invoke || state.wireguardPending;
    }
  }

  async function selectWireGuardConfig() {
    const input = byId("wireguardConfigFile");
    const file = input && input.files && input.files[0];
    if (input) input.value = "";
    if (!file) return;
    if (!/\.conf$/i.test(file.name || "")) {
      showToast("Choose a WireGuard provider .conf file.", "warning");
      return;
    }
    if (file.size > 64 * 1024) {
      showToast("WireGuard profiles must be 64 KB or smaller.", "warning");
      return;
    }
    try {
      state.pendingWireguardConfig = await file.text();
      state.pendingWireguardFilename = String(file.name || "provider.conf").slice(0, 100);
      byId("wireguardImportButton").focus();
      openConfirmation("wireguard-import");
    } catch (error) {
      state.pendingWireguardConfig = "";
      state.pendingWireguardFilename = "";
      showToast("Could not read the selected WireGuard profile: " + (error && error.message ? error.message : String(error)), "error");
    }
  }

  async function openWireGuardDownload() {
    if (!invoke) {
      showToast("WireGuard setup is available in the packaged Windows app.", "warning");
      return;
    }
    try {
      await invoke("open_wireguard_download");
    } catch (error) {
      showToast("Could not open the official WireGuard page: " + (error && error.message ? error.message : String(error)), "warning");
    }
  }

  function appendSystemRow(host, titleText, detailText) {
    const row = document.createElement("div");
    row.className = "system-info-row";
    const title = document.createElement("strong");
    title.textContent = titleText;
    const detail = document.createElement("span");
    detail.textContent = detailText;
    row.append(title, detail);
    host.appendChild(row);
  }

  function renderSystemClientStatus() {
    const statusHost = byId("systemClientStatus");
    const versionsHost = byId("systemClientVersions");
    const executorHost = byId("systemExecutorStatus");
    if (!statusHost || !versionsHost || !executorHost) return;
    statusHost.replaceChildren();
    versionsHost.replaceChildren();

    if (!state.activePlayer) {
      appendSystemRow(statusHost, "Player process", "Waiting for a local process-name check.");
    } else if (!state.activePlayer.supported || !state.activePlayer.available) {
      appendSystemRow(statusHost, "Player process", state.activePlayer.message || "Status unavailable.");
    } else {
      appendSystemRow(statusHost, "Roblox Player", state.activePlayer.running ? "RobloxPlayerBeta.exe is running." : "RobloxPlayerBeta.exe is not running.");
    }

    const versions = state.detection && Array.isArray(state.detection.versions) ? state.detection.versions : [];
    if (!state.detection) {
      appendSystemRow(versionsHost, "Installed client folders", "Waiting for the standard Roblox install-folder scan.");
    } else if (!versions.length) {
      appendSystemRow(versionsHost, "Installed client folders", "No standard Roblox Player or Studio version folder was found.");
    } else {
      versions.forEach(function (version) {
        const kinds = [];
        if (version.hasPlayer) kinds.push("Player");
        if (version.hasStudio) kinds.push("Studio");
        if (version.hasSettings) kinds.push("settings file");
        appendSystemRow(versionsHost, String(version.name || "Roblox version"), kinds.length ? kinds.join(" · ") : "Standard version folder");
      });
    }

    const scan = state.executorScan;
    executorHost.className = "system-executor-status";
    if (!scan || !scan.supported || !scan.available) {
      executorHost.textContent = scan && scan.message ? scan.message : "Known process-name scan is waiting for its local result.";
    } else if (Array.isArray(scan.matches) && scan.matches.length) {
      const names = scan.matches.map(function (match) {
        return String(match.productName || "Possible tool") + " (" + String(match.processName || "") + ")";
      });
      executorHost.textContent = "Possible executor-like process name(s): " + names.join(", ") + ". A name match is not proof of malware.";
      executorHost.classList.add("is-warning");
    } else {
      executorHost.textContent = "No exact Xeno, Solara, JJSploit, or Delta process name was found in the limited scan. This is not antivirus.";
      executorHost.classList.add("is-clean");
    }
  }

  function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let amount = bytes;
    let unit = 0;
    while (amount >= 1024 && unit < units.length - 1) {
      amount /= 1024;
      unit += 1;
    }
    return amount.toFixed(unit >= 2 ? 1 : 0) + " " + units[unit];
  }

  function formatDeviceType(value) {
    const types = {
      1: "Desktop",
      2: "Laptop / mobile",
      3: "Workstation",
      4: "Enterprise server",
      5: "Small-office server",
      6: "Appliance PC",
      7: "Performance server",
      8: "Slate / tablet",
      9: "Maximum",
      10: "Mini PC",
      11: "Stick PC"
    };
    return types[Number(value)] || "Other / not reported";
  }

  function renderSystemRows(host, rows, emptyMessage) {
    host.replaceChildren();
    if (!rows.length) {
      const placeholder = document.createElement("p");
      placeholder.className = "system-placeholder";
      placeholder.textContent = emptyMessage;
      host.appendChild(placeholder);
      return;
    }
    rows.forEach(function (row) { appendSystemRow(host, row.title, row.detail); });
  }

  function recommendedPresetFor(snapshot) {
    const memory = Number(snapshot && snapshot.memoryBytes);
    const names = (Array.isArray(snapshot && snapshot.graphicsAdapters) ? snapshot.graphicsAdapters : [])
      .map(function (adapter) { return String(adapter && adapter.name || "").toLowerCase(); })
      .join(" ");
    const hasDiscreteGpuName = /(geforce\s*(rtx|gtx)|radeon\s*rx|intel\s*arc)/i.test(names);
    if (Number.isFinite(memory) && memory > 0 && memory < 8 * 1024 * 1024 * 1024) return "low";
    if (Number.isFinite(memory) && memory >= 16 * 1024 * 1024 * 1024 && hasDiscreteGpuName) return "quality";
    return "balanced";
  }

  function renderDeviceSnapshot(result, error) {
    state.deviceSnapshot = result || null;
    const badge = byId("deviceBadge");
    const model = byId("deviceModel");
    const manufacturer = byId("deviceManufacturer");
    const type = byId("deviceType");
    const os = byId("deviceOs");
    const processorList = byId("processorList");
    const graphicsList = byId("graphicsList");
    const driveList = byId("driveList");
    const memory = byId("memoryValue");
    const recommendation = byId("recommendationTitle");
    const recommendationButton = byId("useRecommendedPreset");

    if (error || !result || !result.supported || !result.available) {
      badge.textContent = result && !result.supported ? "WINDOWS ONLY" : "UNAVAILABLE";
      badge.className = "state-pill " + (result && !result.supported ? "state-pending" : "state-error");
      model.textContent = "Hardware details unavailable";
      manufacturer.textContent = "—";
      type.textContent = "—";
      os.textContent = error || (result && result.message) || "Open the Windows desktop app to scan this device locally.";
      memory.textContent = "—";
      renderSystemRows(processorList, [], "No processor information available.");
      renderSystemRows(graphicsList, [], "No graphics information available.");
      renderSystemRows(driveList, [], "No local storage information available.");
      recommendation.textContent = "Scan device to get a rough suggestion";
      recommendationButton.disabled = true;
      return;
    }

    badge.textContent = "READ ONLY";
    badge.className = "state-pill state-found";
    model.textContent = [result.manufacturer, result.model].filter(Boolean).join(" ") || "Device model not reported";
    manufacturer.textContent = result.manufacturer || "Not reported";
    type.textContent = formatDeviceType(result.pcSystemType);
    const operatingSystem = result.operatingSystem || {};
    os.textContent = [operatingSystem.name, operatingSystem.version, operatingSystem.architecture].filter(Boolean).join(" · ") || "Windows version not reported";
    memory.textContent = formatBytes(result.memoryBytes);

    const processors = Array.isArray(result.processors) ? result.processors : [];
    renderSystemRows(processorList, processors.map(function (processor) {
      const topology = [processor.cores ? processor.cores + " cores" : "", processor.logicalProcessors ? processor.logicalProcessors + " threads" : ""].filter(Boolean).join(" · ");
      return { title: processor.name || "Processor", detail: topology || "Windows did not report core counts." };
    }), "No processor information was returned by Windows.");

    const adapters = Array.isArray(result.graphicsAdapters) ? result.graphicsAdapters : [];
    renderSystemRows(graphicsList, adapters.map(function (adapter) {
      const details = [];
      if (adapter.driverVersion) details.push("Driver " + adapter.driverVersion);
      if (Number(adapter.adapterRamBytes) > 0) details.push("Windows-reported adapter memory " + formatBytes(adapter.adapterRamBytes));
      return { title: adapter.name || "Display adapter", detail: details.join(" · ") || "Adapter detected; driver details not reported." };
    }), "No graphics adapters were returned by Windows.");

    const physicalDrives = Array.isArray(result.physicalDrives) ? result.physicalDrives : [];
    const volumes = Array.isArray(result.volumes) ? result.volumes : [];
    const storageRows = physicalDrives.map(function (drive) {
      const detail = [formatBytes(drive.sizeBytes), drive.interfaceType, drive.mediaType].filter(function (value) { return value && value !== "Unknown"; }).join(" · ");
      return { title: drive.model || "Physical drive", detail: detail || "Physical drive detected." };
    }).concat(volumes.map(function (volume) {
      const name = [volume.drive || "Local volume", volume.label].filter(Boolean).join(" · ");
      const detail = formatBytes(volume.freeBytes) + " free of " + formatBytes(volume.sizeBytes) + (volume.fileSystem ? " · " + volume.fileSystem : "");
      return { title: name, detail: detail };
    }));
    renderSystemRows(driveList, storageRows, "Windows did not report any local physical drives or volumes.");

    state.recommendedPreset = recommendedPresetFor(result);
    const presetLabels = { low: "Maximum performance", balanced: "Balanced", quality: "High quality" };
    const reason = state.recommendedPreset === "low"
      ? "based on less than 8 GB of reported RAM"
      : (state.recommendedPreset === "quality" ? "based on RAM and a discrete-GPU model name" : "a conservative middle-ground estimate");
    recommendation.textContent = "Suggested: " + presetLabels[state.recommendedPreset] + " · " + reason;
    recommendationButton.disabled = false;
  }

  async function refreshDeviceInfo() {
    if (!invoke) {
      renderDeviceSnapshot(null, "Local hardware inventory is available only in the packaged Windows desktop app.");
      return null;
    }
    if (state.devicePending) return null;
    state.devicePending = true;
    const button = byId("refreshDevice");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    byId("deviceBadge").textContent = "SCANNING";
    byId("deviceBadge").className = "state-pill state-pending";
    try {
      const result = await invoke("device_snapshot");
      renderDeviceSnapshot(result);
      if (!result.available) showToast(result.message || "Windows could not read this hardware snapshot.", "warning");
      return result;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      renderDeviceSnapshot(null, message);
      showToast("Local hardware scan failed: " + message, "warning");
      return null;
    } finally {
      state.devicePending = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  async function probeRobloxWebLatency() {
    if (!invoke) {
      byId("webLatencyValue").textContent = "Windows app required";
      return null;
    }
    if (state.latencyPending) return null;
    state.latencyPending = true;
    const button = byId("probeRobloxLatency");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    byId("webLatencyValue").textContent = "Measuring…";
    byId("webLatencyDetail").textContent = "Opening one TCP connection to www.roblox.com:443; no game or account data is sent.";
    try {
      const result = await invoke("probe_roblox_latency");
      if (result && result.available && Number.isFinite(Number(result.latencyMs))) {
        byId("webLatencyValue").textContent = Number(result.latencyMs).toFixed(1) + " ms";
      } else {
        byId("webLatencyValue").textContent = "Unavailable";
      }
      byId("webLatencyDetail").textContent = result && result.message
        ? result.message
        : "This is a Roblox website TCP connect-time estimate, not game-server ping.";
      return result;
    } catch (error) {
      byId("webLatencyValue").textContent = "Unavailable";
      byId("webLatencyDetail").textContent = error && error.message ? error.message : "The Roblox web endpoint could not be reached.";
      return null;
    } finally {
      state.latencyPending = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
    }
  }

  function safetyScanSignature(result, error) {
    if (error) return "error|" + String(error);
    if (!result) return "no-result";
    const names = (Array.isArray(result.matches) ? result.matches : []).map(function (match) {
      return String(match.processName || match.productName || "").toLowerCase();
    }).filter(Boolean).sort();
    return [result.supported ? "supported" : "unsupported", result.available ? "available" : "unavailable", String(result.message || ""), names.join("|")].join("\u001f");
  }

  async function scanKnownExecutorProcesses(silent) {
    const unavailableMessage = "Open the packaged Windows app to scan local process names.";
    if (!invoke) {
      const signature = safetyScanSignature(null, unavailableMessage);
      state.executorScan = null;
      if (!silent || signature !== state.lastSafetyScanSignature) {
        renderSafetyScan(null, unavailableMessage);
        renderSystemClientStatus();
      }
      state.lastSafetyScanSignature = signature;
      return null;
    }
    if (state.safetyScanPending) {
      if (!silent) showToast("A local process-name scan is already running.");
      return null;
    }

    state.safetyScanPending = true;
    const button = byId("scanSafety");
    const securityScanButton = byId("securityRescanProcesses");
    const systemScanButton = byId("scanSafetySystem");
    [button, securityScanButton, systemScanButton].forEach(function (scanAction) {
      if (scanAction) {
        scanAction.disabled = true;
        scanAction.setAttribute("aria-busy", "true");
      }
    });
    if (!silent) {
      byId("safetyScanBadge").textContent = "SCANNING";
      byId("safetyScanBadge").className = "state-pill state-pending";
      byId("safetyScanDetail").textContent = "Checking only the allowlisted process names on this device…";
      const securityStatus = byId("securityScanStatus");
      if (securityStatus) securityStatus.textContent = "Checking only the exact watched process names…";
    }
    try {
      const result = await invoke("scan_known_executor_processes");
      const signature = safetyScanSignature(result);
      const changed = signature !== state.lastSafetyScanSignature;
      state.executorScan = result;
      state.lastSafetyScanSignature = signature;
      if (!silent || changed) {
        renderSafetyScan(result);
        renderSystemClientStatus();
      }

      const matches = result && Array.isArray(result.matches) ? result.matches : [];
      if (matches.length) {
        const alertSignature = matches.map(function (match) {
          return String(match.processName || match.productName || "").toLowerCase();
        }).filter(Boolean).sort().join("|");
        if (alertSignature && alertSignature !== state.lastSafetyAlertSignature) {
          showToast("Potential malware/executor warning: review the watched process-name match and run a Defender scan.", "warning");
          const matchedNames = matches.map(function (match) { return String(match.productName || match.processName || "possible name"); }).slice(0, 4).join(", ");
          addAppNotification("Potential executor/malware warning", matchedNames + " matched the local name watchlist. This does not prove malware; run Microsoft Defender Quick scan in Windows Security.", "safetyAlerts", "warning");
        }
        if (alertSignature) state.lastSafetyAlertSignature = alertSignature;
      } else if (result && result.available) {
        state.lastSafetyAlertSignature = "";
      }
      return result;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      const signature = safetyScanSignature(null, message);
      state.executorScan = null;
      if (!silent || signature !== state.lastSafetyScanSignature) {
        renderSafetyScan(null, message);
        renderSystemClientStatus();
      }
      state.lastSafetyScanSignature = signature;
      if (!silent) showToast("Local process scan unavailable: " + message, "warning");
      return null;
    } finally {
      state.safetyScanPending = false;
      [button, securityScanButton, systemScanButton].forEach(function (scanAction) {
        if (scanAction) {
          scanAction.disabled = !invoke;
          scanAction.removeAttribute("aria-busy");
        }
      });
    }
  }

  async function openWindowsSettings(section) {
    if (!invoke) {
      showToast("Windows Settings links are available in the packaged app.", "warning");
      return;
    }
    try {
      await invoke("open_windows_settings", { section: section });
    } catch (error) {
      showToast("Could not open Windows Settings: " + (error && error.message ? error.message : String(error)), "warning");
    }
  }

  function setView(name) {
    const view = name === "settings" ? "settings" : "main";
    byId("mainView").hidden = view !== "main";
    byId("settingsView").hidden = view !== "settings";
    byId("navMain").classList.toggle("is-active", view === "main");
    if (view === "main") byId("navMain").setAttribute("aria-current", "page");
    else byId("navMain").removeAttribute("aria-current");
    byId("navSettings").classList.toggle("is-active", view === "settings");
    if (view === "main") {
      document.querySelectorAll(".subnav-item").forEach(function (item) {
        item.classList.remove("is-active");
        item.removeAttribute("aria-current");
      });
    }
    byId("breadcrumbTitle").textContent = view === "settings" ? "Settings" : "Main";
    if (view === "settings") {
      byId("navSettings").setAttribute("aria-expanded", "true");
      byId("settingsSubnav").hidden = false;
      const active = document.querySelector(".settings-tab.is-active");
      if (active) setSettingsTab(active.dataset.tab);
    }
    byId("pageScroll").scrollTop = 0;
  }

  function setSettingsTab(name) {
    const selected = ["rendering", "geometry", "icons", "allowlist", "security", "vpn", "system", "notifications"].includes(name) ? name : "rendering";
    byId("settingsView").hidden = false;
    byId("mainView").hidden = true;
    byId("navMain").classList.remove("is-active");
    byId("navMain").removeAttribute("aria-current");
    byId("navSettings").classList.add("is-active");
    byId("navSettings").setAttribute("aria-expanded", "true");
    byId("settingsSubnav").hidden = false;
    byId("breadcrumbTitle").textContent = "Settings · " + capitalize(selected);
    byId("settingsHeaderStatusText").textContent = selected === "notifications" ? "Preferences save immediately on this device" : selected === "security" ? "Windows controls scanning and remediation" : selected === "vpn" ? "Provider profile stays on this device" : "Changes are staged locally";
    byId("settingsFooter").hidden = ["notifications", "security", "vpn"].includes(selected);
    document.querySelectorAll(".settings-tab").forEach(function (tab) {
      const active = tab.dataset.tab === selected;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
    });
    document.querySelectorAll(".subnav-item").forEach(function (tab) {
      const active = tab.dataset.tab === selected;
      tab.classList.toggle("is-active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    });
    document.querySelectorAll(".settings-pane").forEach(function (pane) {
      const active = pane.dataset.pane === selected;
      pane.hidden = !active;
      pane.classList.toggle("is-active", active);
    });
    byId("pageScroll").scrollTop = 0;
    renderSystemClientStatus();
    if (selected === "system" && !state.deviceSnapshot) refreshDeviceInfo();
    if (selected === "notifications") renderNotificationPreferences();
    if (selected === "vpn") refreshWireGuardStatus();
  }

  function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }

  function updateAllowlistCount() {
    const categories = state.allowlist && Array.isArray(state.allowlist.categories) ? state.allowlist.categories : [];
    const total = categories.reduce(function (sum, category) {
      return sum + (Array.isArray(category.flags) ? category.flags.length : 0);
    }, 0);
    byId("allowlistCount").textContent = String(total);
    byId("allowlistTotal").textContent = String(total);
  }

  function renderAllowlistFilters() {
    const host = byId("allowlistFilters");
    const categories = state.allowlist && Array.isArray(state.allowlist.categories) ? state.allowlist.categories : [];
    host.replaceChildren();
    const items = [{ name: "All", key: "all", count: categories.reduce((sum, cat) => sum + (cat.flags || []).length, 0) }]
      .concat(categories.map(function (category) { return { name: category.name, key: category.name, count: (category.flags || []).length }; }));
    items.forEach(function (item) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "filter-chip" + (state.allowlistFilter === item.key ? " is-active" : "");
      button.dataset.filterCategory = item.key;
      button.setAttribute("aria-pressed", state.allowlistFilter === item.key ? "true" : "false");
      const label = document.createElement("span");
      label.textContent = item.name;
      const count = document.createElement("b");
      count.textContent = String(item.count);
      button.append(label, count);
      host.appendChild(button);
    });
  }

  function renderAllowlist() {
    const host = byId("allowlistGroups");
    const categories = state.allowlist && Array.isArray(state.allowlist.categories) ? state.allowlist.categories : [];
    const needle = byId("allowlistSearch").value.trim().toLowerCase();
    host.replaceChildren();
    let matches = 0;
    categories.forEach(function (category) {
      if (state.allowlistFilter !== "all" && category.name !== state.allowlistFilter) return;
      const flags = (Array.isArray(category.flags) ? category.flags : []).filter(function (flag) {
        return String(flag).toLowerCase().includes(needle) || String(category.name).toLowerCase().includes(needle);
      });
      if (!flags.length) return;
      matches += flags.length;
      const card = document.createElement("article");
      card.className = "allowlist-group";
      const header = document.createElement("div");
      header.className = "allowlist-group-head";
      const title = document.createElement("h3");
      title.textContent = category.name;
      const total = document.createElement("span");
      total.textContent = flags.length + (flags.length === 1 ? " KEY" : " KEYS");
      header.append(title, total);
      card.appendChild(header);
      const categoryInfo = state.allowlist.categoryDescriptions && state.allowlist.categoryDescriptions[category.name];
      if (categoryInfo && categoryInfo.summary) {
        const summary = document.createElement("p");
        summary.className = "allowlist-category-summary";
        summary.textContent = categoryInfo.summary;
        card.appendChild(summary);
      }
      const list = document.createElement("div");
      flags.forEach(function (flag) {
        const row = document.createElement("div");
        row.className = "allowlist-flag";
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        check.setAttribute("class", "icon");
        check.setAttribute("aria-hidden", "true");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#i-check");
        check.appendChild(use);
        const copy = document.createElement("div");
        copy.className = "allowlist-flag-copy";
        const code = document.createElement("code");
        code.textContent = String(flag);
        copy.appendChild(code);
        const feature = state.allowlist.flagFeatures && state.allowlist.flagFeatures[flag];
        if (feature && feature.improves) {
          const detail = document.createElement("small");
          detail.textContent = feature.improves;
          copy.appendChild(detail);
        }
        row.append(check, copy);
        list.appendChild(row);
      });
      card.appendChild(list);
      host.appendChild(card);
    });
    if (!matches) {
      const empty = document.createElement("div");
      empty.className = "allowlist-empty";
      empty.textContent = "No allowlisted flags match this filter.";
      host.appendChild(empty);
    }
  }

  function refreshAllowlist() {
    renderAllowlistFilters();
    renderAllowlist();
    updateAllowlistCount();
  }

  function showToast(message, tone) {
    const toast = byId("toast");
    toast.textContent = message;
    toast.dataset.tone = tone || "default";
    toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(function () { toast.classList.remove("is-visible"); }, 3400);
  }

  function downloadJson(filename, value) {
    const blob = new Blob([JSON.stringify(value, null, 2) + "\n"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function openConfirmation(action) {
    const isDeleteProfile = action === "delete-profile";
    const isWireGuardAction = ["wireguard-import", "wireguard-connect", "wireguard-disconnect", "wireguard-remove"].includes(action);
    const isWireGuardRemove = action === "wireguard-remove";
    if (!invoke && !isDeleteProfile) {
      showToast(isWireGuardAction ? "WireGuard VPN actions require the packaged Windows desktop app." : "Open the packaged Windows desktop app to apply local Roblox settings.", "warning");
      return;
    }
    if (action === "wireguard-import" && !state.pendingWireguardConfig) {
      showToast("Select a provider WireGuard .conf file first.", "warning");
      return;
    }
    state.pendingAction = action;
    state.confirmReturnFocus = document.activeElement;
    const isRestore = action === "restore";
    const isApplyLaunch = action === "apply-launch";
    const profile = currentProfile();
    const savedProfile = state.savedProfiles.find(function (item) { return item.id === state.selectedSavedProfileId; });
    const isWarnAction = isDeleteProfile || isWireGuardRemove;
    byId("acceptConfirm").classList.toggle("button-outline-warn", isWarnAction);
    byId("acceptConfirm").classList.toggle("button-primary", !isWarnAction);
    byId("acceptConfirm").textContent = isDeleteProfile ? "Delete profile" : isWireGuardRemove ? "Remove VPN profile" : isWireGuardAction ? (action === "wireguard-import" ? "Import & connect" : action === "wireguard-connect" ? "Connect VPN" : "Disconnect VPN") : "Confirm";
    if (isDeleteProfile) {
      byId("confirmEyebrow").textContent = "LOCAL PROFILE LIBRARY · DELETE";
      byId("confirmTitle").textContent = "Delete this saved profile?";
      byId("confirmText").textContent = savedProfile
        ? "Delete “" + savedProfile.name + "” from this device? This does not change the currently staged or applied Roblox settings."
        : "This profile is no longer available.";
    } else if (isWireGuardAction) {
      byId("confirmEyebrow").textContent = "WIREGUARD VPN · WINDOWS NETWORK CHANGE";
      if (action === "wireguard-import") {
        byId("confirmTitle").textContent = "Import and connect this provider profile?";
        byId("confirmText").textContent = "Import “" + state.pendingWireguardFilename + "” and install a Windows WireGuard tunnel service? Your provider’s AllowedIPs and DNS determine routed traffic; a default route can carry all internet traffic and may enable WireGuard’s firewall/kill-switch behavior. Windows will ask for administrator approval. The encrypted profile is stored on this device; after successful setup, the tunnel remains active if Marktis closes and may remain after uninstall; disconnect and remove it before uninstalling. The service is set not to auto-start after a Windows restart. Only use a configuration from a provider you trust.";
      } else if (action === "wireguard-connect") {
        byId("confirmTitle").textContent = "Connect the provider tunnel?";
        byId("confirmText").textContent = "WireGuard will start the installed tunnel using its provider-defined routes and DNS. This changes the device’s network path, may affect all internet traffic, and can change Roblox ping. Windows will ask for administrator approval. On success, the service is set to manual start. The tunnel stays connected after this app closes and may remain after uninstall; disconnect and remove it before uninstalling. It will not auto-start after a Windows restart.";
      } else if (action === "wireguard-disconnect") {
        byId("confirmTitle").textContent = "Disconnect the provider tunnel?";
        byId("confirmText").textContent = "WireGuard will stop this app-managed tunnel and Windows will return to its normal network routes. Active connections may be interrupted. The encrypted provider profile remains stored locally.";
      } else {
        byId("confirmTitle").textContent = "Remove the WireGuard profile?";
        byId("confirmText").textContent = "This stops and removes the app-managed Windows tunnel service, then deletes its encrypted local profile. You will need the provider’s original .conf file to set it up again. Any other WireGuard tunnel is left untouched.";
      }
    } else {
      byId("confirmEyebrow").textContent = isRestore ? "LOCAL SETTINGS · RESTORE" : "LOCAL SETTINGS · BACKUP FIRST";
      byId("confirmTitle").textContent = isRestore ? "Restore managed settings?" : (isApplyLaunch ? "Apply and launch Roblox?" : "Apply this profile?");
      if (isRestore) {
        byId("confirmText").textContent = "Marktis Optimizer will remove canonical managed keys and the separate legacy FPS key from detected settings files. Unrelated JSON keys stay untouched; new backups are created first.";
      } else {
        let message = "Marktis Optimizer will back up each target file, then apply your local profile. Unrelated JSON keys stay untouched.";
        if (profile.legacyFps) message += " The opt-in legacy FPS target (" + profile.fps + ") is outside Roblox's current allowlist and may be ignored.";
        if (isApplyLaunch) message += " If settings are applied successfully, Roblox will open through the normal roblox:// protocol.";
        if (state.activePlayer && state.activePlayer.running) message += " Roblox Player is already running. This writes a backed-up local settings file, not the live game; the current session may ignore or overwrite it. Restart Roblox after the session to load these settings.";
        byId("confirmText").textContent = message;
      }
    }
    byId("confirmOverlay").hidden = false;
    byId("cancelConfirm").focus();
  }

  function closeConfirmation() {
    byId("confirmOverlay").hidden = true;
    byId("acceptConfirm").classList.remove("button-outline-warn");
    byId("acceptConfirm").classList.add("button-primary");
    byId("acceptConfirm").textContent = "Confirm";
    state.pendingAction = null;
    state.pendingWireguardConfig = "";
    state.pendingWireguardFilename = "";
    const returnFocus = state.confirmReturnFocus;
    state.confirmReturnFocus = null;
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === "function") returnFocus.focus();
  }

  async function confirmWireGuardAction(action) {
    const commands = {
      "wireguard-import": "wireguard_vpn_import",
      "wireguard-connect": "wireguard_vpn_connect",
      "wireguard-disconnect": "wireguard_vpn_disconnect",
      "wireguard-remove": "wireguard_vpn_remove"
    };
    const command = commands[action];
    if (!command || !invoke) return closeConfirmation();
    const config = action === "wireguard-import" ? state.pendingWireguardConfig : "";
    const accept = byId("acceptConfirm");
    const cancel = byId("cancelConfirm");
    const dialog = byId("confirmDialog");
    state.wireguardPending = true;
    accept.disabled = true;
    cancel.disabled = true;
    dialog.setAttribute("aria-busy", "true");
    dialog.focus();
    accept.textContent = action === "wireguard-import" ? "Installing tunnel…" : action === "wireguard-remove" ? "Removing profile…" : action === "wireguard-connect" ? "Connecting…" : "Disconnecting…";
    renderWireGuardStatus(state.wireguardStatus);
    let result = null;
    let failure = null;
    try {
      result = await invoke(command, action === "wireguard-import" ? { config: config } : {});
      state.wireguardStatus = result;
    } catch (error) {
      failure = error;
    } finally {
      state.wireguardPending = false;
      accept.disabled = false;
      cancel.disabled = false;
      dialog.removeAttribute("aria-busy");
      accept.textContent = "Confirm";
    }
    closeConfirmation();
    if (result) renderWireGuardStatus(result);
    if (failure) {
      showToast("WireGuard action failed: " + (failure && failure.message ? failure.message : String(failure)), "error");
      await refreshWireGuardStatus();
      return;
    }
    const messages = {
      "wireguard-import": "WireGuard installed the provider tunnel service. Check its status and provider reachability before relying on it.",
      "wireguard-connect": "WireGuard tunnel service started. Service state does not guarantee a successful handshake.",
      "wireguard-disconnect": "WireGuard tunnel stopped; Windows is returning to its normal network routes.",
      "wireguard-remove": "The app-managed WireGuard service and encrypted profile were removed."
    };
    showToast(messages[action] || "WireGuard action completed.", "success");
  }

  async function confirmAction() {
    const action = state.pendingAction;
    if (!action) return closeConfirmation();
    if (action === "delete-profile") {
      const deleted = deleteSelectedProfile();
      closeConfirmation();
      byId("profileLibrarySelect").focus();
      if (!deleted) showToast("That saved profile is no longer available.", "warning");
      return;
    }
    if (action.indexOf("wireguard-") === 0) return confirmWireGuardAction(action);
    if (!invoke) return closeConfirmation();
    const isRestore = action === "restore";
    const isApplyLaunch = action === "apply-launch";
    const accept = byId("acceptConfirm");
    const cancel = byId("cancelConfirm");
    const dialog = byId("confirmDialog");
    accept.disabled = true;
    cancel.disabled = true;
    dialog.setAttribute("aria-busy", "true");
    dialog.focus();
    accept.textContent = isRestore ? "Restoring…" : (isApplyLaunch ? "Applying & launching…" : "Applying…");
    let result = null;
    let failure = null;
    let launchRequested = false;
    try {
      if (isRestore) {
        result = await invoke("restore_settings");
      } else {
        result = await invoke("apply_settings", { profile: currentProfile() });
        if (isApplyLaunch && result && result.applied) {
          await invoke("launch_roblox");
          launchRequested = true;
        }
      }
    } catch (error) {
      failure = error;
    } finally {
      accept.disabled = false;
      cancel.disabled = false;
      dialog.removeAttribute("aria-busy");
      accept.textContent = "Confirm";
    }
    closeConfirmation();
    if (failure) {
      const message = failure && failure.message ? failure.message : String(failure);
      const prefix = isApplyLaunch && result && result.applied
        ? "Settings were applied, but Roblox could not be launched: "
        : (isRestore ? "Restore failed: " : "Apply failed: ");
      showToast(prefix + message, "error");
      await detectRoblox();
      return;
    }
    if (result && result.applied) {
      const message = isApplyLaunch && launchRequested
        ? "Settings applied with backups; Roblox launch requested through roblox://."
        : (result.message || (isRestore ? "Managed settings restored." : "Settings applied with backups."));
      showToast(message, "success");
      addAppNotification(isRestore ? "Managed settings restored" : "Settings applied", message, "settingsChanges", "success");
    } else {
      showToast(result && result.message ? result.message : "No settings files were changed; Roblox was not launched.", "warning");
    }
    await detectRoblox();
    updateProfileDisplay();
  }

  async function openLatestRelease() {
    const button = byId("openLatestRelease");
    if (!invoke) {
      showToast("Open the packaged Windows app to view the latest release link.", "warning");
      return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await invoke("open_latest_release");
      showToast("Opened the official GitHub Releases page. Download and install updates manually.", "success");
    } catch (error) {
      showToast("Could not open the releases page: " + (error && error.message ? error.message : String(error)), "warning");
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = !invoke;
    }
  }

  async function openCommunityLink(buttonId, command, label) {
    const button = byId(buttonId);
    if (!invoke) {
      showToast("Open the packaged Windows desktop app to open the " + label + ".", "warning");
      return;
    }
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await invoke(command);
      showToast("Opened the " + label + " in your default browser.", "success");
    } catch (error) {
      showToast("Could not open the " + label + ": " + (error && error.message ? error.message : String(error)), "warning");
    } finally {
      button.removeAttribute("aria-busy");
      button.disabled = !invoke;
    }
  }

  function openCommunityDiscord() {
    return openCommunityLink("joinDiscord", "open_community_discord", "Discord invite");
  }

  function openYoutubeChannel() {
    return openCommunityLink("openYoutubeChannel", "open_youtube_channel", "YouTube channel");
  }

  async function openSettingsFolder() {
    const button = byId("quickActionSettingsFolder");
    if (!invoke) {
      showToast("Opening a Roblox settings location is available in the packaged Windows desktop app.", "warning");
      return;
    }
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      const openedPath = await invoke("open_settings_folder");
      showToast("Opened the detected Roblox settings location." + (typeof openedPath === "string" ? " " + openedPath : ""), "success");
    } catch (error) {
      showToast("Could not open a Roblox settings location: " + (error && error.message ? error.message : String(error)), "warning");
    } finally {
      if (button) {
        button.removeAttribute("aria-busy");
        button.disabled = false;
      }
    }
  }

  async function launchRoblox() {
    const button = byId("launchRoblox");
    if (!invoke) {
      showToast("Launch Roblox from the packaged Windows desktop app.", "warning");
      return;
    }
    if (button) button.disabled = true;
    try {
      await invoke("launch_roblox");
      showToast("Roblox launch requested through the standard roblox:// protocol.", "success");
    } catch (error) {
      showToast("Roblox could not be launched: " + (error && error.message ? error.message : String(error)), "error");
    } finally {
      if (button) button.disabled = false;
    }
  }

  async function rejoinSameServer() {
    const button = byId("rejoinSameServer");
    const placeId = normalizeRobloxPlaceId(byId("rejoinPlaceId").value);
    const gameInstanceId = normalizeRobloxGameInstanceId(byId("rejoinGameInstanceId").value);
    if (!placeId || !gameInstanceId) {
      showToast("Enter a valid Place ID and server Job ID (UUID).", "warning");
      updateRejoinButton();
      return;
    }
    if (!invoke) {
      showToast("Rejoining a server is available in the packaged Windows desktop app.", "warning");
      return;
    }
    safeStorageSet(rejoinTargetKey, JSON.stringify({ placeId: placeId, gameInstanceId: gameInstanceId }));
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    try {
      await invoke("rejoin_roblox_server", { placeId: placeId, gameInstanceId: gameInstanceId });
      showToast("Roblox rejoin request sent for the supplied server. Roblox may reject it if that server is no longer available.", "success");
    } catch (error) {
      showToast("Could not request a server rejoin: " + (error && error.message ? error.message : String(error)), "error");
    } finally {
      button.removeAttribute("aria-busy");
      updateRejoinButton();
    }
  }

  async function openRobloxProfile() {
    const button = byId("openRobloxProfile");
    const userId = normalizeRobloxUserId(byId("robloxUserId").value);
    if (!userId) {
      showToast("Enter a valid positive numeric Roblox User ID.", "warning");
      updateRobloxProfileButton();
      return;
    }
    if (!invoke) {
      showToast("Open the packaged Windows desktop app to open the official Roblox profile.", "warning");
      return;
    }
    safeStorageSet(robloxUserIdKey, userId);
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      await invoke("open_roblox_profile", { userId: userId });
      showToast("Opening the official Roblox profile in your system browser.", "success");
    } catch (error) {
      showToast("Could not open the Roblox profile: " + (error && error.message ? error.message : String(error)), "error");
    } finally {
      if (button) button.removeAttribute("aria-busy");
      updateRobloxProfileButton();
    }
  }

  async function quickRefresh() {
    if (state.quickRefreshPending) return;
    state.quickRefreshPending = true;
    const button = byId("quickRefresh");
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
    }
    try {
      await Promise.allSettled([
        detectRoblox(),
        refreshPlayerStatus(),
        refreshDeviceInfo(),
        refreshStorageSnapshot(),
        scanKnownExecutorProcesses(true)
      ]);
    } finally {
      state.quickRefreshPending = false;
      if (button) {
        button.disabled = false;
        button.removeAttribute("aria-busy");
      }
      const updated = byId("quickRefreshTime");
      if (updated) updated.textContent = "Updated " + new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    }
  }

  async function refreshStorageSnapshot() {
    if (!invoke || state.storagePending) return null;
    state.storagePending = true;
    try {
      const result = await invoke("storage_snapshot");
      state.storageSnapshot = result || null;
      return result;
    } catch (_error) {
      state.storageSnapshot = null;
      return null;
    } finally {
      state.storagePending = false;
    }
  }

  function storageRecords(snapshot) {
    const volumes = snapshot && Array.isArray(snapshot.volumes) ? snapshot.volumes : [];
    const systemDrive = String(snapshot && snapshot.systemDrive || "").trim().toUpperCase();
    return volumes.map(function (volume) {
      if (!volume || typeof volume !== "object") return null;
      const total = Number(volume.sizeBytes);
      const rawFree = Number(volume.freeBytes);
      if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(rawFree) || rawFree < 0) return null;
      const free = Math.min(total, rawFree);
      const used = Math.max(0, total - free);
      const freePercent = free / total * 100;
      const drive = String(volume.drive || "Local drive");
      return {
        drive: drive,
        label: String(volume.label || "").trim(),
        total: total,
        free: free,
        used: used,
        usedPercent: Math.min(100, Math.max(0, used / total * 100)),
        isSystem: drive.trim().toUpperCase() === systemDrive,
        isLow: free < lowStorageBytes || freePercent < lowStoragePercent
      };
    }).filter(Boolean).sort(function (left, right) {
      if (left.isSystem !== right.isSystem) return left.isSystem ? -1 : 1;
      if (left.isLow !== right.isLow) return left.isLow ? -1 : 1;
      return left.drive.localeCompare(right.drive);
    });
  }

  function renderStorageVolume(record, host) {
    const card = document.createElement("article");
    card.className = "storage-volume-card" + (record.isLow ? " is-low" : "");
    const heading = document.createElement("div");
    heading.className = "storage-drive-heading";
    const name = document.createElement("strong");
    name.textContent = record.drive + (record.label ? " · " + record.label : "");
    const badges = document.createElement("span");
    badges.className = "storage-drive-badges";
    if (record.isSystem) {
      const systemBadge = document.createElement("span");
      systemBadge.className = "storage-drive-badge is-system";
      systemBadge.textContent = "SYSTEM";
      badges.appendChild(systemBadge);
    }
    if (record.isLow) {
      const lowBadge = document.createElement("span");
      lowBadge.className = "storage-drive-badge is-low";
      lowBadge.textContent = "LOW SPACE";
      badges.appendChild(lowBadge);
    }
    heading.append(name, badges);
    const detail = document.createElement("p");
    detail.className = "storage-drive-detail";
    detail.textContent = formatBytes(record.free) + " free · " + formatBytes(record.used) + " used · " + formatBytes(record.total) + " total";
    const meter = document.createElement("div");
    meter.className = "storage-meter";
    meter.setAttribute("role", "progressbar");
    meter.setAttribute("aria-label", record.drive + " storage used");
    meter.setAttribute("aria-valuemin", "0");
    meter.setAttribute("aria-valuemax", "100");
    meter.setAttribute("aria-valuenow", String(Math.round(record.usedPercent)));
    const fill = document.createElement("span");
    fill.style.width = record.usedPercent.toFixed(1) + "%";
    meter.appendChild(fill);
    card.append(heading, detail, meter);
    host.appendChild(card);
  }

  async function loadStartupStorageSnapshot() {
    if (!invoke) return null;
    let timeoutId = 0;
    const timeout = new Promise(function (resolve) {
      timeoutId = window.setTimeout(function () { resolve(null); }, 5000);
    });
    const result = await Promise.race([refreshStorageSnapshot(), timeout]);
    window.clearTimeout(timeoutId);
    if (!result && !state.storageSnapshot) {
      state.storageSnapshot = {
        supported: true,
        available: false,
        systemDrive: "",
        volumes: [],
        message: "The local storage check took too long to complete."
      };
    }
    return state.storageSnapshot;
  }

  function showStartupStorageNotice() {
    if (!invoke || state.storageNoticeShown) return;
    state.storageNoticeShown = true;
    const overlay = byId("storageNoticeOverlay");
    const title = byId("storageNoticeTitle");
    const message = byId("storageNoticeText");
    const list = byId("storageVolumeList");
    const icon = byId("storageNoticeIcon");
    const continueButton = byId("continueAfterStorageCheck");
    const records = state.storageSnapshot && state.storageSnapshot.available
      ? storageRecords(state.storageSnapshot)
      : [];
    list.replaceChildren();
    icon.classList.remove("is-low", "is-unavailable");

    if (!records.length) {
      title.textContent = "Storage check unavailable";
      message.textContent = "Windows did not return usable local drive capacity details. You can still continue to Marktis Optimizer; no files were scanned or changed.";
      icon.classList.add("is-unavailable");
      const empty = document.createElement("p");
      empty.className = "storage-volume-empty";
      empty.textContent = "No fixed local drive details are available right now.";
      list.appendChild(empty);
      continueButton.textContent = "Run Marktis Optimizer";
    } else {
      records.forEach(function (record) { renderStorageVolume(record, list); });
      const systemDrive = String(state.storageSnapshot.systemDrive || "").trim().toUpperCase();
      const mainDrive = records.find(function (record) { return record.drive.trim().toUpperCase() === systemDrive; }) || records[0];
      const lowDrive = records.find(function (record) { return record.isLow; });
      if (lowDrive) {
        title.textContent = "Oops, storage is running low 😢";
        const storageMessage = lowDrive.drive + " has " + formatBytes(lowDrive.free) + " free of " + formatBytes(lowDrive.total) + " total. Consider deleting or moving a few files before continuing. Marktis Optimizer will not delete files for you.";
        message.textContent = storageMessage + " Do you want to run it anyway?";
        addAppNotification("Low storage advisory", storageMessage, "lowStorage", "warning");
        icon.classList.add("is-low");
        continueButton.textContent = "Run anyway";
      } else {
        title.textContent = "Storage check complete";
        message.textContent = "No low-space drives were detected. " + mainDrive.drive + " has " + formatBytes(mainDrive.free) + " free of " + formatBytes(mainDrive.total) + " total (" + formatBytes(mainDrive.used) + " used). Would you like to continue to Marktis Optimizer?";
        continueButton.textContent = "Run Marktis Optimizer";
      }
    }
    overlay.hidden = false;
    continueButton.focus();
  }

  function continueFromStorageNotice() {
    byId("storageNoticeOverlay").hidden = true;
    byId("quickRefresh").focus();
  }

  async function exitFromStorageNotice() {
    const exitButton = byId("exitAfterStorageCheck");
    const continueButton = byId("continueAfterStorageCheck");
    exitButton.disabled = true;
    continueButton.disabled = true;
    exitButton.textContent = "Closing…";
    try {
      await invoke("exit_app");
    } catch (error) {
      exitButton.disabled = false;
      continueButton.disabled = false;
      exitButton.textContent = "Exit app";
      showToast("The app could not close: " + (error && error.message ? error.message : String(error)), "error");
    }
  }

  function trapStorageNoticeFocus(event) {
    const dialog = byId("storageNoticeDialog");
    const focusable = Array.from(dialog.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) { return !element.hidden; });
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const index = focusable.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  function trapConfirmationFocus(event) {
    const dialog = byId("confirmDialog");
    const focusable = Array.from(dialog.querySelectorAll(
      'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])'
    )).filter(function (element) { return !element.hidden; });
    if (!focusable.length) {
      event.preventDefault();
      dialog.focus();
      return;
    }
    const index = focusable.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) {
      event.preventDefault();
      focusable[focusable.length - 1].focus();
    } else if (!event.shiftKey && (index < 0 || index === focusable.length - 1)) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  function wireEvents() {
    document.querySelectorAll("[data-view]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (button.dataset.view === "settings" && !byId("settingsView").hidden) {
          const expanded = byId("navSettings").getAttribute("aria-expanded") === "true";
          byId("navSettings").setAttribute("aria-expanded", expanded ? "false" : "true");
          byId("settingsSubnav").hidden = expanded;
          return;
        }
        setView(button.dataset.view);
      });
    });
    document.querySelectorAll("[data-tab]").forEach(function (button) {
      button.addEventListener("click", function () { setSettingsTab(button.dataset.tab); });
    });
    document.querySelectorAll(".settings-tab").forEach(function (tab) {
      tab.addEventListener("keydown", function (event) {
        const tabs = Array.from(document.querySelectorAll(".settings-tab"));
        const index = tabs.indexOf(tab);
        let next = -1;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = tabs.length - 1;
        if (next < 0) return;
        event.preventDefault();
        setSettingsTab(tabs[next].dataset.tab);
        tabs[next].focus();
      });
    });
    byId("mainOpenSettings").addEventListener("click", function () { setView("settings"); });
    byId("toggleQuickActions").addEventListener("click", toggleQuickActionTray);
    byId("closeQuickActions").addEventListener("click", closeQuickActionTray);
    byId("quickActionMain").addEventListener("click", function () { closeQuickActionTray(false); setView("main"); });
    byId("quickActionSettingsFolder").addEventListener("click", function () { closeQuickActionTray(false); openSettingsFolder(); });
    byId("quickActionLaunch").addEventListener("click", function () { closeQuickActionTray(false); launchRoblox(); });
    byId("quickActionRestore").addEventListener("click", function () { closeQuickActionTray(false); openConfirmation("restore"); });
    byId("quickActionRefresh").addEventListener("click", function () { closeQuickActionTray(false); quickRefresh(); });
    byId("toggleNotifications").addEventListener("click", toggleNotificationDrawer);
    byId("closeNotifications").addEventListener("click", closeNotificationDrawer);
    byId("markNotificationsRead").addEventListener("click", markAllNotificationsRead);
    byId("clearNotifications").addEventListener("click", clearNotificationHistory);
    byId("requestNotifications").addEventListener("click", requestDesktopNotifications);
    byId("notificationEnabled").addEventListener("change", function () { setNotificationEnabled(this.checked); });
    byId("notifyPlayerStatus").addEventListener("change", function () { setNotificationEventEnabled("playerStatus", this.checked); });
    byId("notifySafetyAlerts").addEventListener("change", function () { setNotificationEventEnabled("safetyAlerts", this.checked); });
    byId("notifySettingsChanges").addEventListener("change", function () { setNotificationEventEnabled("settingsChanges", this.checked); });
    byId("notifyLowStorage").addEventListener("change", function () { setNotificationEventEnabled("lowStorage", this.checked); });
    document.addEventListener("click", function (event) {
      const drawer = byId("notificationDrawer");
      const quickTray = byId("quickActionTray");
      if (!drawer.hidden && !drawer.contains(event.target) && !byId("toggleNotifications").contains(event.target)) closeNotificationDrawer(false);
      if (!quickTray.hidden && !quickTray.contains(event.target) && !byId("toggleQuickActions").contains(event.target)) closeQuickActionTray(false);
    });
    byId("editProfile").addEventListener("click", function () { setSettingsTab("rendering"); });
    document.querySelectorAll("[data-preset]").forEach(function (button) {
      button.addEventListener("click", function () { applyRenderingPreset(button.dataset.preset, false); });
    });
    byId("useRecommendedPreset").addEventListener("click", function () {
      if (state.recommendedPreset) applyRenderingPreset(state.recommendedPreset, true);
    });
    byId("refreshDevice").addEventListener("click", refreshDeviceInfo);
    byId("probeRobloxLatency").addEventListener("click", probeRobloxWebLatency);
    byId("scanSafetySystem").addEventListener("click", function () { scanKnownExecutorProcesses(false); });
    byId("securityRescanProcesses").addEventListener("click", function () { scanKnownExecutorProcesses(false); });
    byId("securityOpenWindowsSecurity").addEventListener("click", function () { openWindowsSettings("security"); });
    byId("securityOpenProtection").addEventListener("click", function () { openWindowsSettings("security"); });
    byId("wireguardImportButton").addEventListener("click", function () {
      if (!this.disabled) byId("wireguardConfigFile").click();
    });
    byId("wireguardConfigFile").addEventListener("change", selectWireGuardConfig);
    byId("wireguardConnectButton").addEventListener("click", function () { openConfirmation("wireguard-connect"); });
    byId("wireguardDisconnectButton").addEventListener("click", function () { openConfirmation("wireguard-disconnect"); });
    byId("wireguardRemoveButton").addEventListener("click", function () { openConfirmation("wireguard-remove"); });
    byId("wireguardRefreshButton").addEventListener("click", refreshWireGuardStatus);
    byId("wireguardDownloadButton").addEventListener("click", openWireGuardDownload);
    byId("launchRoblox").addEventListener("click", launchRoblox);
    ["rejoinPlaceId", "rejoinGameInstanceId"].forEach(function (id) {
      byId(id).addEventListener("input", updateRejoinButton);
      byId(id).addEventListener("change", updateRejoinButton);
    });
    byId("rejoinSameServer").addEventListener("click", rejoinSameServer);
    byId("openLatestRelease").addEventListener("click", openLatestRelease);
    byId("joinDiscord").addEventListener("click", openCommunityDiscord);
    byId("openYoutubeChannel").addEventListener("click", openYoutubeChannel);
    byId("openRobloxProfile").addEventListener("click", openRobloxProfile);
    byId("robloxUserId").addEventListener("input", updateRobloxProfileButton);
    byId("robloxUserId").addEventListener("change", function () {
      const userId = normalizeRobloxUserId(this.value);
      if (userId) safeStorageSet(robloxUserIdKey, userId);
    });
    byId("robloxUserId").addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        openRobloxProfile();
      }
    });
    byId("saveBenchmarkBaseline").addEventListener("click", saveBenchmarkBaseline);
    byId("saveBenchmarkAfter").addEventListener("click", saveBenchmarkAfter);
    byId("clearBenchmarkJournal").addEventListener("click", clearBenchmarkJournal);
    byId("applyLaunch").addEventListener("click", function () { openConfirmation("apply-launch"); });
    byId("continueAfterStorageCheck").addEventListener("click", continueFromStorageNotice);
    byId("exitAfterStorageCheck").addEventListener("click", exitFromStorageNotice);
    byId("quickRefresh").addEventListener("click", quickRefresh);
    byId("scanAgain").addEventListener("click", detectRoblox);
    byId("versionGardenRefresh").addEventListener("click", detectRoblox);
    byId("troubleshootingIssue").addEventListener("change", renderTroubleshootingGuide);
    byId("troubleshootingAction").addEventListener("click", runTroubleshootingAction);
    byId("refreshPlayer").addEventListener("click", refreshPlayerStatus);
    byId("scanSafety").addEventListener("click", function () { scanKnownExecutorProcesses(false); });
    byId("openInstalledApps").addEventListener("click", function () { openWindowsSettings("apps"); });
    byId("openWindowsSecurity").addEventListener("click", function () { openWindowsSettings("security"); });
    byId("openGraphicsSettings").addEventListener("click", function () { openWindowsSettings("graphics"); });

    byId("modeSelect").addEventListener("change", function () {
      const values = {
        "Maximum performance": { tier: 6, texture: 0, geometryDistance: 64, vfx: true },
        "Balanced": { tier: 12, texture: 1, geometryDistance: 128, vfx: false },
        "High quality": { tier: 21, texture: 3, geometryDistance: 256, vfx: false }
      }[this.value];
      if (values) {
        byId("graphicsQuality").value = String(values.tier);
        byId("textureQuality").value = String(values.texture);
        byId("vfxToggle").checked = values.vfx;
        if (!state.geometryManuallyChanged) byId("geometryDistance").value = String(values.geometryDistance);
      } else if (!state.geometryManuallyChanged) {
        byId("geometryDistance").value = "64";
      }
      updateProfileDisplay();
    });
    byId("rendererSelect").addEventListener("change", updateProfileDisplay);
    byId("legacyFpsToggle").addEventListener("change", function () {
      updateProfileDisplay();
      if (this.checked) showToast("Experimental legacy FPS target enabled. Roblox may ignore it.", "warning");
    });
    ["graphicsQuality", "textureQuality", "fpsTarget", "geometryDistance"].forEach(function (id) {
      byId(id).addEventListener("input", function () {
        if (id === "geometryDistance") state.geometryManuallyChanged = true;
        updateProfileDisplay();
      });
      byId(id).addEventListener("change", updateProfileDisplay);
    });
    ["vfxToggle", "allVersionsToggle"].forEach(function (id) {
      byId(id).addEventListener("change", updateProfileDisplay);
    });
    byId("profileNameInput").addEventListener("input", updateSavedProfileControls);
    byId("profileLibrarySelect").addEventListener("change", function () {
      state.selectedSavedProfileId = this.value;
      const selected = state.savedProfiles.find((item) => item.id === this.value);
      if (selected) byId("profileNameInput").value = selected.name;
      updateSavedProfileControls();
    });
    ["tuningProfileA", "tuningProfileB"].forEach(function (id) {
      byId(id).addEventListener("change", renderTuningComparison);
    });
    byId("compareTuningProfiles").addEventListener("click", renderTuningComparison);
    byId("stageTuningProfileA").addEventListener("click", function () { stageTuningProfile(byId("tuningProfileA").value); });
    byId("stageTuningProfileB").addEventListener("click", function () { stageTuningProfile(byId("tuningProfileB").value); });
    byId("saveNamedProfile").addEventListener("click", saveNamedProfile);
    byId("loadSavedProfile").addEventListener("click", loadSelectedProfile);
    byId("exportSavedProfile").addEventListener("click", exportSelectedProfile);
    byId("deleteSavedProfile").addEventListener("click", function () { openConfirmation("delete-profile"); });
    byId("importSavedProfileButton").addEventListener("click", function () { byId("importSavedProfileFile").click(); });
    byId("importSavedProfileFile").addEventListener("change", function () { importSavedProfile(this.files && this.files[0]); });
    byId("saveProfile").addEventListener("click", function () {
      const profile = currentProfile();
      writeProfile(profile);
      downloadJson("marktis-optimizer-profile.json", { schemaVersion: 1, product: "Marktis Optimizer", profile: profile });
      showToast("Current profile exported as JSON.", "success");
    });
    byId("restoreSettings").addEventListener("click", function () { openConfirmation("restore"); });
    byId("applySettings").addEventListener("click", function () { openConfirmation("apply"); });
    byId("acceptConfirm").addEventListener("click", confirmAction);
    byId("cancelConfirm").addEventListener("click", closeConfirmation);
    byId("confirmOverlay").addEventListener("click", function (event) {
      if (event.target === byId("confirmOverlay") && !byId("acceptConfirm").disabled) closeConfirmation();
    });

    byId("allowlistSearch").addEventListener("input", renderAllowlist);
    byId("allowlistFilters").addEventListener("click", function (event) {
      const button = event.target.closest("[data-filter-category]");
      if (!button) return;
      state.allowlistFilter = button.dataset.filterCategory;
      byId("allowlistFilters").querySelectorAll("[data-filter-category]").forEach(function (chip) {
        const active = chip.dataset.filterCategory === state.allowlistFilter;
        chip.classList.toggle("is-active", active);
        chip.setAttribute("aria-pressed", active ? "true" : "false");
      });
      renderAllowlist();
    });
    byId("exportAllowlist").addEventListener("click", function () {
      downloadJson("marktis-optimizer-fastflags-allowlist.json", state.allowlist);
      showToast("Canonical allowlist exported.", "success");
    });

    byId("animeThemeSearch").addEventListener("input", renderAnimeThemes);
    byId("animeThemeGrid").addEventListener("click", function (event) {
      const button = event.target.closest("[data-anime-theme-id]");
      if (button) selectAnimeTheme(button.dataset.animeThemeId);
    });
    byId("clearAnimeTheme").addEventListener("click", function () { selectAnimeTheme("none"); });

    document.querySelectorAll("[data-icon-style-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        const appearance = readAppearance();
        appearance.iconStyle = button.dataset.iconStyleChoice;
        applyAppearance(appearance);
        showToast("Desktop icon appearance updated locally.", "success");
      });
    });
    document.querySelectorAll("[data-accent-choice]").forEach(function (button) {
      button.addEventListener("click", function () {
        const appearance = readAppearance();
        appearance.accent = button.dataset.accentChoice;
        applyAppearance(appearance);
        showToast("Desktop accent color updated locally.", "success");
      });
    });

    document.addEventListener("keydown", function (event) {
      const overlay = byId("confirmOverlay");
      const storageOverlay = byId("storageNoticeOverlay");
      if (!storageOverlay.hidden && event.key === "Tab") {
        trapStorageNoticeFocus(event);
        return;
      }
      if (!storageOverlay.hidden && event.key === "Escape") {
        event.preventDefault();
        return;
      }
      if (!overlay.hidden && event.key === "Tab") {
        trapConfirmationFocus(event);
        return;
      }
      if (!overlay.hidden && event.key === "Escape") {
        event.preventDefault();
        if (!byId("acceptConfirm").disabled) closeConfirmation();
        return;
      }
      if (!byId("quickActionTray").hidden && event.key === "Escape") {
        event.preventDefault();
        closeQuickActionTray();
        return;
      }
      if (!byId("notificationDrawer").hidden && event.key === "Escape") {
        event.preventDefault();
        closeNotificationDrawer();
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        if (overlay.hidden && storageOverlay.hidden && !event.repeat) quickRefresh();
        return;
      }
      if (overlay.hidden && storageOverlay.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSettingsTab("allowlist");
        byId("allowlistSearch").focus();
      }
    });
    listenForSystemTrayActions();
  }

  async function loadAllowlist() {
    if (invoke) {
      try { state.allowlist = await invoke("get_allowlist"); } catch (_error) { state.allowlist = fallbackAllowlist; }
    }
    if (!state.allowlist || !Array.isArray(state.allowlist.categories)) state.allowlist = fallbackAllowlist;
    refreshAllowlist();
  }

  async function boot() {
    state.notificationPrefs = readNotificationPreferences();
    state.notificationHistory = readNotificationHistory();
    renderNotificationPreferences();
    renderNotificationCenter();
    const initialProfile = readProfile();
    state.savedProfiles = readSavedProfiles();
    renderSavedProfiles();
    const modeDefaultDistance = initialProfile.mode === "Balanced" ? 128 : (initialProfile.mode === "High quality" ? 256 : 64);
    state.geometryManuallyChanged = initialProfile.geometryDistance !== modeDefaultDistance;
    applyProfileToControls(initialProfile);
    applyAppearance(readAppearance());
    byId("robloxUserId").value = normalizeRobloxUserId(safeStorageGet(robloxUserIdKey) || "");
    updateRobloxProfileButton();
    const rejoinTarget = readRejoinTarget();
    byId("rejoinPlaceId").value = rejoinTarget.placeId;
    byId("rejoinGameInstanceId").value = rejoinTarget.gameInstanceId;
    updateRejoinButton();
    state.benchmarkJournal = readBenchmarkJournal();
    renderBenchmarkJournal();
    renderTroubleshootingGuide();
    const allowlistTask = loadAllowlist();
    if (!invoke) {
      await allowlistTask;
      byId("buildLabel").textContent = "PREVIEW · WINDOWS APP REQUIRED";
      byId("installBadge").textContent = "DESKTOP ONLY";
      byId("installBadge").className = "state-pill state-pending";
      byId("installTitle").textContent = "Packaged Windows app required";
      byId("installDetail").textContent = "This standalone layout previews the desktop client. Local detection and settings writes run only in the packaged Windows desktop app.";
      byId("playerBadge").textContent = "DESKTOP ONLY";
      byId("playerBadge").className = "state-pill state-pending";
      byId("playerTitle").textContent = "Windows desktop runtime required";
      byId("playerDetail").textContent = "The website does not inspect running processes.";
      byId("versionCount").textContent = "—";
      byId("settingsCount").textContent = "—";
      renderVersionGarden(null, "The local Roblox install map is available in the packaged Windows desktop app.");
      ["quickActionSettingsFolder", "quickActionLaunch", "quickActionRestore", "quickActionRefresh"].forEach(function (id) { byId(id).disabled = true; });
      byId("applySettings").disabled = true;
      byId("restoreSettings").disabled = true;
      byId("launchRoblox").disabled = true;
      byId("applyLaunch").disabled = true;
      byId("openLatestRelease").disabled = true;
      byId("refreshPlayer").disabled = true;
      byId("refreshDevice").disabled = true;
      byId("probeRobloxLatency").disabled = true;
      byId("useRecommendedPreset").disabled = true;
      byId("scanSafetySystem").disabled = true;
      renderDeviceSnapshot(null, "Local hardware inventory is available only in the packaged Windows app.");
      renderSafetyScan(null, "Local process scanning is available only in the packaged Windows app.");
      renderWireGuardStatus(null, "WireGuard integration is available only in the packaged Windows app.");
      renderSystemClientStatus();
      setBoot("Standalone desktop layout ready · no remote assets", 100);
      finishBoot();
      return;
    }

    setBoot("Connecting to the local Windows client…", 24);
    const fallbackTimer = window.setTimeout(finishBoot, 8000);
    const infoTask = invoke("app_info").then(function (info) {
      state.appInfo = info;
      const version = info && info.version ? "V" + info.version : "V4";
      byId("sidebarVersion").textContent = version;
      byId("buildLabel").textContent = version;
    }).catch(function () { /* Product metadata is non-critical. */ });
    const detectionTask = detectRoblox();
    const playerTask = refreshPlayerStatus();
    const safetyTask = scanKnownExecutorProcesses(true);
    const storageTask = loadStartupStorageSnapshot();
    Promise.allSettled([allowlistTask, infoTask, detectionTask, playerTask, safetyTask, storageTask]).then(function () {
      window.clearTimeout(fallbackTimer);
      finishBoot();
      showStartupStorageNotice();
    });
    window.setInterval(refreshPlayerStatus, 10000);
    window.setInterval(updatePlayerRuntime, 1000);
    window.setInterval(function () { scanKnownExecutorProcesses(true); }, 30000);
  }

  wireEvents();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { boot(); }, { once: true });
  } else {
    boot();
  }
})();
