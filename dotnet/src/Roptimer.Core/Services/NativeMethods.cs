namespace Roptimer.Core.Services;

internal static class NativeMethods
{
    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    public static string GetActiveWindowTitle()
    {
        if (!OperatingSystem.IsWindows())
            return "";
        try
        {
            var builder = new StringBuilder(512);
            var length = GetWindowText(GetForegroundWindow(), builder, builder.Capacity);
            return length > 0 ? builder.ToString() : "";
        }
        catch
        {
            return "";
        }
    }
}
