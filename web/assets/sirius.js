/* Roptimer Hub V3.1 — safe static website interactions. No eval, no remote code. */
(function () {
  "use strict";

  var $ = function (selector, root) { return (root || document).querySelector(selector); };
  var $$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(message) {
    var el = $("#toast");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    window.setTimeout(function () { el.classList.remove("show"); }, 2600);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast("Copied to clipboard."); }, fallbackCopy);
      return;
    }
    fallbackCopy();

    function fallbackCopy() {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "readonly");
        area.style.position = "absolute";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        if (document.execCommand) document.execCommand("copy");
        document.body.removeChild(area);
        toast("Copied to clipboard.");
      } catch (error) {
        toast("Copy failed. Select the text and copy manually.");
      }
    }
  }

  function downloadText(filename, text, mime) {
    try {
      var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Downloaded " + filename + ".");
    } catch (error) {
      toast("Download is not available in this browser view.");
    }
  }

  /* --------------------------------------------------------------------- */
  /* Tabs and navigation                                                    */
  /* --------------------------------------------------------------------- */

  function activateTab(name, options) {
    var opts = options || {};
    if (["download", "docs", "scripts"].indexOf(name) === -1) name = "download";
    $$(".tab-button").forEach(function (button) {
      var active = button.getAttribute("data-tab") === name;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    $$(".tab-panel").forEach(function (panel) {
      panel.classList.toggle("active", panel.id === "panel-" + name);
    });
    $$(".menu-link[data-route]").forEach(function (link) {
      link.classList.toggle("active", link.getAttribute("data-route") === name);
    });
    if (opts.updateHash !== false && window.history && window.history.replaceState) {
      try {
        window.history.replaceState(null, "", "#" + name);
      } catch (error) {
        /* file:// previews and restricted iframes can reject history updates. */
      }
    }
    var menu = $("#primaryMenu");
    if (menu) menu.classList.remove("open");
    return name;
  }

  $$(".tab-button").forEach(function (button) {
    button.addEventListener("click", function () { activateTab(button.getAttribute("data-tab")); });
  });

  $$(".menu-link[data-route]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      var route = link.getAttribute("data-route");
      activateTab(route);
      var anchor = link.getAttribute("data-anchor");
      if (anchor) window.setTimeout(function () { scrollToAnchor(anchor); }, 60);
    });
  });

  $(".get-button") && $(".get-button").addEventListener("click", function (event) {
    event.preventDefault();
    activateTab("download");
    window.setTimeout(function () { scrollToAnchor("tab-shell"); }, 60);
  });

  $("#menuToggle") && $("#menuToggle").addEventListener("click", function () {
    var menu = $("#primaryMenu");
    if (menu) menu.classList.toggle("open");
  });

  function scrollToAnchor(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  $$(".docs-nav a[data-doc-anchor]").forEach(function (link) {
    link.addEventListener("click", function (event) {
      event.preventDefault();
      activateTab("docs", { updateHash: false });
      $$(".docs-nav a").forEach(function (item) { item.classList.remove("active"); });
      link.classList.add("active");
      window.setTimeout(function () { scrollToAnchor(link.getAttribute("data-doc-anchor")); }, 50);
    });
  });

  var initialHash = (window.location.hash || "").replace(/^#/, "");
  if (["download", "docs", "scripts"].indexOf(initialHash) !== -1) {
    activateTab(initialHash, { updateHash: false });
  } else if (["how-it-works", "cli-performance", "settings", "feature-status", "safety"].indexOf(initialHash) !== -1) {
    activateTab("docs", { updateHash: false });
    window.setTimeout(function () { scrollToAnchor(initialHash); }, 80);
  } else {
    activateTab("download", { updateHash: false });
  }

  window.addEventListener("hashchange", function () {
    var name = (window.location.hash || "").replace(/^#/, "");
    if (["download", "docs", "scripts"].indexOf(name) !== -1) activateTab(name, { updateHash: false });
  });

  /* --------------------------------------------------------------------- */
  /* Feature catalog                                                        */
  /* --------------------------------------------------------------------- */

  var catalog = { features: [], sources: [] };
  try {
    catalog = JSON.parse(($("#featureCatalog") && $("#featureCatalog").textContent) || "{}");
  } catch (error) {
    catalog = { features: [], sources: [] };
  }

  function featureState(status) {
    var value = String(status || "").toLowerCase();
    if (value.indexOf("reject") !== -1) return "rejected";
    if (value.indexOf("legacy") !== -1) return "legacy";
    return "implemented";
  }

  function renderFeatures() {
    var container = $("#featureCards");
    var count = $("#featureCount");
    var features = Array.isArray(catalog.features) ? catalog.features : [];
    if (count) count.textContent = features.length + " features";
    if (!container) return;
    container.innerHTML = features.map(function (feature) {
      var state = featureState(feature.status);
      return '<article class="feature-card" data-state="' + escapeHtml(state) + '">' +
        '<span class="status">' + escapeHtml(feature.status || "Unknown") + "</span>" +
        "<h4>" + escapeHtml(feature.name || feature.id || "Feature") + "</h4>" +
        "<p>" + escapeHtml(feature.details || "") + "</p>" +
        "</article>";
    }).join("");
  }

  function renderSources() {
    var container = $("#sourceList");
    if (!container) return;
    var sources = Array.isArray(catalog.sources) ? catalog.sources : [];
    container.innerHTML = sources.map(function (source) {
      return '<a href="' + escapeHtml(source.url || "#") + '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(source.title || source.url || "Source") + "</a>";
    }).join("");
  }

  renderFeatures();
  renderSources();

  /* --------------------------------------------------------------------- */
  /* Settings / command builder                                             */
  /* --------------------------------------------------------------------- */

  var modeSelect = $("#modeSelect");
  var fpsRange = $("#fpsRange");
  var tierRange = $("#tierRange");
  var textureRange = $("#textureRange");
  var cacheRange = $("#cacheRange");
  var legacyToggle = $("#legacyToggle");
  var allVersionsToggle = $("#allVersionsToggle");
  var launchToggle = $("#launchToggle");

  function currentSettings() {
    return {
      mode: modeSelect ? modeSelect.value : "Reduce building lag",
      fps: fpsRange ? fpsRange.value : "144",
      tier: tierRange ? tierRange.value : "21",
      texture: textureRange ? textureRange.value : "0",
      cacheDays: cacheRange ? cacheRange.value : "7",
      legacyFps: legacyToggle ? legacyToggle.checked : true,
      allVersions: allVersionsToggle ? allVersionsToggle.checked : true,
      launch: launchToggle ? launchToggle.checked : false
    };
  }

  function quote(value) { return '"' + String(value).replace(/"/g, '\\"') + '"'; }

  function windowsCommand(s) {
    var parts = ["RoptimerBoost.exe apply", "--mode " + quote(s.mode)];
    if (s.legacyFps) parts.push("--fps " + s.fps);
    parts.push("--tier " + s.tier, "--texture " + s.texture);
    if (s.allVersions) parts.push("--all-versions");
    if (!s.launch) parts.push("--no-launch");
    return parts.join(" ");
  }

  function macCommand(s) {
    var parts = ["./Roptimer\\ Boost.command --apply", "--mode " + quote(s.mode)];
    if (s.legacyFps) parts.push("--fps " + s.fps);
    parts.push("--graphics-tier " + s.tier, "--texture-tier " + s.texture);
    if (s.allVersions) parts.push("--all-versions");
    if (!s.launch) parts.push("--no-launch");
    return parts.join(" ");
  }

  function updateCommands() {
    var s = currentSettings();
    if ($("#modeValue")) $("#modeValue").textContent = s.mode;
    if ($("#fpsValue")) $("#fpsValue").textContent = s.fps;
    if ($("#tierValue")) $("#tierValue").textContent = s.tier;
    if ($("#textureValue")) $("#textureValue").textContent = s.texture;
    if ($("#cacheValue")) $("#cacheValue").textContent = s.cacheDays + " days";
    if ($("#generatedCommandWindows")) $("#generatedCommandWindows").textContent = windowsCommand(s);
    if ($("#generatedCommandMac")) $("#generatedCommandMac").textContent = macCommand(s);
  }

  [modeSelect, fpsRange, tierRange, textureRange, cacheRange, legacyToggle, allVersionsToggle, launchToggle].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", updateCommands);
    el.addEventListener("change", updateCommands);
  });
  updateCommands();

  $("#downloadSettings") && $("#downloadSettings").addEventListener("click", function () {
    var s = currentSettings();
    var payload = {
      product: "Roptimer Hub V3.1",
      mode: s.mode,
      fpsTarget: Number(s.fps),
      legacyFpsFlag: s.legacyFps,
      graphicsTier: Number(s.tier),
      textureTier: Number(s.texture),
      cacheCleanupDays: Number(s.cacheDays),
      targetScope: s.allVersions ? "All detected versions + shared profile" : "Active version + shared profile",
      launchAfterApply: s.launch,
      safety: { injection: false, memoryReads: false, gameScriptExecution: false, telemetryDisable: false }
    };
    downloadText("roptimer-settings.json", JSON.stringify(payload, null, 2) + "\n", "application/json");
  });

  $("#resetSettings") && $("#resetSettings").addEventListener("click", function () {
    if (modeSelect) modeSelect.value = "Reduce building lag";
    if (fpsRange) fpsRange.value = "144";
    if (tierRange) tierRange.value = "21";
    if (textureRange) textureRange.value = "0";
    if (cacheRange) cacheRange.value = "7";
    if (legacyToggle) legacyToggle.checked = true;
    if (allVersionsToggle) allVersionsToggle.checked = true;
    if (launchToggle) launchToggle.checked = false;
    updateCommands();
    toast("Settings reset to the safe default.");
  });

  $$("[data-copy-target]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.getAttribute("data-copy-target"));
      if (target) copyText(target.textContent || "");
    });
  });

  /* --------------------------------------------------------------------- */
  /* Safe Script Hub / local GUI loading preview                             */
  /* --------------------------------------------------------------------- */

  var scripts = {
    loading: {
      title: "Sirius Loading GUI",
      subtitle: "Loader + steps",
      code: [
        "-- Roptimer UI Studio — local website preview only.",
        "-- This is not sent to Roblox and is not an executor script.",
        "local ui = Roptimer.UI.new({",
        "  title = 'Roptimer',",
        "  theme = 'Sirius Dark'",
        "})",
        "",
        "ui:Loader({",
        "  steps = {",
        "    'Scan local settings',",
        "    'Back up ClientAppSettings.json',",
        "    'Preview managed flags',",
        "    'Apply safe profile'",
        "  }",
        "})",
        "",
        "ui:Toast('Local preview ready.')",
        "ui:Show()"
      ].join("\n"),
      preview: {
        title: "Preparing safe profile",
        subtitle: "Loading GUI preview · browser animation only",
        toast: "Local preview ready. No Roblox process was touched.",
        kind: "loading"
      }
    },
    preset: {
      title: "Performance Preset",
      subtitle: "Mode card",
      code: [
        "-- Luau-inspired recipe for a local Roptimer UI card.",
        "local card = Roptimer.UI.Preset({",
        "  name = 'Reduce building lag',",
        "  graphicsTier = 21,",
        "  textureTier = 0,",
        "  accent = '#9c8cff'",
        "})",
        "",
        "card:AddAction('Preview JSON', function()",
        "  Roptimer.Boost.preview()",
        "end)",
        "",
        "card:Show()"
      ].join("\n"),
      preview: {
        title: "Reduce building lag",
        subtitle: "Preset card · graphics 21 / texture 0",
        toast: "Preset preview selected. Use Boost CLI to apply local JSON.",
        kind: "preset"
      }
    },
    toast: {
      title: "Session Ready Toast",
      subtitle: "Notification",
      code: [
        "-- Local readiness notification only.",
        "local session = Roptimer.Session.snapshot()",
        "",
        "if session.running then",
        "  Roptimer.UI.Toast({",
        "    title = 'Roptimer connected',",
        "    body = 'Local settings ready for ' .. session.name,",
        "    theme = 'Sirius Dark'",
        "  })",
        "end"
      ].join("\n"),
      preview: {
        title: "Roptimer connected",
        subtitle: "Session readiness notification preview",
        toast: "Roptimer connected — local settings only, no client injection.",
        kind: "toast"
      }
    },
    backup: {
      title: "Backup Status Panel",
      subtitle: "Local log",
      code: [
        "-- Static UI recipe for the backup/restore status panel.",
        "local panel = Roptimer.UI.Window({",
        "  title = 'Backup status',",
        "  width = 420,",
        "  height = 260",
        "})",
        "",
        "panel:Log('Found existing ClientAppSettings.json')",
        "panel:Log('Created timestamped backup')",
        "panel:Log('Merged 14 managed flags')",
        "panel:Log('Restore is available')",
        "panel:Show()"
      ].join("\n"),
      preview: {
        title: "Backup status",
        subtitle: "Local log preview · no real files changed",
        toast: "Backup preview complete. This demo only renders text.",
        kind: "backup"
      }
    }
  };

  var currentScript = "loading";

  function highlightLine(line) {
    var commentAt = line.indexOf("--");
    var code = commentAt >= 0 ? line.slice(0, commentAt) : line;
    var comment = commentAt >= 0 ? line.slice(commentAt) : "";
    var parts = code.split(/('[^']*'|"[^"]*")/g);
    var html = parts.map(function (part) {
      if (/^['"].*['"]$/.test(part)) return '<span class="str">' + escapeHtml(part) + "</span>";
      return escapeHtml(part)
        .replace(/\b(local|function|end|return|if|then|else|for|in|do|true|false|nil)\b/g, '<span class="kw">$1</span>')
        .replace(/\b(Roptimer|UI|Loader|Toast|Preset|Window|Session|Boost|Show|Log|AddAction|preview|new)\b/g, '<span class="fn">$1</span>');
    }).join("");
    return html + (comment ? '<span class="comment">' + escapeHtml(comment) + "</span>" : "");
  }

  function highlight(code) {
    return code.split("\n").map(highlightLine).join("\n");
  }

  function updatePreview(script) {
    var mock = $("#mockWindow");
    var title = $("#mockTitle");
    var subtitle = $("#mockSubtitle");
    var toastEl = $("#mockToast");
    var stepEls = $$(".mock-steps span");
    if (title) title.textContent = script.preview.title;
    if (subtitle) subtitle.textContent = script.preview.subtitle;
    if (toastEl) {
      toastEl.textContent = script.preview.toast;
      toastEl.classList.remove("show");
    }
    var labels = {
      loading: ["Scan settings", "Back up JSON", "Preview flags", "Apply profile"],
      preset: ["Choose mode", "Set tier 21", "Set texture 0", "Preview JSON"],
      toast: ["Check process", "Read OS metadata", "Type local name", "Show toast"],
      backup: ["Find profile", "Create backup", "Merge flags", "Keep restore"]
    };
    var values = labels[script.preview.kind] || labels.loading;
    stepEls.forEach(function (el, index) { el.textContent = values[index] || ("Step " + (index + 1)); });
    if (mock) {
      mock.classList.remove("is-loading");
      void mock.offsetWidth;
      mock.classList.add("is-loading");
    }
    if (toastEl) window.setTimeout(function () { toastEl.classList.add("show"); }, 900);
  }

  function selectScript(key) {
    var script = scripts[key];
    if (!script) return;
    currentScript = key;
    $$(".script-card").forEach(function (button) {
      button.classList.toggle("active", button.getAttribute("data-script") === key);
    });
    var filename = $("#scriptFilename");
    var body = $("#scriptCode");
    if (filename) filename.textContent = key + ".luau";
    if (body) body.innerHTML = highlight(script.code);
    updatePreview(script);
  }

  $$(".script-card").forEach(function (button) {
    button.addEventListener("click", function () { selectScript(button.getAttribute("data-script")); });
  });

  $("#runPreview") && $("#runPreview").addEventListener("click", function () {
    updatePreview(scripts[currentScript]);
    toast("Local preview restarted.");
  });

  $("#copyScript") && $("#copyScript").addEventListener("click", function () {
    copyText(scripts[currentScript].code);
  });

  selectScript("loading");

  /* --------------------------------------------------------------------- */
  /* Screenshot lightbox                                                     */
  /* --------------------------------------------------------------------- */

  var lightbox = $("#lightbox");
  var lightboxImage = $("#lightboxImage");
  var lightboxCaption = $("#lightboxCaption");

  function openLightbox(button) {
    if (!lightbox || !lightboxImage) return;
    lightboxImage.src = button.getAttribute("data-src") || "";
    lightboxImage.alt = button.getAttribute("data-alt") || "Roptimer screenshot";
    if (lightboxCaption) lightboxCaption.textContent = button.getAttribute("data-caption") || "";
    lightbox.hidden = false;
  }

  function closeLightbox() {
    if (lightbox) lightbox.hidden = true;
  }

  $$("[data-lightbox]").forEach(function (button) {
    button.addEventListener("click", function () { openLightbox(button); });
  });
  $("#lightboxClose") && $("#lightboxClose").addEventListener("click", closeLightbox);
  lightbox && lightbox.addEventListener("click", function (event) {
    if (event.target === lightbox) closeLightbox();
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeLightbox();
  });

  /* --------------------------------------------------------------------- */
  /* Scroll progress                                                        */
  /* --------------------------------------------------------------------- */

  function updateScrollProgress() {
    var bar = $("#scrollProgress");
    if (!bar) return;
    var max = document.documentElement.scrollHeight - window.innerHeight;
    var percent = max > 0 ? (window.scrollY / max) * 100 : 0;
    bar.style.width = Math.min(100, Math.max(0, percent)) + "%";
  }
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);
  updateScrollProgress();

  /* Expose a tiny read-only test hook for static checks. No privileged APIs. */
  window.RoptimerSite = {
    version: "3.1.0",
    tabCount: $$(".tab-button").length,
    screenshotCount: $$("[data-lightbox]").length,
    featureCount: (catalog.features || []).length,
    sourceCount: (catalog.sources || []).length,
    activeTab: function () {
      var active = $(".tab-button.active");
      return active ? active.getAttribute("data-tab") : "download";
    }
  };
})();
