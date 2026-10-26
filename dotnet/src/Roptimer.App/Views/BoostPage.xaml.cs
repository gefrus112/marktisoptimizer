using System.Windows;
using System.Windows.Controls;
using Roptimer.Core.Models;
using Roptimer.Core.Services;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class BoostPage : Page
{
    private bool _loading;

    public BoostPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e)
    {
        var modes = OptimizationEngine.Modes.ToList();
        modes.Add(new OptimizationMode { Name = "Custom", Description = "Manual settings built from the controls below." });
        ModeCombo.ItemsSource = modes;
        SyncFromSettings();
        RefreshPreview();
    }

    private void SyncFromSettings()
    {
        _loading = true;
        var settings = AppState.Instance.Settings;
        ModeCombo.SelectedValue = settings.OptimizationMode;
        FpsSlider.Value = Math.Clamp(settings.FpsTarget, 60, 240);
        GraphicsTierSlider.Value = settings.GraphicsTier;
        TextureTierSlider.Value = settings.TextureTier;
        DisplayNameBox.Text = settings.RobloxDisplayName;
        LegacyCheck.IsChecked = settings.LegacyFpsFlag;
        VfxCheck.IsChecked = settings.VfxReducer;
        BuildingLagCheck.IsChecked = settings.BuildingLagReducer;
        AllVersionsCheck.IsChecked = settings.AllVersions;
        LaunchAfterApplyCheck.IsChecked = settings.LaunchAfterApply;
        var selected = (ModeCombo.SelectedItem as OptimizationMode)?.Description ?? "Custom manual settings.";
        ModeDescription.Text = selected;
        var profile = OptimizationEngine.DetectProfile();
        AutoProfileText.Text = $"Detected: {profile.Tier} profile, {profile.CpuCores} cores, {profile.MemoryGb:0.0} GB available => {profile.RecommendedMode}.";
        _loading = false;
    }

    private void SyncToSettings()
    {
        if (_loading)
            return;
        var settings = AppState.Instance.Settings;
        settings.FpsTarget = (int)FpsSlider.Value;
        settings.GraphicsTier = (int)GraphicsTierSlider.Value;
        settings.TextureTier = (int)TextureTierSlider.Value;
        settings.RobloxDisplayName = DisplayNameBox.Text;
        settings.LegacyFpsFlag = LegacyCheck.IsChecked == true;
        settings.VfxReducer = VfxCheck.IsChecked == true;
        settings.BuildingLagReducer = BuildingLagCheck.IsChecked == true;
        settings.AllVersions = AllVersionsCheck.IsChecked == true;
        settings.LaunchAfterApply = LaunchAfterApplyCheck.IsChecked == true;
        settings.Normalize();
        FpsLabel.Text = settings.FpsTarget.ToString();
        GraphicsTierLabel.Text = settings.GraphicsTier.ToString();
        TextureTierLabel.Text = settings.TextureTier.ToString();
        RefreshPreview();
    }

    private void RefreshPreview()
    {
        var settings = AppState.Instance.Settings;
        PreviewBox.Text = AppState.Instance.FastFlags.Preview(settings);
        CommandBox.Text = $"RoptimerBoost.exe apply --mode \"{settings.OptimizationMode}\" --fps {settings.FpsTarget} --tier {settings.GraphicsTier} --texture {settings.TextureTier}{(settings.AllVersions ? " --all-versions" : "")}{(settings.LaunchAfterApply ? " --launch" : "")}";
    }

    private void ModeCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_loading)
            return;
        var name = ModeCombo.SelectedValue?.ToString();
        if (string.IsNullOrWhiteSpace(name))
            return;
        if (name != "Custom")
            OptimizationEngine.ApplyMode(AppState.Instance.Settings, name);
        else
            AppState.Instance.Settings.OptimizationMode = "Custom";
        SyncFromSettings();
        RefreshPreview();
    }

    private void SliderChanged(object sender, RoutedPropertyChangedEventArgs<double> e) => SyncToSettings();
    private void CheckChanged(object sender, RoutedEventArgs e) => SyncToSettings();
    private void NameChanged(object sender, TextChangedEventArgs e) => SyncToSettings();

    private void AutoChoose_Click(object sender, RoutedEventArgs e)
    {
        var profile = OptimizationEngine.DetectProfile();
        OptimizationEngine.ApplyMode(AppState.Instance.Settings, profile.RecommendedMode);
        SyncFromSettings();
        RefreshPreview();
        AppState.Instance.Emit($"Chose {profile.RecommendedMode} for {profile.Tier} hardware.");
    }

    private void Apply_Click(object sender, RoutedEventArgs e)
    {
        SyncToSettings();
        try
        {
            var result = AppState.Instance.Apply(AppState.Instance.Settings.LaunchAfterApply);
            MessageBox.Show($"Applied {result.FlagCount} flags to {result.Profiles.Count} profile(s).", "Roptimer", MessageBoxButton.OK, MessageBoxImage.Information);
        }
        catch (Exception ex)
        {
            MessageBox.Show(ex.Message, "Apply failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void Restore_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Restore managed FastFlags from the saved state?", "Roptimer", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;
        var result = AppState.Instance.Restore();
        MessageBox.Show($"Restored {result.ProfileCount} profile(s).", "Roptimer", MessageBoxButton.OK, MessageBoxImage.Information);
    }

    private void RefreshPreview_Click(object sender, RoutedEventArgs e) => RefreshPreview();

    private void CopyCommand_Click(object sender, RoutedEventArgs e)
    {
        Clipboard.SetText(CommandBox.Text);
        AppState.Instance.Emit("Boost CLI command copied.");
    }
}
