namespace Roptimer.Core.Models;

public sealed class OptimizationMode
{
    public string Name { get; init; } = "";
    public string Icon { get; init; } = "";
    public string Description { get; init; } = "";
    public int FpsTarget { get; init; } = 144;
    public int GraphicsTier { get; init; } = 1;
    public int TextureTier { get; init; } = 1;
    public bool OptimizeRendering { get; init; } = true;
    public bool VfxReducer { get; init; } = true;
    public bool BuildingLagReducer { get; init; }

    public void ApplyTo(AppSettings settings)
    {
        settings.OptimizationMode = Name;
        settings.FpsTarget = FpsTarget;
        settings.GraphicsTier = GraphicsTier;
        settings.TextureTier = TextureTier;
        settings.OptimizeRendering = OptimizeRendering;
        settings.VfxReducer = VfxReducer;
        settings.BuildingLagReducer = BuildingLagReducer;
        settings.Normalize();
    }
}

public static class OptimizationModes
{
    public static readonly IReadOnlyList<OptimizationMode> All = new[]
    {
        new OptimizationMode
        {
            Name = "Better FPS",
            Icon = "F",
            Description = "Stable 144 FPS target with low graphics overhead.",
            FpsTarget = 144,
            GraphicsTier = 1,
            TextureTier = 1,
            VfxReducer = true,
            BuildingLagReducer = false
        },
        new OptimizationMode
        {
            Name = "Reduce building lag",
            Icon = "B",
            Description = "Lowest safe geometry LOD, grass distance and texture load.",
            FpsTarget = 120,
            GraphicsTier = 1,
            TextureTier = 0,
            VfxReducer = true,
            BuildingLagReducer = true
        },
        new OptimizationMode
        {
            Name = "Balanced",
            Icon = "=",
            Description = "Middle-ground detail and performance.",
            FpsTarget = 144,
            GraphicsTier = 3,
            TextureTier = 1,
            VfxReducer = false,
            BuildingLagReducer = false
        },
        new OptimizationMode
        {
            Name = "Maximum performance",
            Icon = "M",
            Description = "Highest safe local detail reduction with a 240 FPS target.",
            FpsTarget = 240,
            GraphicsTier = 1,
            TextureTier = 0,
            VfxReducer = true,
            BuildingLagReducer = true
        },
        new OptimizationMode
        {
            Name = "Visual quality",
            Icon = "V",
            Description = "Keeps more detail while retaining a higher frame target.",
            FpsTarget = 240,
            GraphicsTier = 10,
            TextureTier = 3,
            OptimizeRendering = false,
            VfxReducer = false,
            BuildingLagReducer = false
        }
    };

    public static OptimizationMode Find(string name) =>
        All.FirstOrDefault(m => string.Equals(m.Name, name, StringComparison.OrdinalIgnoreCase))
        ?? All[0];
}

public sealed record SystemProfile(
    int CpuCores,
    double MemoryGb,
    string Tier,
    string RecommendedMode,
    string Source);

public sealed record ApplyResult(
    int FlagCount,
    IReadOnlyList<string> Profiles,
    IReadOnlyList<string> Backups,
    DateTimeOffset AppliedUtc);

public sealed record RestoreResult(
    int ProfileCount,
    IReadOnlyList<string> Profiles);
