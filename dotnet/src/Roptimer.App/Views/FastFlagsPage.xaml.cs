using System.Windows;
using System.Windows.Controls;
using Roptimer.Core.Services;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class FastFlagsPage : Page
{
    public FastFlagsPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e) => Refresh();

    private void Refresh()
    {
        var state = AppState.Instance;
        var flags = state.FastFlags.BuildFlags(state.Settings);
        JsonBox.Text = state.FastFlags.Preview(state.Settings);
        FlagGrid.ItemsSource = flags.Select(pair => new FlagRow
        {
            Flag = pair.Key,
            Value = pair.Value,
            Status = pair.Key == FastFlagService.LegacyFpsFlag ? "Legacy" : "Allowlisted",
            Notes = pair.Key switch
            {
                "DFIntDebugFRMQualityLevelOverride" => "Extended graphics tier 0-21",
                "DFIntTextureQualityOverride" or "DFFlagTextureQualityOverrideEnabled" => "Texture tier override 0-3",
                "FIntFRMMaxGrassDistance" or "FIntFRMMinGrassDistance" => "Safe grass draw distance reduction",
                "DFIntCSGLevelOfDetailSwitchingDistance" or
                "DFIntCSGLevelOfDetailSwitchingDistanceL12" or
                "DFIntCSGLevelOfDetailSwitchingDistanceL23" or
                "DFIntCSGLevelOfDetailSwitchingDistanceL34" => "Geometry LOD only; no building removal",
                "FFlagDebugGraphicsPreferD3D11" or "FFlagDebugGraphicsPreferVulkan" or "FFlagDebugGraphicsPreferOpenGL" => "Mutually exclusive renderer preference",
                "DFFlagDisableDPIScale" => "Local DPI scaling override",
                "FFlagDebugSkyGray" => "Neutral sky debug rendering",
                "DFFlagDebugPauseVoxelizer" => "Voxel/lighting workload reduction",
                "FFlagHandleAltEnterFullscreenManually" => "Manual Alt+Enter fullscreen behavior",
                "FIntGrassMovementReducedMotionFactor" => "Reduced grass motion / UI category",
                _ => "Local reversible JSON setting"
            }
        }).ToList();
    }

    private void Refresh_Click(object sender, RoutedEventArgs e) => Refresh();

    private void Copy_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(JsonBox.Text);
        AppState.Instance.Emit("FastFlag JSON copied.");
    }

    private void Apply_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            var result = AppState.Instance.Apply(false);
            MessageBox.Show($"Applied {result.FlagCount} flags to {result.Profiles.Count} profile(s).", "Roptimer", MessageBoxButton.OK, MessageBoxImage.Information);
            Refresh();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Apply failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }
}
