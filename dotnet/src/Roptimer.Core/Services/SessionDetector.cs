namespace Roptimer.Core.Services;

public sealed class SessionDetector
{
    private readonly RobloxLocator _locator;

    public SessionDetector(RobloxLocator locator) => _locator = locator;

    public SessionSnapshot Snapshot(AppSettings settings)
    {
        var runningPaths = _locator.RunningPlayerPaths();
        var windowTitle = NativeMethods.GetActiveWindowTitle();
        if (!windowTitle.Contains("Roblox", StringComparison.OrdinalIgnoreCase))
            windowTitle = "";
        var installed = _locator.DiscoverVersions(settings.CustomRoot).Count;
        return BuildSnapshot(settings, runningPaths, windowTitle, installed);
    }

    public SessionSnapshot Snapshot(
        AppSettings settings,
        IReadOnlyList<string> runningPaths,
        string windowTitle,
        int installedVersions) => BuildSnapshot(settings, runningPaths, windowTitle, installedVersions);

    private SessionSnapshot BuildSnapshot(
        AppSettings settings,
        IReadOnlyList<string> runningPaths,
        string windowTitle,
        int installedVersions)
    {
        settings.Normalize();
        var local = Environment.UserName;
        var display = string.IsNullOrWhiteSpace(settings.RobloxDisplayName) ? local : settings.RobloxDisplayName;
        var running = runningPaths.Count > 0;
        var version = _locator.VersionHintFromPaths(runningPaths);
        var notification = running
            ? $"Roptimer is now connected to {display}'s Roblox client — OS metadata only, no client injection."
            : "Roptimer V3 is ready. Launch Roblox to use your local performance profile.";
        return new SessionSnapshot
        {
            Running = running,
            RunningPaths = runningPaths,
            ActiveWindowTitle = windowTitle,
            LocalUsername = local,
            DisplayUsername = display,
            VersionHint = version,
            InstalledVersions = installedVersions,
            Notification = notification,
            Safety = new Dictionary<string, bool>(StringComparer.Ordinal)
            {
                ["injection"] = false,
                ["memoryReads"] = false,
                ["accountDataExtraction"] = false,
                ["fullbright"] = false,
                ["antiCheatBypass"] = false
            }
        };
    }
}
