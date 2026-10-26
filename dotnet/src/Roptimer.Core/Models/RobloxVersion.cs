namespace Roptimer.Core.Models;

public sealed record RobloxVersion(
    string FolderPath,
    string Executable,
    DateTimeOffset Modified,
    string Source)
{
    public string ProfilePath => Path.Combine(FolderPath, "ClientSettings", "ClientAppSettings.json");
}
