/* Marktis Optimizer standalone Windows desktop UI, shared by the Tauri and Electron builds.
 * No website bundle or remote code. A fixed TCP probe is user-triggered in the local backend.
 * No process handles or game-memory access; settings use the narrow local bridge.
 */
(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const invoke = resolveInvoke();
  const profileKey = "roptimer.desktop.profile.v1";
  const appearanceKey = "roptimer.desktop.appearance.v1";
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
    recommendedPreset: null,
    latencyPending: false,
    appInfo: null,
    allowlist: fallbackAllowlist,
    allowlistFilter: "all",
    geometryManuallyChanged: false,
    pendingAction: null,
    confirmReturnFocus: null,
    statusPending: false,
    safetyScanPending: false,
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

  function readProfile() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(profileKey) || "null"); } catch (_error) { stored = null; }
    const values = stored && typeof stored === "object" ? stored : {};
    return {
      mode: ["Reduce building lag", "Maximum performance", "Balanced", "High quality"].includes(values.mode) ? values.mode : defaultProfile.mode,
      tier: clampInteger(values.tier, 0, 21, defaultProfile.tier),
      texture: clampInteger(values.texture, 0, 3, defaultProfile.texture),
      renderer: ["Auto", "Direct3D 11", "Vulkan", "OpenGL"].includes(values.renderer) ? values.renderer : defaultProfile.renderer,
      fps: clampInteger(values.fps, 60, 1000, defaultProfile.fps),
      legacyFps: typeof values.legacyFps === "boolean" ? values.legacyFps : defaultProfile.legacyFps,
      geometryDistance: clampInteger(values.geometryDistance, 32, 256, defaultProfile.geometryDistance),
      vfx: typeof values.vfx === "boolean" ? values.vfx : defaultProfile.vfx,
      allVersions: typeof values.allVersions === "boolean" ? values.allVersions : defaultProfile.allVersions
    };
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

  function renderDetection(result, error) {
    state.detection = result || null;
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

  function renderActivePlayer(result, error) {
    state.activePlayer = result || null;
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
    const matches = result && Array.isArray(result.matches) ? result.matches : [];
    matchesHost.replaceChildren();
    appsButton.hidden = true;
    securityButton.hidden = true;
    scanButton.disabled = !invoke || state.safetyScanPending;

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
      if (!result.available) addSummary("The scan was incomplete; displayed matches are still name-only results.");
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
      return;
    }

    badge.textContent = "NO MATCH";
    badge.className = "state-pill state-found";
    detail.textContent = result.message;
    addSummary("No exact Xeno.exe, Solara.exe, JJSploit.exe, or Delta.exe process name was found. This is not an antivirus verdict.");
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
    if (!Number.isFinite(bytes) || bytes <= 0) return "Unknown";
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

  async function scanKnownExecutorProcesses(silent) {
    if (!invoke) {
      state.executorScan = null;
      renderSafetyScan(null, "Open the packaged Windows app to scan local process names.");
      renderSystemClientStatus();
      return null;
    }
    if (state.safetyScanPending) return null;
    state.safetyScanPending = true;
    const button = byId("scanSafety");
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    byId("safetyScanBadge").textContent = "SCANNING";
    byId("safetyScanBadge").className = "state-pill state-pending";
    byId("safetyScanDetail").textContent = "Checking only the allowlisted process names on this device…";
    try {
      const result = await invoke("scan_known_executor_processes");
      state.executorScan = result;
      renderSafetyScan(result);
      renderSystemClientStatus();
      const matches = result && Array.isArray(result.matches) ? result.matches : [];
      if (matches.length) {
        const signature = matches.map(function (match) {
          return String(match.processName || match.productName || "").toLowerCase();
        }).filter(Boolean).sort().join("|");
        if (signature && signature !== state.lastSafetyAlertSignature) {
          showToast("Local safety alert: review the possible process-name match on Main.", "warning");
        }
        if (signature) state.lastSafetyAlertSignature = signature;
      } else if (result && result.available) {
        state.lastSafetyAlertSignature = "";
      }
      return result;
    } catch (error) {
      const message = error && error.message ? error.message : String(error);
      state.executorScan = null;
      renderSafetyScan(null, message);
      renderSystemClientStatus();
      if (!silent) showToast("Local process scan unavailable: " + message, "warning");
      return null;
    } finally {
      state.safetyScanPending = false;
      button.disabled = false;
      button.removeAttribute("aria-busy");
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
    const selected = ["rendering", "geometry", "icons", "allowlist", "system"].includes(name) ? name : "rendering";
    byId("settingsView").hidden = false;
    byId("mainView").hidden = true;
    byId("navMain").classList.remove("is-active");
    byId("navMain").removeAttribute("aria-current");
    byId("navSettings").classList.add("is-active");
    byId("navSettings").setAttribute("aria-expanded", "true");
    byId("settingsSubnav").hidden = false;
    byId("breadcrumbTitle").textContent = "Settings · " + capitalize(selected);
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
    if (!invoke) {
      showToast("Open the packaged Windows desktop app to apply local Roblox settings.", "warning");
      return;
    }
    state.pendingAction = action;
    state.confirmReturnFocus = document.activeElement;
    const isRestore = action === "restore";
    const isApplyLaunch = action === "apply-launch";
    const profile = currentProfile();
    byId("confirmEyebrow").textContent = isRestore ? "LOCAL SETTINGS · RESTORE" : "LOCAL SETTINGS · BACKUP FIRST";
    byId("confirmTitle").textContent = isRestore ? "Restore managed settings?" : (isApplyLaunch ? "Apply and launch Roblox?" : "Apply this profile?");
    if (isRestore) {
      byId("confirmText").textContent = "Marktis Optimizer will remove canonical managed keys and the separate legacy FPS key from detected settings files. Unrelated JSON keys stay untouched; new backups are created first.";
    } else {
      let message = "Marktis Optimizer will back up each target file, then apply your local profile. Unrelated JSON keys stay untouched.";
      if (profile.legacyFps) message += " The opt-in legacy FPS target (" + profile.fps + ") is outside Roblox's current allowlist and may be ignored.";
      if (isApplyLaunch) message += " If settings are applied successfully, Roblox will open through the normal roblox:// protocol.";
      byId("confirmText").textContent = message;
    }
    byId("confirmOverlay").hidden = false;
    byId("cancelConfirm").focus();
  }

  function closeConfirmation() {
    byId("confirmOverlay").hidden = true;
    state.pendingAction = null;
    const returnFocus = state.confirmReturnFocus;
    state.confirmReturnFocus = null;
    if (returnFocus && returnFocus.isConnected && typeof returnFocus.focus === "function") returnFocus.focus();
  }

  async function confirmAction() {
    const action = state.pendingAction;
    if (!action || !invoke) return closeConfirmation();
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
    } else {
      showToast(result && result.message ? result.message : "No settings files were changed; Roblox was not launched.", "warning");
    }
    await detectRoblox();
    updateProfileDisplay();
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

  async function quickRefresh() {
    const button = byId("quickRefresh");
    if (button) button.disabled = true;
    await Promise.all([detectRoblox(), refreshPlayerStatus()]);
    if (button) button.disabled = false;
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
    byId("launchRoblox").addEventListener("click", launchRoblox);
    byId("applyLaunch").addEventListener("click", function () { openConfirmation("apply-launch"); });
    byId("quickRefresh").addEventListener("click", quickRefresh);
    byId("scanAgain").addEventListener("click", detectRoblox);
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
    byId("saveProfile").addEventListener("click", function () {
      const profile = currentProfile();
      writeProfile(profile);
      downloadJson("marktis-optimizer-profile.json", { schemaVersion: 1, product: "Marktis Optimizer", profile: profile });
      showToast("Profile saved locally and exported as JSON.", "success");
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
      if (!overlay.hidden && event.key === "Tab") {
        trapConfirmationFocus(event);
        return;
      }
      if (!overlay.hidden && event.key === "Escape") {
        event.preventDefault();
        if (!byId("acceptConfirm").disabled) closeConfirmation();
        return;
      }
      if (overlay.hidden && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSettingsTab("allowlist");
        byId("allowlistSearch").focus();
      }
    });
  }

  async function loadAllowlist() {
    if (invoke) {
      try { state.allowlist = await invoke("get_allowlist"); } catch (_error) { state.allowlist = fallbackAllowlist; }
    }
    if (!state.allowlist || !Array.isArray(state.allowlist.categories)) state.allowlist = fallbackAllowlist;
    refreshAllowlist();
  }

  async function boot() {
    const initialProfile = readProfile();
    const modeDefaultDistance = initialProfile.mode === "Balanced" ? 128 : (initialProfile.mode === "High quality" ? 256 : 64);
    state.geometryManuallyChanged = initialProfile.geometryDistance !== modeDefaultDistance;
    applyProfileToControls(initialProfile);
    applyAppearance(readAppearance());
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
      byId("applySettings").disabled = true;
      byId("restoreSettings").disabled = true;
      byId("launchRoblox").disabled = true;
      byId("applyLaunch").disabled = true;
      byId("refreshPlayer").disabled = true;
      byId("refreshDevice").disabled = true;
      byId("probeRobloxLatency").disabled = true;
      byId("useRecommendedPreset").disabled = true;
      byId("scanSafetySystem").disabled = true;
      renderDeviceSnapshot(null, "Local hardware inventory is available only in the packaged Windows app.");
      renderSafetyScan(null, "Local process scanning is available only in the packaged Windows app.");
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
    Promise.allSettled([allowlistTask, infoTask, detectionTask, playerTask, safetyTask]).then(function () {
      window.clearTimeout(fallbackTimer);
      finishBoot();
    });
    window.setInterval(refreshPlayerStatus, 10000);
    window.setInterval(function () { scanKnownExecutorProcesses(true); }, 30000);
  }

  wireEvents();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { boot(); }, { once: true });
  } else {
    boot();
  }
})();
