namespace Roptimer.Core.Services;

public sealed class CacheCleaner
{
    private static readonly HashSet<string> AllowedExtensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ".log", ".txt", ".tmp", ".old"
    };

    private readonly RobloxLocator _locator;

    public CacheCleaner(RobloxLocator locator) => _locator = locator;

    public CacheReport Report(int olderThanDays)
    {
        olderThanDays = Math.Clamp(olderThanDays, 1, 90);
        var cutoff = DateTimeOffset.UtcNow.AddDays(-olderThanDays);
        var items = new List<CacheItem>();
        var errors = new List<string>();
        foreach (var root in SafeRoots())
        {
            if (!Directory.Exists(root))
                continue;
            try
            {
                foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
                {
                    try
                    {
                        if (!IsSafeFile(file, root))
                            continue;
                        var info = new FileInfo(file);
                        if (info.LastWriteTimeUtc > cutoff.UtcDateTime)
                            continue;
                        var age = Math.Max(0, (int)(DateTimeOffset.UtcNow - new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero)).TotalDays);
                        items.Add(new CacheItem
                        {
                            Path = info.FullName,
                            Bytes = info.Length,
                            LastWriteUtc = new DateTimeOffset(info.LastWriteTimeUtc, TimeSpan.Zero),
                            AgeDays = age,
                            Root = root
                        });
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        errors.Add(ex.Message);
                    }
                }
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                errors.Add(ex.Message);
            }
        }
        return new CacheReport
        {
            OlderThanDays = olderThanDays,
            Items = items.OrderBy(item => item.Path, StringComparer.OrdinalIgnoreCase).ToList(),
            TotalBytes = items.Sum(item => item.Bytes),
            Errors = errors.Distinct().Take(20).ToList()
        };
    }

    public CacheCleanResult Clean(CacheReport report, bool force)
    {
        var quarantine = Path.Combine(_locator.StateRoot, "Quarantine", DateTimeOffset.UtcNow.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture));
        if (!force)
            return new CacheCleanResult(true, 0, 0, quarantine, Array.Empty<string>());
        var errors = new List<string>();
        var moved = 0;
        long bytes = 0;
        foreach (var item in report.Items)
        {
            try
            {
                var relative = Path.GetRelativePath(item.Root, item.Path);
                var destination = Path.Combine(quarantine, SafeName(item.Root), relative);
                Directory.CreateDirectory(Path.GetDirectoryName(destination)!);
                if (File.Exists(destination))
                    destination += "-" + Guid.NewGuid().ToString("N")[..6];
                File.Move(item.Path, destination);
                moved++;
                bytes += item.Bytes;
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
            {
                errors.Add(ex.Message);
            }
        }
        return new CacheCleanResult(false, moved, bytes, quarantine, errors);
    }

    private IReadOnlyList<string> SafeRoots()
    {
        var roots = new List<string>
        {
            Path.Combine(_locator.LocalAppData, "Roblox", "logs"),
            Path.Combine(_locator.LocalAppData, "Roblox", "ClientSettings", "logs"),
            Path.Combine(_locator.AppData, "Roptimer", "Logs"),
            Path.Combine(Path.GetTempPath(), "Roblox")
        };
        try
        {
            var versions = Path.Combine(_locator.LocalAppData, "Roblox", "Versions");
            if (Directory.Exists(versions))
                roots.AddRange(Directory.EnumerateDirectories(versions, "version-*").Select(dir => Path.Combine(dir, "logs")));
        }
        catch { /* Reporting only; never fail the app on inaccessible cache folders. */ }
        return roots.Select(Path.GetFullPath).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private static bool IsSafeFile(string file, string root)
    {
        var full = Path.GetFullPath(file);
        var normalizedRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!full.StartsWith(normalizedRoot, StringComparison.OrdinalIgnoreCase))
            return false;
        if (!AllowedExtensions.Contains(Path.GetExtension(full)))
            return false;
        if (full.Contains("ClientAppSettings", StringComparison.OrdinalIgnoreCase))
            return false;
        if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0)
            return false;
        return true;
    }

    private static string SafeName(string root)
    {
        var name = Path.GetFileName(Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar));
        foreach (var ch in Path.GetInvalidFileNameChars())
            name = name.Replace(ch, '_');
        return string.IsNullOrWhiteSpace(name) ? "cache" : name;
    }
}
