/* Roptimer standalone Tauri desktop UI.
 * No website bundle, remote code, network calls, process handles, or game memory.
 * All app settings are local; Roblox writes go through the Rust allowlist commands.
 */
(function () {
  "use strict";

  const byId = (id) => document.getElementById(id);
  const invoke = resolveInvoke();
  const profileKey = "roptimer.desktop.profile.v1";
  const appearanceKey = "roptimer.desktop.appearance.v1";
  const defaultProfile = {
    mode: "Reduce building lag",
    tier: 21,
    texture: 0,
    geometryDistance: 64,
    vfx: true,
    allVersions: true
  };
  const defaultAppearance = { accent: "mint", iconStyle: "outline" };
  const fallbackAllowlist = readEmbeddedAllowlist();
  let bootFinishScheduled = false;
  const bootStartedAt = Date.now();
  const minimumBootVisibleMs = 850;
  const state = {
    detection: null,
    activePlayer: null,
    appInfo: null,
    allowlist: fallbackAllowlist,
    allowlistFilter: "all",
    geometryManuallyChanged: false,
    pendingAction: null,
    statusPending: false,
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
    } catch (_error) { /* Tauri bridge is not exposed in a browser preview. */ }
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
      mode: values.mode === "Balanced" ? "Balanced" : defaultProfile.mode,
      tier: clampInteger(values.tier, 0, 21, defaultProfile.tier),
      texture: clampInteger(values.texture, 0, 3, defaultProfile.texture),
      geometryDistance: clampInteger(values.geometryDistance, 32, 256, defaultProfile.geometryDistance),
      vfx: typeof values.vfx === "boolean" ? values.vfx : defaultProfile.vfx,
      allVersions: typeof values.allVersions === "boolean" ? values.allVersions : defaultProfile.allVersions
    };
  }

  function readAppearance() {
    let stored = null;
    try { stored = JSON.parse(safeStorageGet(appearanceKey) || "null"); } catch (_error) { stored = null; }
    const values = stored && typeof stored === "object" ? stored : {};
    return {
      accent: ["mint", "amber", "blue"].includes(values.accent) ? values.accent : defaultAppearance.accent,
      iconStyle: ["outline", "bold", "minimal"].includes(values.iconStyle) ? values.iconStyle : defaultAppearance.iconStyle
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
      geometryDistance: clampInteger(byId("geometryDistance").value, 32, 256, defaultProfile.geometryDistance),
      vfx: byId("vfxToggle").checked,
      allVersions: byId("allVersionsToggle").checked
    };
  }

  function applyProfileToControls(profile) {
    byId("modeSelect").value = profile.mode;
    byId("graphicsQuality").value = String(profile.tier);
    byId("textureQuality").value = String(profile.texture);
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
    if (graphicsOut) graphicsOut.value = String(profile.tier);
    if (textureOut) textureOut.value = String(profile.texture);
    byId("geometryDistanceValue").textContent = String(profile.geometryDistance);
    byId("lodBase").textContent = String(profile.geometryDistance);
    byId("lodL12").textContent = String(profile.geometryDistance);
    byId("lodL23").textContent = String(Math.floor(profile.geometryDistance / 2));
    byId("lodL34").textContent = String(Math.floor(profile.geometryDistance / 4));
    byId("profileTitle").textContent = profile.mode;
    byId("profileModeLabel").textContent = profile.mode === "Balanced" ? "BALANCED" : "PERFORMANCE";
    byId("summaryGraphics").textContent = profile.tier + " / 21";
    byId("summaryTexture").textContent = profile.texture + " / 3";
    byId("summaryGeometry").textContent = profile.geometryDistance + " studs";
    scheduleProfileSave();
  }

  function applyAppearance(appearance) {
    document.documentElement.dataset.accent = appearance.accent;
    document.documentElement.dataset.iconStyle = appearance.iconStyle;
    document.querySelectorAll("[data-accent-choice]").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.accentChoice === appearance.accent);
      button.setAttribute("aria-pressed", button.dataset.accentChoice === appearance.accent ? "true" : "false");
    });
    document.querySelectorAll("[data-icon-style-choice]").forEach(function (button) {
      button.classList.toggle("is-selected", button.dataset.iconStyleChoice === appearance.iconStyle);
      button.setAttribute("aria-pressed", button.dataset.iconStyleChoice === appearance.iconStyle ? "true" : "false");
    });
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

  function setView(name) {
    const view = name === "settings" ? "settings" : "main";
    byId("mainView").hidden = view !== "main";
    byId("settingsView").hidden = view !== "settings";
    byId("navMain").classList.toggle("is-active", view === "main");
    if (view === "main") byId("navMain").setAttribute("aria-current", "page");
    else byId("navMain").removeAttribute("aria-current");
    byId("navSettings").classList.toggle("is-active", view === "settings");
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
    const selected = ["rendering", "geometry", "icons", "allowlist"].includes(name) ? name : "rendering";
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
      tab.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".settings-pane").forEach(function (pane) {
      const active = pane.dataset.pane === selected;
      pane.hidden = !active;
      pane.classList.toggle("is-active", active);
    });
    byId("pageScroll").scrollTop = 0;
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
      button.setAttribute("role", "tab");
      button.setAttribute("aria-selected", state.allowlistFilter === item.key ? "true" : "false");
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
    const isApply = action === "apply";
    byId("confirmEyebrow").textContent = isApply ? "LOCAL SETTINGS · BACKUP FIRST" : "LOCAL SETTINGS · RESTORE";
    byId("confirmTitle").textContent = isApply ? "Apply this profile?" : "Restore managed settings?";
    byId("confirmText").textContent = isApply
      ? "Roptimer will back up each target file, then update only canonical allowlisted keys. Unrelated JSON keys stay untouched."
      : "Roptimer will remove only the keys it manages from detected settings files. Unrelated JSON keys stay untouched; new backups are created first.";
    byId("confirmOverlay").hidden = false;
    byId("cancelConfirm").focus();
  }

  function closeConfirmation() {
    byId("confirmOverlay").hidden = true;
    state.pendingAction = null;
  }

  async function confirmAction() {
    const action = state.pendingAction;
    if (!action || !invoke) return closeConfirmation();
    const accept = byId("acceptConfirm");
    accept.disabled = true;
    accept.textContent = action === "apply" ? "Applying…" : "Restoring…";
    try {
      let result;
      if (action === "apply") result = await invoke("apply_settings", { profile: currentProfile() });
      else result = await invoke("restore_settings");
      closeConfirmation();
      if (result && result.applied) {
        showToast(result.message || (action === "apply" ? "Settings applied with backups." : "Managed settings restored."), "success");
      } else {
        showToast(result && result.message ? result.message : "No settings files were changed.", "warning");
      }
      await detectRoblox();
      updateProfileDisplay();
    } catch (error) {
      closeConfirmation();
      showToast((action === "apply" ? "Apply failed: " : "Restore failed: ") + (error && error.message ? error.message : String(error)), "error");
    } finally {
      accept.disabled = false;
      accept.textContent = "Confirm";
    }
  }

  async function quickRefresh() {
    const button = byId("quickRefresh");
    if (button) button.disabled = true;
    await Promise.all([detectRoblox(), refreshPlayerStatus()]);
    if (button) button.disabled = false;
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
    byId("mainOpenSettings").addEventListener("click", function () { setView("settings"); });
    byId("editProfile").addEventListener("click", function () { setSettingsTab("rendering"); });
    byId("quickRefresh").addEventListener("click", quickRefresh);
    byId("scanAgain").addEventListener("click", detectRoblox);
    byId("refreshPlayer").addEventListener("click", refreshPlayerStatus);

    byId("modeSelect").addEventListener("change", function () {
      if (!state.geometryManuallyChanged) {
        byId("geometryDistance").value = this.value === "Balanced" ? "128" : "64";
      }
      updateProfileDisplay();
    });
    ["graphicsQuality", "textureQuality", "geometryDistance"].forEach(function (id) {
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
      downloadJson("roptimer-profile.json", { schemaVersion: 1, product: "Roptimer", profile: profile });
      showToast("Profile saved locally and exported as JSON.", "success");
    });
    byId("restoreSettings").addEventListener("click", function () { openConfirmation("restore"); });
    byId("applySettings").addEventListener("click", function () { openConfirmation("apply"); });
    byId("acceptConfirm").addEventListener("click", confirmAction);
    byId("cancelConfirm").addEventListener("click", closeConfirmation);
    byId("confirmOverlay").addEventListener("click", function (event) {
      if (event.target === byId("confirmOverlay")) closeConfirmation();
    });

    byId("allowlistSearch").addEventListener("input", renderAllowlist);
    byId("allowlistFilters").addEventListener("click", function (event) {
      const button = event.target.closest("[data-filter-category]");
      if (!button) return;
      state.allowlistFilter = button.dataset.filterCategory;
      renderAllowlistFilters();
      renderAllowlist();
    });
    byId("exportAllowlist").addEventListener("click", function () {
      downloadJson("roptimer-fastflags-allowlist.json", state.allowlist);
      showToast("Canonical allowlist exported.", "success");
    });

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
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSettingsTab("allowlist");
        byId("allowlistSearch").focus();
      }
      if (event.key === "Escape" && !byId("confirmOverlay").hidden) closeConfirmation();
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
    applyProfileToControls(readProfile());
    applyAppearance(readAppearance());
    const allowlistTask = loadAllowlist();
    if (!invoke) {
      await allowlistTask;
      byId("buildLabel").textContent = "PREVIEW · WINDOWS APP REQUIRED";
      byId("installBadge").textContent = "DESKTOP ONLY";
      byId("installBadge").className = "state-pill state-pending";
      byId("installTitle").textContent = "Packaged Windows app required";
      byId("installDetail").textContent = "This standalone layout previews the desktop client. Local detection and writes run only in the packaged Tauri executable.";
      byId("playerBadge").textContent = "DESKTOP ONLY";
      byId("playerBadge").className = "state-pill state-pending";
      byId("playerTitle").textContent = "Windows desktop runtime required";
      byId("playerDetail").textContent = "The website does not inspect running processes.";
      byId("versionCount").textContent = "—";
      byId("settingsCount").textContent = "—";
      byId("applySettings").disabled = true;
      byId("restoreSettings").disabled = true;
      byId("refreshPlayer").disabled = true;
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
    Promise.allSettled([allowlistTask, infoTask, detectionTask, playerTask]).then(function () {
      window.clearTimeout(fallbackTimer);
      finishBoot();
    });
    window.setInterval(refreshPlayerStatus, 10000);
  }

  wireEvents();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { boot(); }, { once: true });
  } else {
    boot();
  }
})();
