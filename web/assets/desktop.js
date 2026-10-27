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
 * reads, no telemetry disabling, no game script execution.
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
    appInfo: null
  };

  if (!inTauri) return; // static website: keep the default "download the app" panel

  document.body.classList.add("is-desktop");

  var panel = $("#detectPanel");
  var titleEl = $("#detectTitle");
  var textEl = $("#detectText");
  var metaEl = $("#detectMeta");
  var previewEl = $("#settingsPreview");

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
    setPanel("checking", "Detecting your Roblox installation…", "Scanning standard Windows Roblox version folders. Read-only.", []);
    invoke("detect_roblox")
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
        } else {
          setPanel("missing", "Roblox was not detected", result.message ||
            "Install the Roblox desktop client from roblox.com, then re-scan.", chips);
        }
      })
      .catch(function (error) {
        setPanel("missing", "Detection unavailable", String(error && error.message ? error.message : error), []);
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
    // App info (also warms up IPC), then the headline first-run detection.
    invoke("app_info")
      .then(function (info) { window.RoptimerDesktop.appInfo = info; })
      .catch(function () { /* non-fatal */ });
    runDetection();
    wireApplyRestore();
    wireExternalLinks();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
