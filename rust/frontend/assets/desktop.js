/* Roptimer — Tauri (Rust) desktop bridge.
 *
 * This file is a harmless no-op on the static GitHub Pages website. When the
 * exact same UI is loaded inside the Rust + Tauri Windows client, it talks to
 * the local Rust backend via Tauri's IPC (no network, no eval, no remote code).
 *
 * The headline feature: on first launch the app DETECTS whether Roblox is
 * installed (filesystem/registry reads only) and reports the result here.
 * Safety: detection is read-only; apply/restore only touch allowlisted keys in
 * ClientAppSettings.json with timestamped backups. No injection, no memory
 * reads, no telemetry disabling, no game script execution. The live status
 * card checks the Roblox Player image name only; it never reads command lines,
 * game/server details, account data, or process memory.
 */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };

  /* Resolve Tauri v2's invoke regardless of whether withGlobalTauri is on. */
  function resolveInvoke() {
    try {
      if (window.__TAURI__ && window.__TAURI__.core && typeof window.__TAURI__.core.invoke === "function") {
        return window.__TAURI__.core.invoke.bind(window.__TAURI__.core);
      }
      if (window.__TAURI__ && typeof window.__TAURI__.invoke === "function") {
        return window.__TAURI__.invoke.bind(window.__TAURI__);
      }
      if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === "function") {
        return window.__TAURI_INTERNALS__.invoke.bind(window.__TAURI_INTERNALS__);
      }
    } catch (error) { /* fall through */ }
    return null;
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  var invoke = resolveInvoke();
  var inTauri = !!invoke;

  /* Public, read-only test hook (also used by the JSDOM self-test). */
  window.RoptimerDesktop = {
    isTauri: inTauri,
    detection: null,
    activeClient: null,
    appInfo: null
  };

  if (!inTauri) {
    document.documentElement.classList.remove("is-tauri-loading");
    return; // static website: keep the default "download the app" panel
  }

  document.body.classList.add("is-desktop", "is-booting");
  var bootStartedAt = Date.now();
  var bootSplash = $("#appBootSplash");
  var bootStatus = $("#appBootStatus");
  var bootProgress = $("#appBootProgress");
  var bootFinishScheduled = false;
  if (bootSplash) bootSplash.setAttribute("aria-hidden", "false");

  function setBootProgress(message, value) {
    if (!document.body.classList.contains("is-booting")) return;
    var amount = Math.max(0, Math.min(100, Number(value) || 0));
    if (bootStatus) bootStatus.textContent = message;
    if (bootProgress) bootProgress.style.width = amount + "%";
    if (bootProgress && bootProgress.parentElement) {
      bootProgress.parentElement.setAttribute("aria-valuenow", String(Math.round(amount)));
    }
  }

  function finishBoot() {
    if (bootFinishScheduled) return;
    bootFinishScheduled = true;
    setBootProgress("Ready · opening your Client workspace", 100);
    // Keep the branded splash visible briefly so fast PCs still see the transition.
    var minimumDuration = 1050;
    var remaining = Math.max(0, minimumDuration - (Date.now() - bootStartedAt));
    window.setTimeout(function () {
      document.body.classList.remove("is-booting");
      document.body.classList.add("is-ready");
      document.documentElement.classList.remove("is-tauri-loading");
      if (bootSplash) bootSplash.setAttribute("aria-hidden", "true");
    }, remaining);
  }

  var panel = $("#detectPanel");
  var titleEl = $("#detectTitle");
  var textEl = $("#detectText");
  var metaEl = $("#detectMeta");
  var previewEl = $("#settingsPreview");
  var activeClientCard = $("#activeClientCard");
  var activeClientTitle = $("#activeClientTitle");
  var activeClientText = $("#activeClientText");
  var activeClientBadge = $("#activeClientBadge");
  var refreshActiveClientButton = $("#refreshActiveClient");
  var openClientOptimizerButton = $("#openClientOptimizer");
  var activeStatusPending = false;

  function setPanel(state, title, text, chips) {
    if (!panel) return;
    panel.setAttribute("data-state", state);
    if (titleEl) titleEl.textContent = title;
    if (textEl) textEl.textContent = text;
    if (metaEl) {
      metaEl.innerHTML = (chips || []).map(function (c) {
        return '<span class="chip"><b>' + escapeHtml(c.value) + '</b> ' + escapeHtml(c.label) + '</span>';
      }).join("");
      var rescan = document.createElement("button");
      rescan.type = "button";
      rescan.className = "button ghost small";
      rescan.id = "rescanRoblox";
      rescan.textContent = "Re-scan";
      rescan.addEventListener("click", runDetection);
      metaEl.appendChild(rescan);
    }
  }

  function runDetection() {
    setBootProgress("Scanning standard Roblox installation folders…", 66);
    setPanel("checking", "Detecting your Roblox installation…", "Scanning standard Windows Roblox version folders. Read-only.", []);
    return invoke("detect_roblox")
      .then(function (result) {
        window.RoptimerDesktop.detection = result;
        var found = !!result.installed;
        var versionCount = (result.versions && result.versions.length) || 0;
        var settingsCount = (result.client_settings_paths && result.client_settings_paths.length) || 0;
        var chips = [
          { value: String(versionCount), label: versionCount === 1 ? "version folder" : "version folders" },
          { value: String(settingsCount), label: settingsCount === 1 ? "settings file" : "settings files" },
          { value: result.platform || "windows", label: "platform" }
        ];
        if (found) {
          setPanel("found", "Roblox is installed", result.message ||
            "Roptimer found your Roblox client and can manage allowlisted local settings safely.", chips);
          setBootProgress("Roblox found · securing your local settings workspace", 91);
        } else {
          setPanel("missing", "Roblox was not detected", result.message ||
            "Install the Roblox desktop client from roblox.com, then re-scan.", chips);
          setBootProgress("Client ready · Roblox was not detected", 91);
        }
        return result;
      })
      .catch(function (error) {
        setPanel("missing", "Detection unavailable", String(error && error.message ? error.message : error), []);
        setBootProgress("Client ready · install detection is unavailable", 91);
        return null;
      });
  }

  function renderActiveClient(result) {
    window.RoptimerDesktop.activeClient = result;
    if (!activeClientCard) return;

    var state = !result || !result.supported ? "unsupported" : !result.available ? "unavailable" : result.running ? "running" : "idle";
    var title = state === "running" ? "Roblox Player is open" :
      state === "idle" ? "Roblox Player is not running" :
      state === "unsupported" ? "Live status is Windows-only" : "Live status is unavailable";
    var badge = state === "running" ? "OPEN" :
      state === "idle" ? "NOT RUNNING" :
      state === "unsupported" ? "WINDOWS ONLY" : "RETRY";
    var note = "This only confirms the Player process is open, not that an experience is loaded. No game title, thumbnail, server, account, command line, or memory data is collected.";

    activeClientCard.setAttribute("data-state", state);
    if (activeClientTitle) activeClientTitle.textContent = title;
    if (activeClientText) activeClientText.textContent = (result && result.message ? result.message + " " : "") + note;
    if (activeClientBadge) activeClientBadge.textContent = badge;
  }

  function refreshActiveClient() {
    if (activeStatusPending) return Promise.resolve(null);
    activeStatusPending = true;
    if (refreshActiveClientButton) refreshActiveClientButton.disabled = true;
    return invoke("active_roblox_status")
      .then(function (result) {
        renderActiveClient(result || {});
        return result;
      })
      .catch(function () {
        renderActiveClient({ supported: true, available: false, running: false, message: "Could not check Roblox Player status." });
        return null;
      })
      .then(function (result) {
        activeStatusPending = false;
        if (refreshActiveClientButton) refreshActiveClientButton.disabled = false;
        return result;
      });
  }

  if (refreshActiveClientButton) {
    refreshActiveClientButton.addEventListener("click", refreshActiveClient);
  }
  if (openClientOptimizerButton) {
    openClientOptimizerButton.addEventListener("click", function () {
      var builder = $("#settingsBuilder");
      if (builder && builder.scrollIntoView) builder.scrollIntoView({ behavior: "smooth", block: "center" });
      var mode = $("#modeSelect");
      window.setTimeout(function () { if (mode && mode.focus) mode.focus(); }, 300);
    });
  }

  function currentProfile() {
    return {
      mode: ($("#modeSelect") && $("#modeSelect").value) || "Reduce building lag",
      tier: Number(($("#tierRange") && $("#tierRange").value) || 21),
      texture: Number(($("#textureRange") && $("#textureRange").value) || 0),
      fps: Number(($("#fpsRange") && $("#fpsRange").value) || 144),
      legacyFps: !!($("#legacyToggle") && $("#legacyToggle").checked),
      allVersions: !!($("#allVersionsToggle") && $("#allVersionsToggle").checked),
      vfx: !!($("#vfxToggle") && $("#vfxToggle").checked)
    };
  }

  function showPreview(text) {
    if (!previewEl) return;
    previewEl.textContent = text;
    previewEl.hidden = false;
  }

  function toast(message) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.setTimeout(function () { el.classList.remove("show"); }, 3000);
  }

  function wireApplyRestore() {
    var applyBtn = $("#applySettings");
    var restoreBtn = $("#restoreSettings");
    if (applyBtn) {
      applyBtn.addEventListener("click", function () {
        invoke("apply_settings", { profile: currentProfile() })
          .then(function (result) {
            toast(result && result.message ? result.message : "Safe settings applied with backups.");
            showPreview(typeof result === "string" ? result : JSON.stringify(result, null, 2));
          })
          .catch(function (error) { toast("Apply failed: " + (error && error.message ? error.message : error)); });
      });
    }
    if (restoreBtn) {
      restoreBtn.addEventListener("click", function () {
        invoke("restore_settings")
          .then(function (result) {
            toast(result && result.message ? result.message : "Managed settings restored.");
            showPreview(typeof result === "string" ? result : JSON.stringify(result, null, 2));
          })
          .catch(function (error) { toast("Restore failed: " + (error && error.message ? error.message : error)); });
      });
    }
  }

  var SITE_BASE = "https://gefrus112.github.io/robloxclinetbooster/web/";

  function wireExternalLinks() {
    document.addEventListener("click", function (event) {
      var link = event.target && event.target.closest ? event.target.closest("a[href]") : null;
      if (!link) return;
      var href = link.getAttribute("href") || "";
      if (/^https?:\/\//i.test(href)) {
        event.preventDefault();
        invoke("open_external", { url: href }).catch(function () { window.open(href, "_blank"); });
      } else if (/^downloads\//i.test(href)) {
        // In the packaged app, local doc links resolve against the live site.
        event.preventDefault();
        invoke("open_external", { url: SITE_BASE + href.replace(/^\.\//, "") }).catch(function () {});
      }
    }, true);
  }

  function boot() {
    // Load app metadata and scan installation folders before revealing the Client UI.
    setBootProgress("Starting the Roptimer desktop client…", 24);
    var infoPromise = invoke("app_info")
      .then(function (info) { window.RoptimerDesktop.appInfo = info; })
      .catch(function () { /* app metadata is non-fatal */ });
    setBootProgress("Preparing the safe Client workspace…", 48);
    var detectionPromise = runDetection();
    var activeStatusPromise = refreshActiveClient();
    wireApplyRestore();
    wireExternalLinks();
    Promise.all([infoPromise, detectionPromise, activeStatusPromise]).then(finishBoot, finishBoot);
    window.setInterval(refreshActiveClient, 10000);
    // Never leave the startup overlay blocking the app if a backend IPC call stalls.
    window.setTimeout(finishBoot, 8000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
