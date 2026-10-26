namespace Roptimer.Core.Models;

public sealed class AppSettings
{
    public string RobloxDisplayName { get; set; } = "";
    public int FpsTarget { get; set; } = 144;
    public bool LegacyFpsFlag { get; set; } = true;
    public int GraphicsTier { get; set; } = 1;
    public int TextureTier { get; set; } = 1;
    public bool OptimizeRendering { get; set; } = true;
    public bool VfxReducer { get; set; } = true;
    public bool BuildingLagReducer { get; set; } = true;
    public bool Notifications { get; set; } = true;
    public bool BrightUi { get; set; }
    public string OptimizationMode { get; set; } = "Better FPS";
    public string Theme { get; set; } = "Lumina";
    public bool AllVersions { get; set; } = true;
    public bool LaunchAfterApply { get; set; }
    public int CacheCleanupDays { get; set; } = 7;
    public string CustomRoot { get; set; } = "";
    public DateTimeOffset? LastAppliedUtc { get; set; }

    public void Normalize()
    {
        FpsTarget = Math.Clamp(FpsTarget, 60, 9999);
        GraphicsTier = Math.Clamp(GraphicsTier, 0, 21);
        TextureTier = Math.Clamp(TextureTier, 0, 3);
        CacheCleanupDays = Math.Clamp(CacheCleanupDays, 1, 90);
        RobloxDisplayName = CleanName(RobloxDisplayName);
        if (!AppConstraints.OptimizationModes.Contains(OptimizationMode))
            OptimizationMode = "Better FPS";
        if (!AppConstraints.Themes.Contains(Theme))
            Theme = "Lumina";
    }

    private static string CleanName(string? value)
    {
        var text = new string((value ?? "").Where(ch => !char.IsControl(ch)).ToArray()).Trim();
        return text.Length > 32 ? text[..32] : text;
    }
}

public static class AppConstraints
{
    public static readonly IReadOnlyList<string> OptimizationModes =
        new[] { "Better FPS", "Reduce building lag", "Balanced", "Maximum performance", "Visual quality", "Custom" };

    public static readonly IReadOnlyList<string> Themes =
        new[] { "Lumina", "Midnight", "Frost" };
}
