namespace Roptimer.Core.Services;

public sealed class LaunchService
{
    public void LaunchRoblox()
    {
        try
        {
            Process.Start(new ProcessStartInfo("roblox://") { UseShellExecute = true });
        }
        catch
        {
            Process.Start(new ProcessStartInfo("https://www.roblox.com") { UseShellExecute = true });
        }
    }

    public bool OpenDesktopApp(string[]? args = null)
    {
        var candidates = new[]
        {
            Path.Combine(AppContext.BaseDirectory, "Roptimer.exe"),
            Path.Combine(AppContext.BaseDirectory, "..", "Roptimer.exe"),
            Path.Combine(Directory.GetCurrentDirectory(), "Roptimer.exe")
        };
        var exe = candidates.Select(Path.GetFullPath).FirstOrDefault(File.Exists);
        if (exe is null)
            return false;
        var start = new ProcessStartInfo(exe) { UseShellExecute = true };
        foreach (var arg in args ?? Array.Empty<string>())
            start.ArgumentList.Add(arg);
        Process.Start(start);
        return true;
    }

    public void OpenUrl(string url) =>
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
}
