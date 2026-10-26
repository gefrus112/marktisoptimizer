namespace Roptimer.Core.Services;

public static class SelfTest
{
    public static string Run()
    {
        using var temp = new TempDirectory();
        var localAppData = Directory.CreateDirectory(Path.Combine(temp.Path, "LocalAppData")).FullName;
        var appData = Directory.CreateDirectory(Path.Combine(temp.Path, "Roaming")).FullName;
        var versionsRoot = Directory.CreateDirectory(Path.Combine(localAppData, "Roblox", "Versions")).FullName;
        var versionA = Directory.CreateDirectory(Path.Combine(versionsRoot, "version-aaaaaaaaaaaaaaaa")).FullName;
        var versionB = Directory.CreateDirectory(Path.Combine(versionsRoot, "version-bbbbbbbbbbbbbbbb")).FullName;
        File.WriteAllText(Path.Combine(versionA, "RobloxPlayerBeta.exe"), "fake");
        File.WriteAllText(Path.Combine(versionB, "RobloxPlayerBeta.exe"), "fake");

        var locator = new RobloxLocator(localAppData, appData);
        var store = new SettingsStore(locator);
        var launcher = new LaunchService();
        var fastFlags = new FastFlagService(locator, launcher);
        var cache = new CacheCleaner(locator);
        var sessions = new SessionDetector(locator);
        var catalog = FeatureCatalog.Load();
        var allowlist = FastFlagAllowlist.Load();

        Assert(locator.DiscoverVersions().Count == 2, "expected two fake Roblox versions");
        var settings = store.Load();
        settings.FpsTarget = 144;
        settings.GraphicsTier = 21;
        settings.TextureTier = 0;
        settings.AllVersions = true;
        settings.LaunchAfterApply = false;
        OptimizationEngine.ApplyMode(settings, "Reduce building lag");
        settings.GraphicsTier = 21;
        settings.TextureTier = 0;
        settings.Normalize();

        var flags = fastFlags.BuildFlags(settings);
        Assert(flags[FastFlagService.LegacyFpsFlag] == "144", "legacy FPS flag missing");
        Assert(flags["DFIntDebugFRMQualityLevelOverride"] == "21", "extended graphics tier 21 missing");
        Assert(flags["DFIntTextureQualityOverride"] == "0" || flags["DFIntTextureQualityOverride"] == "1", "texture tier missing");
        Assert(flags["FIntFRMMaxGrassDistance"] == "0", "building-lag grass distance missing");
        Assert(flags.Keys.All(FastFlagService.ManagedFlags.Contains), "unmanaged flag produced");
        Assert(allowlist.FlagCount == 18, "expected 18 canonical allowlist flags");
        Assert(allowlist.CategoryCount == 3, "expected Geometry, Rendering, and User Interface allowlist categories");
        Assert(allowlist.Flags.SetEquals(FastFlagService.AllowlistedManagedFlags), "allowlist does not match managed flags");
        Assert(!allowlist.Contains(FastFlagService.LegacyFpsFlag), "legacy FPS flag must not be allowlisted");

        var existing = Path.Combine(versionA, "ClientSettings", "ClientAppSettings.json");
        Directory.CreateDirectory(Path.GetDirectoryName(existing)!);
        File.WriteAllText(existing, "{\"UserCustomFlag\":\"keep me\"}");
        var applied = fastFlags.Apply(settings, false);
        Assert(applied.Profiles.Count == 3, "expected two versions plus shared profile");
        Assert(applied.Backups.Count >= 1, "expected a timestamped backup");
        var merged = JsonNode.Parse(File.ReadAllText(existing, Encoding.UTF8)) as JsonObject;
        Assert(merged is not null && merged["UserCustomFlag"]?.ToString() == "keep me", "unrelated key was not preserved");
        Assert(merged is not null && merged[FastFlagService.LegacyFpsFlag]?.ToString() == "144", "managed flag was not written");

        var restored = fastFlags.Restore();
        Assert(restored.ProfileCount == 3, "expected restore of three profiles");
        var after = JsonNode.Parse(File.ReadAllText(existing, Encoding.UTF8)) as JsonObject;
        Assert(after is not null && after["UserCustomFlag"]?.ToString() == "keep me", "restore lost unrelated key");
        Assert(after is not null && !after.Any(pair => FastFlagService.ManagedFlags.Contains(pair.Key)), "restore left managed keys");

        var profile = OptimizationEngine.DetectProfile();
        Assert(!string.IsNullOrWhiteSpace(profile.RecommendedMode), "auto mode missing");
        Assert(OptimizationEngine.Modes.Count >= 5, "optimization modes missing");
        Assert(catalog.Document.Features.Any(f => f.Id == "telemetry-disable" && !f.Implemented), "telemetry-disable must remain rejected");
        Assert(catalog.Document.Features.Any(f => f.Id == "dll-injector" && !f.Implemented), "dll-injector must remain rejected");

        var logs = Directory.CreateDirectory(Path.Combine(localAppData, "Roblox", "logs")).FullName;
        var oldLog = Path.Combine(logs, "old.log");
        File.WriteAllText(oldLog, "old log");
        File.SetLastWriteTimeUtc(oldLog, DateTime.UtcNow.AddDays(-20));
        var report = cache.Report(7);
        Assert(report.Items.Any(item => item.Path == Path.GetFullPath(oldLog)), "cache report missed an old log");

        var session = sessions.Snapshot(settings, new[] { Path.Combine(versionA, "RobloxPlayerBeta.exe") }, "Roblox", 2);
        Assert(session.Running, "session should be running");
        Assert(session.DisplayUsername.Length > 0, "display username missing");
        Assert(session.Notification.Contains("no client injection", StringComparison.OrdinalIgnoreCase), "safe notification missing");

        return $"ROPTIMER .NET SELF-TEST OK: 2 versions, {applied.Profiles.Count} profiles, {flags.Count} flags, tier 21 verified, allowlist {allowlist.FlagCount} verified, safety boundaries verified.";
    }

    private static void Assert(bool condition, string message)
    {
        if (!condition)
            throw new InvalidOperationException("Self-test failed: " + message);
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory() =>
            Path = System.IO.Path.Combine(System.IO.Path.GetTempPath(), "roptimer-dotnet-test-" + Guid.NewGuid().ToString("N"));

        public string Path { get; }

        public void Dispose()
        {
            try { if (Directory.Exists(Path)) Directory.Delete(Path, true); }
            catch { /* Best effort cleanup. */ }
        }
    }
}
