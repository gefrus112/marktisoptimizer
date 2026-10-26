using Roptimer.Core.Models;
using Roptimer.Core.Services;

namespace Roptimer.App;

public sealed class AppState
{
    public static AppState Instance { get; } = new();

    private AppState()
    {
        Locator = new RobloxLocator();
        Store = new SettingsStore(Locator);
        Launcher = new LaunchService();
        FastFlags = new FastFlagService(Locator, Launcher);
        Sessions = new SessionDetector(Locator);
        Cache = new CacheCleaner(Locator);
        Features = FeatureCatalog.Load();
        Settings = Store.Load();
    }

    public RobloxLocator Locator { get; }
    public SettingsStore Store { get; }
    public LaunchService Launcher { get; }
    public FastFlagService FastFlags { get; }
    public SessionDetector Sessions { get; }
    public CacheCleaner Cache { get; }
    public FeatureCatalog Features { get; }
    public AppSettings Settings { get; private set; }
    public event EventHandler<string>? StatusChanged;

    public void Reload()
    {
        Settings = Store.Load();
        ThemeService.Apply(Settings.Theme);
        Emit("Settings reloaded.");
    }

    public void Save()
    {
        Store.Save(Settings);
        Emit("Settings saved.");
    }

    public void Reset()
    {
        Settings = new AppSettings();
        Store.Save(Settings);
        ThemeService.Apply(Settings.Theme);
        Emit("Settings reset to safe defaults.");
    }

    public ApplyResult Apply(bool launch)
    {
        Store.Save(Settings);
        var result = FastFlags.Apply(Settings, launch);
        Settings.LastAppliedUtc = result.AppliedUtc;
        Store.Save(Settings);
        Emit($"Applied {result.FlagCount} flags to {result.Profiles.Count} profile(s).");
        return result;
    }

    public RestoreResult Restore()
    {
        var result = FastFlags.Restore();
        Emit($"Restored {result.ProfileCount} profile(s).");
        return result;
    }

    public SessionSnapshot Session() => Sessions.Snapshot(Settings);

    public void Emit(string message) => StatusChanged?.Invoke(this, message);
}
