namespace Roptimer.Core.Models;

public sealed class SessionSnapshot
{
    public bool Running { get; init; }
    public IReadOnlyList<string> RunningPaths { get; init; } = Array.Empty<string>();
    public string ActiveWindowTitle { get; init; } = "";
    public string LocalUsername { get; init; } = "";
    public string DisplayUsername { get; init; } = "";
    public string VersionHint { get; init; } = "Not detected";
    public int InstalledVersions { get; init; }
    public string Notification { get; init; } = "";
    public Dictionary<string, bool> Safety { get; init; } = new();

    public IReadOnlyList<(string Label, string Value)> Rows() => new[]
    {
        ("Session state", Running ? "Roblox client running" : "No Roblox client detected"),
        ("Roblox version", VersionHint),
        ("Installed versions", InstalledVersions.ToString(CultureInfo.InvariantCulture)),
        ("Active window title", string.IsNullOrWhiteSpace(ActiveWindowTitle) ? "Not detected" : ActiveWindowTitle),
        ("Local Windows user", LocalUsername),
        ("Display name", DisplayUsername),
        ("Client paths", RunningPaths.Count.ToString(CultureInfo.InvariantCulture))
    };
}
