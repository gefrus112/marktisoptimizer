using System.Windows;
using System.Windows.Controls;
using Roptimer.Core.Services;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class DashboardPage : Page
{
    public DashboardPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e) => Refresh();

    private void Refresh()
    {
        var state = AppState.Instance;
        var settings = state.Settings;
        var profile = OptimizationEngine.DetectProfile();
        ModeText.Text = settings.OptimizationMode;
        FpsText.Text = settings.FpsTarget.ToString();
        TierText.Text = $"{settings.GraphicsTier} / 21";
        VersionText.Text = state.Locator.DiscoverVersions(settings.CustomRoot).Count.ToString();
        AutoProfileText.Text = $"Auto profile: {profile.Tier} hardware, {profile.CpuCores} cores, {profile.MemoryGb:0.0} GB available. Recommended: {profile.RecommendedMode}.";
        StatusSummary.Text = $"Last applied: {(settings.LastAppliedUtc?.LocalDateTime.ToString("g") ?? "never")}. Safe mode: no injection, memory edits, or Roblox telemetry disabling.";
        FeatureGrid.ItemsSource = state.Features.Document.Features.Select(f => new FeatureRow
        {
            Name = f.Name,
            Status = f.Status,
            Safety = f.Safe ? "Safe" : "Rejected",
            Flag = f.Flag ?? "",
            Details = f.Details
        }).ToList();
    }

    private void QuickMode_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string mode)
        {
            OptimizationEngine.ApplyMode(AppState.Instance.Settings, mode);
            ApplyAndRefresh();
        }
    }

    private void AutoApply_Click(object sender, RoutedEventArgs e)
    {
        var profile = OptimizationEngine.DetectProfile();
        OptimizationEngine.ApplyMode(AppState.Instance.Settings, profile.RecommendedMode);
        ApplyAndRefresh();
    }

    private void ApplyAndRefresh()
    {
        try
        {
            AppState.Instance.Apply(false);
            Refresh();
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Apply failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void Launch_Click(object sender, RoutedEventArgs e)
    {
        AppState.Instance.Launcher.LaunchRoblox();
        AppState.Instance.Emit("Launched Roblox through roblox://.");
    }

    private void Refresh_Click(object sender, RoutedEventArgs e) => Refresh();
}
