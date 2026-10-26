namespace Roptimer.Core.Services;

public static class CliRunner
{
    private const string Version = "3.2.0";

    public static int Run(string[] args)
    {
        try { Console.OutputEncoding = Encoding.UTF8; } catch { /* Redirected output may not expose a console encoding. */ }
        if (args.Length == 0)
        {
            PrintHelp();
            return 0;
        }
        var command = args[0].Trim().ToLowerInvariant();
        var rest = args.Skip(1).ToArray();
        var options = ParseOptions(rest);

        var locator = new RobloxLocator();
        var store = new SettingsStore(locator);
        var launcher = new LaunchService();
        var fastFlags = new FastFlagService(locator, launcher);
        var cache = new CacheCleaner(locator);
        var sessions = new SessionDetector(locator);
        var catalog = FeatureCatalog.Load();

        try
        {
            switch (command)
            {
                case "help":
                case "-h":
                case "--help":
                    PrintHelp();
                    return 0;
                case "version":
                case "--version":
                    Console.WriteLine($"RoptimerBoost {Version}");
                    return 0;
                case "open":
                    return Open(launcher);
                case "preview":
                    return Preview(store, fastFlags, options);
                case "apply":
                case "boost":
                    return Apply(store, fastFlags, options);
                case "bootstrap":
                    return Bootstrap(store, fastFlags, launcher, options);
                case "restore":
                    return Restore(fastFlags);
                case "session":
                    return Session(store, sessions, options);
                case "modes":
                    Console.WriteLine(Json.Serialize(OptimizationEngine.Modes));
                    return 0;
                case "tiers":
                    Console.WriteLine(Json.Serialize(BuildTiers()));
                    return 0;
                case "features":
                    Console.WriteLine(catalog.AsJson());
                    return 0;
                case "allowlist":
                    Console.WriteLine(FastFlagService.Allowlist.AsJson());
                    return 0;
                case "settings":
                    Console.WriteLine(Json.Serialize(store.Load()));
                    return 0;
                case "cache-report":
                    Console.WriteLine(Json.Serialize(cache.Report(GetInt(options, "days", 7))));
                    return 0;
                case "cache-clean":
                    return CleanCache(cache, options);
                case "self-test":
                case "--self-test":
                    Console.WriteLine(SelfTest.Run());
                    return 0;
                case "build-info":
                    Console.WriteLine(Json.Serialize(new
                    {
                        product = "Roptimer Hub V3.2",
                        version = Version,
                        framework = ".NET 8",
                        ui = "WPF",
                        platform = "Windows 10+ x64",
                        cli = "RoptimerBoost.exe",
                        allowlist = new { categories = FastFlagService.Allowlist.CategoryCount, flags = FastFlagService.Allowlist.FlagCount },
                        safety = new { injection = false, memoryReads = false, telemetryDisable = false, antiCheatBypass = false, gameScriptExecution = false, allowlistOnly = true }
                    }));
                    return 0;
                default:
                    Console.Error.WriteLine($"Unknown command: {args[0]}");
                    PrintHelp();
                    return 2;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine("ERROR: " + ex.Message);
            return 1;
        }
    }

    private static int Open(LaunchService launcher)
    {
        var opened = launcher.OpenDesktopApp();
        Console.WriteLine(opened
            ? "Opened Roptimer.exe."
            : "Roptimer.exe was not found next to RoptimerBoost.exe. Download Roptimer-Windows-x64.zip first.");
        return opened ? 0 : 1;
    }

    private static int Preview(SettingsStore store, FastFlagService fastFlags, Dictionary<string, string> options)
    {
        var settings = store.Load();
        ApplyOptions(settings, options);
        Console.WriteLine(fastFlags.Preview(settings));
        return 0;
    }

    private static int Apply(SettingsStore store, FastFlagService fastFlags, Dictionary<string, string> options)
    {
        var settings = store.Load();
        ApplyOptions(settings, options);
        store.Save(settings);
        var launch = HasFlag(options, "launch");
        var result = fastFlags.Apply(settings, launch);
        Console.WriteLine(Json.Serialize(new
        {
            applied = true,
            mode = settings.OptimizationMode,
            fpsTarget = settings.FpsTarget,
            graphicsTier = settings.GraphicsTier,
            textureTier = settings.TextureTier,
            flagCount = result.FlagCount,
            profiles = result.Profiles,
            backups = result.Backups,
            launchedRoblox = launch,
            appliedUtc = result.AppliedUtc
        }));
        return 0;
    }

    private static int Bootstrap(SettingsStore store, FastFlagService fastFlags, LaunchService launcher, Dictionary<string, string> options)
    {
        var settings = store.Load();
        if (!options.ContainsKey("mode"))
        {
            var profile = OptimizationEngine.DetectProfile();
            OptimizationEngine.ApplyMode(settings, profile.RecommendedMode);
            Console.WriteLine(Json.Serialize(new
            {
                bootstrap = "auto",
                profile,
                selectedMode = settings.OptimizationMode
            }));
        }
        else
        {
            ApplyOptions(settings, options);
        }
        store.Save(settings);
        var launch = HasFlag(options, "launch");
        var result = fastFlags.Apply(settings, launch);
        var opened = launcher.OpenDesktopApp();
        Console.WriteLine(Json.Serialize(new
        {
            bootstrap = "complete",
            mode = settings.OptimizationMode,
            profiles = result.Profiles.Count,
            flags = result.FlagCount,
            launchedRoblox = launch,
            openedDesktopApp = opened,
            safety = "local JSON settings only; no DLL injection"
        }));
        return opened ? 0 : 1;
    }

    private static int Restore(FastFlagService fastFlags)
    {
        var result = fastFlags.Restore();
        Console.WriteLine(Json.Serialize(new { restored = true, profiles = result.ProfileCount, paths = result.Profiles }));
        return 0;
    }

    private static int Session(SettingsStore store, SessionDetector sessions, Dictionary<string, string> options)
    {
        var settings = store.Load();
        ApplyOptions(settings, options);
        Console.WriteLine(Json.Serialize(sessions.Snapshot(settings)));
        return 0;
    }

    private static int CleanCache(CacheCleaner cache, Dictionary<string, string> options)
    {
        var report = cache.Report(GetInt(options, "days", 7));
        var force = HasFlag(options, "force");
        var result = cache.Clean(report, force);
        Console.WriteLine(Json.Serialize(new
        {
            dryRun = result.DryRun,
            olderThanDays = report.OlderThanDays,
            candidates = report.Items.Count,
            candidateBytes = report.TotalBytes,
            movedFiles = result.MovedFiles,
            movedBytes = result.MovedBytes,
            quarantinePath = result.QuarantinePath,
            errors = result.Errors,
            note = force
                ? "Old log/temp files were moved to quarantine. No ClientAppSettings, executables, or game assets were touched."
                : "Dry run only. Re-run with --force to quarantine these files."
        }));
        return 0;
    }

    private static object BuildTiers()
    {
        var levels = Enumerable.Range(0, 22).Select(level => new
        {
            value = level,
            label = level == 0 ? "Automatic" : $"Level {level}",
            category = level == 0 ? "automatic" : level <= 6 ? "low" : "high/micro",
            flag = "DFIntDebugFRMQualityLevelOverride"
        }).ToList();
        return new
        {
            graphics = levels,
            texture = Enumerable.Range(0, 4).Select(level => new
            {
                value = level,
                label = level == 0 ? "Lowest" : $"Texture {level}",
                flag = "DFIntTextureQualityOverride"
            }).ToList(),
            note = "0-21 uses the allowlisted FRM quality override. Values above 10 are legacy/micro levels and may change or be ignored by Roblox."
        };
    }

    private static void ApplyOptions(AppSettings settings, Dictionary<string, string> options)
    {
        if (options.TryGetValue("mode", out var mode))
        {
            if (mode.Equals("auto", StringComparison.OrdinalIgnoreCase) || mode.Equals("choose", StringComparison.OrdinalIgnoreCase))
                mode = OptimizationEngine.ChooseRecommendedMode();
            OptimizationEngine.ApplyMode(settings, mode);
        }
        if (options.TryGetValue("fps", out var fps) && int.TryParse(fps, out var fpsValue))
            settings.FpsTarget = fpsValue;
        if (options.TryGetValue("tier", out var tier) && int.TryParse(tier, out var tierValue))
            settings.GraphicsTier = tierValue;
        if (options.TryGetValue("texture", out var texture) && int.TryParse(texture, out var textureValue))
            settings.TextureTier = textureValue;
        if (options.TryGetValue("name", out var name))
            settings.RobloxDisplayName = name;
        if (options.TryGetValue("custom-root", out var root))
            settings.CustomRoot = root;
        if (HasFlag(options, "all-versions"))
            settings.AllVersions = true;
        if (HasFlag(options, "active-version-only"))
            settings.AllVersions = false;
        if (HasFlag(options, "no-legacy-fps"))
            settings.LegacyFpsFlag = false;
        if (HasFlag(options, "legacy-fps"))
            settings.LegacyFpsFlag = true;
        settings.Normalize();
    }

    private static Dictionary<string, string> ParseOptions(string[] args)
    {
        var options = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        for (var i = 0; i < args.Length; i++)
        {
            var token = args[i];
            if (!token.StartsWith("--", StringComparison.Ordinal))
                continue;
            var body = token[2..];
            if (body.Contains('='))
            {
                var pieces = body.Split('=', 2);
                options[pieces[0]] = pieces[1];
                continue;
            }
            if (i + 1 < args.Length && !args[i + 1].StartsWith("--", StringComparison.Ordinal))
                options[body] = args[++i];
            else
                options[body] = "true";
        }
        return options;
    }

    private static bool HasFlag(Dictionary<string, string> options, string name) =>
        options.TryGetValue(name, out var value) && !value.Equals("false", StringComparison.OrdinalIgnoreCase) && !value.Equals("0", StringComparison.OrdinalIgnoreCase);

    private static int GetInt(Dictionary<string, string> options, string name, int fallback) =>
        options.TryGetValue(name, out var value) && int.TryParse(value, out var parsed) ? parsed : fallback;

    private static void PrintHelp()
    {
        Console.WriteLine("""
RoptimerBoost 3.2.0 — safe CLI/bootstrapper for Roptimer Hub V3.2

USAGE
  RoptimerBoost.exe <command> [options]

COMMANDS
  open                              Open the Roptimer.exe desktop app
  bootstrap [--mode auto] [--launch]  Auto-pick a mode, apply it, open the app
  preview [options]                 Preview the exact ClientAppSettings.json flags
  apply|boost [options]             Apply safe local settings
  restore                           Restore managed flags from the saved state
  session [options]                 Print a safe OS-level Roblox session snapshot
  modes                             List safe optimization modes
  tiers                             List graphics tiers 0-21 and texture tiers 0-3
  features                          Print the feature status/safety catalog
  allowlist                         Print the canonical FastFlag allowlist
  settings                          Print current Roptimer settings
  cache-report [--days 7]           Report old log/temp files that could be quarantined
  cache-clean [--days 7] [--force]  Quarantine old log/temp files (dry run without --force)
  self-test                         Run the headless .NET core test
  build-info                        Print build and safety information
  help                              Show this help

OPTIONS
  --mode "Better FPS"               Better FPS | Reduce building lag | Balanced |
                                    Maximum performance | Visual quality | auto
  --fps 144                         Legacy FPS target (current clients may ignore it)
  --tier 1                          Extended graphics tier 0-21
  --texture 1                       Texture tier 0-3
  --name "YourName"                 Locally typed display name
  --all-versions                    Apply to every discovered Roblox version
  --active-version-only             Apply to the newest discovered version only
  --no-legacy-fps                   Do not write DFIntTaskSchedulerTargetFps
  --launch                          Launch Roblox through the normal roblox:// protocol
  --days 7                          Cache cleaner age threshold
  --force                           Actually quarantine cache files

WINDOWS EXAMPLES
  RoptimerBoost.exe open
  RoptimerBoost.exe bootstrap --launch
  RoptimerBoost.exe preview --mode "Reduce building lag" --tier 21 --texture 0
  RoptimerBoost.exe apply --mode "Better FPS" --fps 144 --all-versions
  RoptimerBoost.exe restore
  RoptimerBoost.exe cache-clean --days 7 --force

SAFETY
  No DLL injection, process hooks, memory reads/writes, telemetry disabling,
  fullbright, x-ray, building removal, anti-cheat bypass, or automation.
""");
    }
}
