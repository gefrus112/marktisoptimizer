namespace Roptimer.Core.Services;

public sealed class RobloxLocator
{
    private static readonly string[] PlayerExecutables =
    {
        "RobloxPlayerBeta.exe",
        "RobloxPlayer.exe",
        "RobloxPlayerLauncher.exe"
    };

    private static readonly string[] ProcessNames =
    {
        "RobloxPlayerBeta",
        "RobloxPlayer",
        "RobloxPlayerLauncher"
    };

    public RobloxLocator(string? localAppData = null, string? appData = null)
    {
        LocalAppData = Full(localAppData
            ?? Environment.GetEnvironmentVariable("RFO_LOCALAPPDATA")
            ?? Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Local"));
        AppData = Full(appData
            ?? Environment.GetEnvironmentVariable("RFO_APPDATA")
            ?? Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData)
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "Roaming"));
    }

    public string LocalAppData { get; }
    public string AppData { get; }
    public string VersionsRoot => Path.Combine(LocalAppData, "Roblox", "Versions");
    public string SharedProfile => Path.Combine(LocalAppData, "Roblox", "ClientSettings", "ClientAppSettings.json");
    public string StateRoot => Path.Combine(AppData, "Roptimer");
    public string SettingsPath => Path.Combine(StateRoot, "settings.json");
    public string StatePath => Path.Combine(StateRoot, "state.json");

    public IReadOnlyList<RobloxVersion> DiscoverVersions(string? customRoot = null)
    {
        var roots = new List<string> { VersionsRoot };
        foreach (var name in new[] { "ProgramFiles(x86)", "ProgramFiles", "ProgramW6432" })
        {
            var value = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrWhiteSpace(value))
                roots.Add(Path.Combine(value, "Roblox", "Versions"));
        }
        if (!string.IsNullOrWhiteSpace(customRoot))
            roots.Add(customRoot);

        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var versions = new List<RobloxVersion>();
        foreach (var root in roots.Where(Directory.Exists))
        {
            var candidates = new List<string>();
            if (IsVersionFolder(root))
                candidates.Add(root);
            try
            {
                candidates.AddRange(Directory.EnumerateDirectories(root, "version-*", SearchOption.TopDirectoryOnly)
                    .Where(IsVersionFolder));
            }
            catch (IOException) { }
            catch (UnauthorizedAccessException) { }

            foreach (var folder in candidates)
            {
                var full = Full(folder);
                if (!seen.Add(full))
                    continue;
                var exe = FindPlayerExecutable(full);
                if (exe is null)
                    continue;
                var modified = SafeModified(exe);
                versions.Add(new RobloxVersion(full, exe, modified, full.StartsWith(LocalAppData, StringComparison.OrdinalIgnoreCase) ? "LocalAppData" : "Custom/ProgramFiles"));
            }
        }
        return versions.OrderByDescending(v => v.Modified).ToList();
    }

    public IReadOnlyList<string> ResolveProfilePaths(AppSettings settings, IReadOnlyList<RobloxVersion>? versions = null)
    {
        versions ??= DiscoverVersions(settings.CustomRoot);
        var paths = new List<string>();

        if (!string.IsNullOrWhiteSpace(settings.CustomRoot))
        {
            var custom = Full(settings.CustomRoot);
            if (IsVersionFolder(custom))
                paths.Add(Path.Combine(custom, "ClientSettings", "ClientAppSettings.json"));
        }

        if (settings.AllVersions)
            paths.AddRange(versions.Select(v => v.ProfilePath));
        else if (versions.Count > 0)
            paths.Add(versions[0].ProfilePath);

        if (settings.AllVersions || paths.Count == 0)
            paths.Add(SharedProfile);

        return paths
            .Select(Full)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Where(p => IsSafeProfilePath(p, settings.CustomRoot))
            .ToList();
    }

    public IReadOnlyList<string> RunningPlayerPaths()
    {
        var paths = new List<string>();
        foreach (var name in ProcessNames)
        {
            Process[] processes;
            try { processes = Process.GetProcessesByName(name); }
            catch { continue; }
            foreach (var process in processes)
            {
                try
                {
                    var path = process.MainModule?.FileName;
                    if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
                        paths.Add(Full(path));
                }
                catch { /* Process metadata only; never read memory. */ }
                finally { process.Dispose(); }
            }
        }
        return paths.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public bool IsSafeProfilePath(string path, string? customRoot = null)
    {
        var full = Full(path);
        if (!string.Equals(Path.GetFileName(full), "ClientAppSettings.json", StringComparison.OrdinalIgnoreCase))
            return false;
        var parent = Path.GetDirectoryName(full) ?? "";
        if (!string.Equals(Path.GetFileName(parent), "ClientSettings", StringComparison.OrdinalIgnoreCase))
            return false;

        var roots = new List<string> { Path.Combine(LocalAppData, "Roblox") };
        foreach (var name in new[] { "ProgramFiles(x86)", "ProgramFiles", "ProgramW6432" })
        {
            var value = Environment.GetEnvironmentVariable(name);
            if (!string.IsNullOrWhiteSpace(value))
                roots.Add(Path.Combine(value, "Roblox"));
        }
        if (!string.IsNullOrWhiteSpace(customRoot))
            roots.Add(Full(customRoot));
        return roots.Any(root => IsInside(full, root));
    }

    public string VersionHintFromPaths(IEnumerable<string> paths)
    {
        foreach (var path in paths)
        {
            var directory = new DirectoryInfo(Path.GetDirectoryName(Full(path)) ?? Full(path));
            while (directory is not null)
            {
                if (directory.Name.StartsWith("version-", StringComparison.OrdinalIgnoreCase))
                    return directory.Name;
                directory = directory.Parent;
            }
        }
        return "Not detected";
    }

    private static string? FindPlayerExecutable(string folder)
    {
        foreach (var name in PlayerExecutables)
        {
            var candidate = Path.Combine(folder, name);
            if (File.Exists(candidate))
                return candidate;
        }
        try
        {
            return Directory.EnumerateFiles(folder, "RobloxPlayer*.exe", SearchOption.TopDirectoryOnly).FirstOrDefault();
        }
        catch { return null; }
    }

    private static bool IsVersionFolder(string folder)
    {
        if (!Directory.Exists(folder))
            return false;
        return FindPlayerExecutable(Full(folder)) is not null;
    }

    private static DateTimeOffset SafeModified(string path)
    {
        try { return new DateTimeOffset(File.GetLastWriteTimeUtc(path), TimeSpan.Zero); }
        catch { return DateTimeOffset.MinValue; }
    }

    private static string Full(string path) => Path.GetFullPath(Environment.ExpandEnvironmentVariables(path));

    private static bool IsInside(string path, string root)
    {
        var fullPath = Full(path) + Path.DirectorySeparatorChar;
        var fullRoot = Full(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        return fullPath.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase);
    }
}
