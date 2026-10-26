using System.Windows;
using System.Windows.Controls;
using Roptimer.Core.Services;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class AllowlistPage : Page
{
    public AllowlistPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e) => Refresh();

    private void Refresh()
    {
        var allowlist = FastFlagAllowlist.Load();
        var rows = new List<AllowlistRow>();
        foreach (var group in allowlist.Groups)
        {
            foreach (var flag in group.Flags)
            {
                rows.Add(new AllowlistRow
                {
                    Category = group.Name,
                    Flag = flag,
                    Status = "Allowlisted",
                    Notes = Describe(flag)
                });
            }
        }
        AllowlistGrid.ItemsSource = rows;
        AllowlistJson.Text = allowlist.AsJson();
        CountText.Text = $"{allowlist.FlagCount} allowlisted flags · {allowlist.CategoryCount} categories";
    }

    private void Refresh_Click(object sender, RoutedEventArgs e) => Refresh();

    private void Copy_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(AllowlistJson.Text);
        AppState.Instance.Emit("FastFlag allowlist JSON copied.");
    }

    private static string Describe(string flag) => flag switch
    {
        "DFIntCSGLevelOfDetailSwitchingDistance" or
        "DFIntCSGLevelOfDetailSwitchingDistanceL12" or
        "DFIntCSGLevelOfDetailSwitchingDistanceL23" or
        "DFIntCSGLevelOfDetailSwitchingDistanceL34" => "Geometry LOD distance; no building removal",
        "FFlagHandleAltEnterFullscreenManually" => "Manual Alt+Enter fullscreen behavior",
        "DFFlagTextureQualityOverrideEnabled" or "DFIntTextureQualityOverride" => "Texture tier override 0-3",
        "FIntDebugForceMSAASamples" => "MSAA sample override",
        "DFFlagDisableDPIScale" => "Local DPI scaling override",
        "FFlagDebugGraphicsPreferD3D11" or "FFlagDebugGraphicsPreferVulkan" or "FFlagDebugGraphicsPreferOpenGL" => "Mutually exclusive renderer preference",
        "FFlagDebugSkyGray" => "Neutral sky debug rendering",
        "DFFlagDebugPauseVoxelizer" => "Voxel/lighting workload reduction",
        "DFIntDebugFRMQualityLevelOverride" => "Extended graphics tier 0-21",
        "FIntFRMMaxGrassDistance" or "FIntFRMMinGrassDistance" => "Grass draw distance reduction",
        "FIntGrassMovementReducedMotionFactor" => "Reduced grass motion / UI category",
        _ => "Local reversible JSON setting"
    };
}
