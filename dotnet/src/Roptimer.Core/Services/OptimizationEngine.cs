namespace Roptimer.Core.Services;

public static class OptimizationEngine
{
    public static IReadOnlyList<OptimizationMode> Modes => OptimizationModes.All;

    public static SystemProfile DetectProfile()
    {
        var cores = Math.Max(1, Environment.ProcessorCount);
        double memoryGb = 0;
        try { memoryGb = GC.GetGCMemoryInfo().TotalAvailableMemoryBytes / 1_073_741_824d; }
        catch { memoryGb = 0; }
        var tier = cores <= 4 || (memoryGb > 0 && memoryGb <= 4) ? "low"
            : cores <= 8 || (memoryGb > 0 && memoryGb <= 8) ? "medium"
            : cores >= 12 || memoryGb >= 16 ? "high" : "balanced";
        var mode = tier switch
        {
            "low" => "Reduce building lag",
            "medium" => "Better FPS",
            "high" => "Maximum performance",
            _ => "Balanced"
        };
        return new SystemProfile(cores, Math.Round(memoryGb, 1), tier, mode, "Environment.ProcessorCount + GC.GetGCMemoryInfo");
    }

    public static string ChooseRecommendedMode(SystemProfile? profile = null) =>
        (profile ?? DetectProfile()).RecommendedMode;

    public static void ApplyMode(AppSettings settings, string mode)
    {
        if (string.Equals(mode, "Custom", StringComparison.OrdinalIgnoreCase))
        {
            settings.OptimizationMode = "Custom";
            settings.Normalize();
            return;
        }
        OptimizationModes.Find(mode).ApplyTo(settings);
    }
}
