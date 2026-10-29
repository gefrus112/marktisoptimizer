/* Marktis Optimizer — lightweight website interactions.
   Safe static site logic only: no eval, no remote code, no Roblox process access. */
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

  function initCookieConsent() {
    var panel = $("#cookieConsent");
    if (!panel) return;
    var choiceKey = "marktis.cookieConsent.v1";
    var savedChoice = "";
    try { savedChoice = window.localStorage.getItem(choiceKey) || ""; } catch (_error) { /* Storage may be disabled. */ }
    panel.hidden = savedChoice === "accepted" || savedChoice === "rejected";

    function saveChoice(choice) {
      try { window.localStorage.setItem(choiceKey, choice); } catch (_error) { /* Keep the choice for this page view. */ }
      panel.hidden = true;
      toast("Cookie preference saved locally. No advertising tag is active.");
    }

    var accept = $("#acceptCookies");
    var reject = $("#rejectCookies");
    var settings = $("#openCookieSettings");
    if (accept) accept.addEventListener("click", function () { saveChoice("accepted"); });
    if (reject) reject.addEventListener("click", function () { saveChoice("rejected"); });
    if (settings) settings.addEventListener("click", function () {
      panel.hidden = false;
      if (accept) accept.focus();
    });
  }

  function detectDevicePlatform() {
    var nav = window.navigator || {};
    var userAgent = String(nav.userAgent || "");
    var platform = String((nav.userAgentData && nav.userAgentData.platform) || nav.platform || "");
    var combined = platform + " " + userAgent;
    if (/android/i.test(combined)) return "android";
    if (/iphone|ipad|ipod/i.test(combined) || (/macintosh|macintel/i.test(combined) && Number(nav.maxTouchPoints) > 1)) return "ios";
    if (/windows|win32|win64|winnt/i.test(combined)) return "windows";
    if (/cros|chrome\s*os/i.test(combined)) return "chromeos";
    if (/macintosh|mac\s*os\s*x|macintel|macppc|mac68k|macos/i.test(combined)) return "macos";
    if (/linux|x11/i.test(combined)) return "linux";
    return "unknown";
  }

  function initPlatformCompatibilityNotice() {
    var notice = $("#platformCompatibilityNotice");
    var message = $("#platformCompatibilityMessage");
    if (!notice || !message) return;
    var platform = detectDevicePlatform();
    if (platform === "windows" || platform === "macos") {
      notice.hidden = true;
      return;
    }
    var platformNames = {
      macos: "macOS",
      linux: "Linux",
      android: "Android",
      ios: "iOS",
      chromeos: "ChromeOS",
      unknown: "an unrecognized platform"
    };
    var platformName = platformNames[platform] || platformNames.unknown;
    var supportNote;
    if (platform === "linux") {
      supportNote = "The Windows launcher requires Windows 10/11 x64. A separate legacy macOS companion is available on the Downloads tab; Linux launcher support is planned.";
    } else {
      supportNote = "The desktop launcher requires Windows 10/11 x64. A separate legacy macOS companion is listed on the Downloads tab; unified macOS/Linux launcher support is planned.";
    }
    notice.dataset.platform = platform;
    message.textContent = "Detected " + platformName + ". " + supportNote;
    notice.hidden = false;
  }

  initPlatformCompatibilityNotice();
  initCookieConsent();

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

  function downloadHref(href, filename) {
    var link = document.createElement("a");
    link.href = href;
    if (filename) link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast("Download requested.");
  }

  function openExternal(url) {
    try {
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast("Pop-up blocked. Use the links on the page instead.");
    }
  }

  /* ------------------------------------------------------------------ */
  /* Tabs / navigation                                                    */
  /* ------------------------------------------------------------------ */

  var TAB_NAMES = ["client", "how", "allowlist", "downloads", "docs"];

  function activateTab(name, options) {
    var opts = options || {};
    if (TAB_NAMES.indexOf(name) === -1) name = "client";
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
        /* file:// or restricted iframes can reject history updates. */
      }
    }
    var menu = $("#primaryMenu");
    if (menu) menu.classList.remove("open");
    return name;
  }

  function scrollToAnchor(id) {
    var el = document.getElementById(id);
    if (!el) return;
    if (el.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    activateTab("downloads");
    window.setTimeout(function () { scrollToAnchor("tab-shell"); }, 60);
  });
  $("#menuToggle") && $("#menuToggle").addEventListener("click", function () {
    var menu = $("#primaryMenu");
    if (menu) menu.classList.toggle("open");
  });

  $$("[data-jump]").forEach(function (button) {
    button.addEventListener("click", function (event) {
      event.preventDefault();
      var tab = button.getAttribute("data-tab") || button.getAttribute("data-route") || "client";
      activateTab(tab);
      var anchor = button.getAttribute("data-jump");
      if (anchor) window.setTimeout(function () { scrollToAnchor(anchor); }, 50);
    });
  });

  var initialHash = (window.location.hash || "").replace(/^#/, "");
  if (TAB_NAMES.indexOf(initialHash) !== -1) {
    activateTab(initialHash, { updateHash: false });
  } else if (["how-it-works", "cli-performance", "feature-status", "safety"].indexOf(initialHash) !== -1) {
    activateTab("docs", { updateHash: false });
    window.setTimeout(function () { scrollToAnchor(initialHash); }, 80);
  } else {
    activateTab("client", { updateHash: false });
  }

  window.addEventListener("hashchange", function () {
    var name = (window.location.hash || "").replace(/^#/, "");
    if (TAB_NAMES.indexOf(name) !== -1) activateTab(name, { updateHash: false });
  });

  /* ------------------------------------------------------------------ */
  /* Embedded catalogs                                                    */
  /* ------------------------------------------------------------------ */

  var catalog = { features: [], sources: [] };
  try {
    catalog = JSON.parse(($("#featureCatalog") && $("#featureCatalog").textContent) || "{}");
  } catch (error) {
    catalog = { features: [], sources: [] };
  }
  var allowlist = { categories: [], legacyNotInAllowlist: [] };
  try {
    allowlist = JSON.parse(($("#fastflagAllowlist") && $("#fastflagAllowlist").textContent) || "{}");
  } catch (error) {
    allowlist = { categories: [], legacyNotInAllowlist: [] };
  }
  var allowlistFlags = [];
  (allowlist.categories || []).forEach(function (group) {
    (group.flags || []).forEach(function (flag) { allowlistFlags.push(flag); });
  });

  function featureState(status) {
    var value = String(status || "").toLowerCase();
    if (value.indexOf("reject") !== -1 || value.indexOf("removed") !== -1) return "rejected";
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
      return '<article class="feature-card" data-state="' + escapeHtml(featureState(feature.status)) + '">' +
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

  var catDesc = allowlist.categoryDescriptions || {};
  var flagFeatures = allowlist.flagFeatures || {};

  function allowlistCardsMarkup() {
    var groups = Array.isArray(allowlist.categories) ? allowlist.categories : [];
    return groups.map(function (group) {
      var name = group.name || "Category";
      var flags = Array.isArray(group.flags) ? group.flags : [];
      var desc = catDesc[name] || {};
      var head = '<div class="allowlist-head">' +
        '<span class="allowlist-count">' + flags.length + (flags.length === 1 ? ' flag' : ' flags') + '</span>' +
        '<h4>' + escapeHtml(name) + '<span class="al-badge">' + escapeHtml(desc.accent || "group") + '</span></h4>' +
        (desc.summary ? '<p class="allowlist-summary">' + escapeHtml(desc.summary) + '</p>' : '') +
        '</div>';
      var improves = desc.improves ? '<div class="allowlist-improves"><span class="imp-label">Improves</span>' +
        escapeHtml(desc.improves) + '</div>' : '';
      var list = '<div class="allowlist-flags">' + flags.map(function (flag) {
        var info = flagFeatures[flag] || {};
        return '<div class="allowlist-flag">' +
          '<code>' + escapeHtml(flag) + '</code>' +
          '<div class="al-feature">' +
            (info.feature ? '<span class="al-f-name">' + escapeHtml(info.feature) + '</span>' : '') +
            (info.valueHint ? '<span class="al-f-hint">' + escapeHtml(info.valueHint) + '</span>' : '') +
          '</div>' +
          (info.improves ? '<p class="al-improves">' + escapeHtml(info.improves) + '</p>' : '') +
          '</div>';
      }).join("") + '</div>';
      return '<article class="allowlist-card" data-category="' + escapeHtml(name) + '">' + head + improves + list + '</article>';
    }).join("");
  }

  function renderAllowlist() {
    var summary = $("#allowlistSummary");
    if (summary) summary.textContent = allowlistFlags.length + " flags · Windows client only";
    // Render into both the Client-tab preview and the full Allowlist tab.
    var markup = allowlistCardsMarkup();
    $$("#allowlistCards, #clientAllowlistCards").forEach(function (container) {
      container.innerHTML = markup;
    });
  }

  renderFeatures();
  renderSources();
  renderAllowlist();

  /* ------------------------------------------------------------------ */
  /* Client settings / command builder                                    */
  /* ------------------------------------------------------------------ */

  var modeSelect = $("#modeSelect");
  var fpsRange = $("#fpsRange");
  var tierRange = $("#tierRange");
  var textureRange = $("#textureRange");
  var legacyToggle = $("#legacyToggle");
  var allVersionsToggle = $("#allVersionsToggle");
  var vfxToggle = $("#vfxToggle");

  function currentSettings() {
    return {
      mode: modeSelect ? modeSelect.value : "Reduce building lag",
      fps: fpsRange ? fpsRange.value : "144",
      tier: tierRange ? tierRange.value : "21",
      texture: textureRange ? textureRange.value : "0",
      legacyFps: legacyToggle ? legacyToggle.checked : true,
      allVersions: allVersionsToggle ? allVersionsToggle.checked : true,
      vfx: vfxToggle ? vfxToggle.checked : true
    };
  }

  function quote(value) {
    var q = String.fromCharCode(34);
    return q + String(value).split(q).join("\\" + q) + q;
  }

  function windowsCommand(s) {
    var parts = ["RoptimerBoost.exe apply", "--mode " + quote(s.mode)];
    if (s.legacyFps) parts.push("--fps " + s.fps);
    parts.push("--tier " + s.tier, "--texture " + s.texture);
    if (s.vfx) parts.push("--vfx");
    if (s.allVersions) parts.push("--all-versions");
    parts.push("--no-launch");
    return parts.join(" ");
  }

  function updateCommands() {
    var s = currentSettings();
    if ($("#modeValue")) $("#modeValue").textContent = s.mode;
    if ($("#fpsValue")) $("#fpsValue").textContent = s.fps;
    if ($("#tierValue")) $("#tierValue").textContent = s.tier;
    if ($("#textureValue")) $("#textureValue").textContent = s.texture;
    if ($("#generatedCommand")) $("#generatedCommand").textContent = windowsCommand(s);
    if ($("#generatedCommandShort")) $("#generatedCommandShort").textContent = windowsCommand(s);
  }

  [modeSelect, fpsRange, tierRange, textureRange, legacyToggle, allVersionsToggle, vfxToggle].forEach(function (el) {
    if (!el) return;
    el.addEventListener("input", updateCommands);
    el.addEventListener("change", updateCommands);
  });
  updateCommands();

  $("#resetSettings") && $("#resetSettings").addEventListener("click", function () {
    if (modeSelect) modeSelect.value = "Reduce building lag";
    if (fpsRange) fpsRange.value = "144";
    if (tierRange) tierRange.value = "21";
    if (textureRange) textureRange.value = "0";
    if (legacyToggle) legacyToggle.checked = true;
    if (allVersionsToggle) allVersionsToggle.checked = true;
    if (vfxToggle) vfxToggle.checked = true;
    updateCommands();
    toast("Client settings reset to the safe default.");
  });

  $("#downloadSettings") && $("#downloadSettings").addEventListener("click", function () {
    var s = currentSettings();
    var payload = {
      product: "Marktis Optimizer Windows Client",
      platform: "windows",
      mode: s.mode,
      fpsTarget: Number(s.fps),
      legacyFpsFlag: s.legacyFps,
      graphicsTier: Number(s.tier),
      textureTier: Number(s.texture),
      vfxReducer: s.vfx,
      targetScope: s.allVersions ? "All detected versions + shared profile" : "Active version + shared profile",
      launchAfterApply: false,
      allowlist: allowlistFlags,
      safety: { injection: false, memoryReads: false, gameScriptExecution: false, telemetryDisable: false }
    };
    downloadText("roptimer-client-settings.json", JSON.stringify(payload, null, 2) + "\n", "application/json");
  });

  $$("[data-copy-target]").forEach(function (button) {
    button.addEventListener("click", function () {
      var target = document.getElementById(button.getAttribute("data-copy-target"));
      if (target) copyText(target.textContent || "");
    });
  });

  $("#copyAllowlist") && $("#copyAllowlist").addEventListener("click", function () {
    copyText(JSON.stringify(allowlist, null, 2));
  });
  $("#downloadAllowlist") && $("#downloadAllowlist").addEventListener("click", function () {
    // Build from the embedded canonical JSON so it works offline and in both layouts.
    downloadText("fastflags-allowlist.json", JSON.stringify(allowlist, null, 2) + "\n", "application/json");
  });

  /* ------------------------------------------------------------------ */
  /* Screenshot lightbox                                                  */
  /* ------------------------------------------------------------------ */

  var lightbox = $("#lightbox");
  var lightboxImage = $("#lightboxImage");
  var lightboxCaption = $("#lightboxCaption");
  function openLightbox(button) {
    if (!lightbox || !lightboxImage) return;
    lightboxImage.src = button.getAttribute("data-src") || "";
    lightboxImage.alt = button.getAttribute("data-alt") || "Marktis Optimizer screenshot";
    if (lightboxCaption) lightboxCaption.textContent = button.getAttribute("data-caption") || "";
    lightbox.hidden = false;
  }
  function closeLightbox() { if (lightbox) lightbox.hidden = true; }
  $$("[data-lightbox]").forEach(function (button) {
    button.addEventListener("click", function () { openLightbox(button); });
  });
  $("#lightboxClose") && $("#lightboxClose").addEventListener("click", closeLightbox);
  lightbox && lightbox.addEventListener("click", function (event) { if (event.target === lightbox) closeLightbox(); });

  /* ------------------------------------------------------------------ */
  /* Command palette                                                      */
  /* ------------------------------------------------------------------ */

  var URLS = {
    repo: "https://github.com/gefrus112/marktisoptimizer",
    latest: "https://github.com/gefrus112/marktisoptimizer/releases/latest",
    windows: "https://github.com/gefrus112/marktisoptimizer/releases/tag/v4.0.0-windows-rust",
    mac: "https://github.com/gefrus112/marktisoptimizer/releases/tag/v3.1.0-mac",
    pages: "https://gefrus112.github.io/marktisoptimizer/",
    allowlist: "https://devforum.roblox.com/t/allowlist-for-local-client-configuration-via-fast-flags/3966569"
  };

  var commands = [
    { title: "Go to Client", hint: "Main Windows client tab with safe settings", icon: "01", keywords: "client windows main tab settings", run: function () { activateTab("client"); scrollToAnchor("tab-shell"); } },
    { title: "Go to Allowlist", hint: "18 Geometry, Rendering, and UI FastFlags", icon: "02", keywords: "allowlist fastflags geometry rendering user interface", run: function () { activateTab("allowlist"); scrollToAnchor("tab-shell"); } },
    { title: "Go to Downloads", hint: "Windows EXE, Boost CLI, source ZIP, and checksums", icon: "03", keywords: "download windows exe zip github release", run: function () { activateTab("downloads"); scrollToAnchor("tab-shell"); } },
    { title: "Go to Docs", hint: "CLI reference, feature status, and safety", icon: "05", keywords: "docs cli safety features", run: function () { activateTab("docs"); scrollToAnchor("tab-shell"); } },
    { title: "Copy Windows Boost command", hint: "Copy the generated RoptimerBoost.exe apply command", icon: ">_", keywords: "copy windows cli command boost apply fps tier", run: function () { copyText(windowsCommand(currentSettings())); } },
    { title: "Copy FastFlag allowlist", hint: "Copy the canonical Windows client allowlist JSON", icon: "{ }", keywords: "copy allowlist json flags", run: function () { copyText(JSON.stringify(allowlist, null, 2)); } },
    { title: "Download client settings", hint: "Save the current safe profile as JSON", icon: "↓", keywords: "download settings json profile", run: function () { var b = $("#downloadSettings"); if (b) b.click(); } },
    { title: "Open Windows release", hint: "Rust + Tauri desktop installer · v4.0.0", icon: "↗", keywords: "github release windows exe download", run: function () { openExternal(URLS.windows); } },
    { title: "Check latest desktop release", hint: "Open the newest published GitHub release; install updates yourself", icon: "↗", keywords: "update latest release new version desktop launcher", run: function () { openExternal(URLS.latest); } },
    { title: "Open macOS companion release", hint: "Legacy Mac companion only · not the allowlist client", icon: "↗", keywords: "github release mac macos companion download", run: function () { openExternal(URLS.mac); } },
    { title: "Open official allowlist source", hint: "Roblox DevForum local FastFlag allowlist", icon: "◇", keywords: "official source roblox devforum fastflag allowlist", run: function () { openExternal(URLS.allowlist); } },
    { title: "View feature status", hint: "Jump to implemented, legacy, and rejected features", icon: "✓", keywords: "feature status audit safety rejected", run: function () { activateTab("docs"); scrollToAnchor("feature-status"); } },
    { title: "Toggle focus mode", hint: "Pause decorative animations and dim the static CSS backdrop", icon: "◐", keywords: "focus mode calm reduce motion performance css", run: function () { document.body.classList.toggle("focus-mode"); toast(document.body.classList.contains("focus-mode") ? "Low-motion focus mode on." : "Low-motion focus mode off."); } },
    { title: "Open GitHub repository", hint: "Source, workflows, docs, and issues", icon: "⌥", keywords: "github repo source code repository", run: function () { openExternal(URLS.repo); } }
  ];

  var commandPalette = $("#commandPalette");
  var commandSearch = $("#commandSearch");
  var commandResults = $("#commandResults");
  var commandTrigger = $("#commandTrigger");
  var heroCommandButton = $("#heroCommandButton");
  var visibleCommands = [];
  var activeCommandIndex = 0;

  function renderCommands(query) {
    if (!commandResults) return;
    var needle = String(query || "").trim().toLowerCase();
    visibleCommands = commands.filter(function (command) {
      if (!needle) return true;
      return (command.title + " " + command.hint + " " + command.keywords).toLowerCase().indexOf(needle) !== -1;
    });
    activeCommandIndex = 0;
    if (!visibleCommands.length) {
      commandResults.innerHTML = '<div class="command-empty">No commands matched. Try “allowlist”, “client”, or “download”.</div>';
      return;
    }
    commandResults.innerHTML = visibleCommands.map(function (command, index) {
      return '<button class="command-item' + (index === 0 ? " active" : "") + '" type="button" role="option" data-command-index="' + index + '">' +
        '<span class="ci-icon">' + escapeHtml(command.icon) + "</span>" +
        '<span class="ci-copy"><strong>' + escapeHtml(command.title) + "</strong><small>" + escapeHtml(command.hint) + "</small></span>" +
        '<span class="ci-go">↵</span></button>';
    }).join("");
    updateActiveCommand();
  }

  function updateActiveCommand() {
    if (!commandResults) return;
    $$(".command-item", commandResults).forEach(function (item, index) {
      var selected = index === activeCommandIndex;
      item.classList.toggle("active", selected);
      item.setAttribute("aria-selected", selected ? "true" : "false");
      if (selected && item.scrollIntoView) item.scrollIntoView({ block: "nearest" });
    });
  }

  function runCommand(index) {
    var command = visibleCommands[index];
    if (!command) return;
    closeCommandPalette();
    try { command.run(); } catch (error) { toast("That command could not run in this browser view."); }
  }

  function openCommandPalette() {
    if (!commandPalette) return;
    commandPalette.hidden = false;
    if (commandSearch) commandSearch.value = "";
    renderCommands("");
    window.setTimeout(function () { if (commandSearch) commandSearch.focus(); }, 0);
  }
  function closeCommandPalette() { if (commandPalette) commandPalette.hidden = true; }

  function initCommandPalette() {
    if (!commandPalette || !commandResults || !commandSearch) return;
    commandTrigger && commandTrigger.addEventListener("click", openCommandPalette);
    heroCommandButton && heroCommandButton.addEventListener("click", openCommandPalette);
    commandPalette.addEventListener("click", function (event) { if (event.target === commandPalette) closeCommandPalette(); });
    commandSearch.addEventListener("input", function () { renderCommands(commandSearch.value); });
    commandSearch.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (visibleCommands.length) activeCommandIndex = (activeCommandIndex + 1) % visibleCommands.length;
        updateActiveCommand();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (visibleCommands.length) activeCommandIndex = (activeCommandIndex - 1 + visibleCommands.length) % visibleCommands.length;
        updateActiveCommand();
      } else if (event.key === "Enter") {
        event.preventDefault();
        runCommand(activeCommandIndex);
      }
    });
    commandResults.addEventListener("click", function (event) {
      var item = event.target.closest ? event.target.closest(".command-item") : null;
      if (item) runCommand(Number(item.getAttribute("data-command-index")));
    });
    commandResults.addEventListener("mousemove", function (event) {
      var item = event.target.closest ? event.target.closest(".command-item") : null;
      if (item) { activeCommandIndex = Number(item.getAttribute("data-command-index")); updateActiveCommand(); }
    });
    document.addEventListener("keydown", function (event) {
      var key = event.key || "";
      if ((event.ctrlKey || event.metaKey) && (key === "k" || key === "K")) {
        event.preventDefault();
        if (commandPalette.hidden) openCommandPalette(); else closeCommandPalette();
        return;
      }
      var tag = (event.target && event.target.tagName) || "";
      var isTyping = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (key === "/" && !isTyping && commandPalette.hidden) { event.preventDefault(); openCommandPalette(); return; }
      if (key === "Escape") {
        if (!commandPalette.hidden) { event.preventDefault(); closeCommandPalette(); }
        closeLightbox();
      }
    });
  }

  initCommandPalette();

  /* ------------------------------------------------------------------ */
  /* Visual effects                                                       */
  /* ------------------------------------------------------------------ */

  function prefersReducedMotion() {
    return !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function initReveal() {
    var items = $$(".glass, .panel, .overview-card, .mini-card, .step, .screenshot-card, .stat-band > div, .orbit-card");
    items.forEach(function (el) { el.classList.add("reveal"); });
    function showAll() { items.forEach(function (el) { el.classList.add("revealed"); }); }
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) { showAll(); return; }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { entry.target.classList.add("revealed"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.07, rootMargin: "0px 0px -40px 0px" });
    items.forEach(function (el) { observer.observe(el); });
  }

  function initCounters() {
    var counters = $$("[data-count]");
    function finalValue(el) {
      var suffix = el.getAttribute("data-suffix") || "";
      el.textContent = String(Number(el.getAttribute("data-count")) || 0) + suffix;
    }
    if (prefersReducedMotion() || !("IntersectionObserver" in window)) { counters.forEach(finalValue); return; }
    var raf = window.requestAnimationFrame || function (cb) { return window.setTimeout(function () { cb(Date.now()); }, 16); };
    function animate(el) {
      var target = Number(el.getAttribute("data-count")) || 0;
      var suffix = el.getAttribute("data-suffix") || "";
      var start = Date.now();
      function step(now) {
        var p = Math.min(1, (now - start) / 900);
        var eased = 1 - Math.pow(1 - p, 3);
        el.textContent = String(Math.round(target * eased)) + suffix;
        if (p < 1) raf(step);
      }
      raf(step);
    }
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) { if (entry.isIntersecting) { animate(entry.target); observer.unobserve(entry.target); } });
    }, { threshold: 0.45 });
    counters.forEach(function (el) { observer.observe(el); });
  }

  var scrollProgressFrame = null;
  function updateScrollProgress() {
    if (scrollProgressFrame !== null) return;
    var requestFrame = window.requestAnimationFrame || function (callback) {
      return window.setTimeout(callback, 16);
    };
    scrollProgressFrame = requestFrame(function () {
      scrollProgressFrame = null;
      var bar = $("#scrollProgress");
      if (!bar) return;
      var max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      var progress = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      bar.style.transform = "scaleX(" + progress + ")";
    });
  }

  initReveal();
  initCounters();
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  window.addEventListener("resize", updateScrollProgress);
  updateScrollProgress();

  /* Read-only test hook. No privileged APIs. */
  window.RoptimerSite = {
    version: "3.2.0",
    edition: "Nebula Client",
    tabCount: $$(".tab-button").length,
    screenshotCount: $$("[data-lightbox]").length,
    featureCount: (catalog.features || []).length,
    sourceCount: (catalog.sources || []).length,
    commandCount: commands.length,
    allowlistFlagCount: allowlistFlags.length,
    allowlistCategoryCount: (allowlist.categories || []).length,
    visualRenderer: "css-only",
    platform: (allowlist.platform || "windows").toLowerCase(),
    activeTab: function () {
      var active = $(".tab-button.active");
      return active ? active.getAttribute("data-tab") : "client";
    },
    commandPaletteOpen: function () { return !!commandPalette && !commandPalette.hidden; }
  };
})();
