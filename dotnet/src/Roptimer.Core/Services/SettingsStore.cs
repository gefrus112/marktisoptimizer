namespace Roptimer.Core.Services;

public sealed class SettingsStore
{
    private readonly RobloxLocator _locator;

    public SettingsStore(RobloxLocator locator) => _locator = locator;

    public string Path => _locator.SettingsPath;

    public AppSettings Load()
    {
        AppSettings settings;
        try
        {
            var text = File.Exists(Path) ? File.ReadAllText(Path, Encoding.UTF8) : "";
            settings = string.IsNullOrWhiteSpace(text) ? new AppSettings() : Json.Deserialize<AppSettings>(text) ?? new AppSettings();
        }
        catch
        {
            settings = new AppSettings();
        }
        settings.Normalize();
        return settings;
    }

    public void Save(AppSettings settings)
    {
        settings.Normalize();
        Directory.CreateDirectory(_locator.StateRoot);
        AtomicWrite(Path, Json.Serialize(settings));
    }

    internal static void AtomicWrite(string path, string contents)
    {
        Directory.CreateDirectory(System.IO.Path.GetDirectoryName(path) ?? Directory.GetCurrentDirectory());
        var temp = path + ".tmp-" + Guid.NewGuid().ToString("N")[..8];
        File.WriteAllText(temp, contents + Environment.NewLine, new UTF8Encoding(false));
        File.Move(temp, path, true);
    }
}
