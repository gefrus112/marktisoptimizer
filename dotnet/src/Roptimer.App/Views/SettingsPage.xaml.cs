using System.Diagnostics;
using System.Windows;
using System.Windows.Controls;
using Roptimer.Core.Services;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class SettingsPage : Page
{
    private bool _loading;

    public SettingsPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e)
    {
        SyncFromSettings();
        RefreshFeatures();
    }

    private void SyncFromSettings()
    {
        _loading = true;
        var settings = AppState.Instance.Settings;
        ThemeCombo.SelectedItem = ThemeCombo.Items.OfType<ComboBoxItem>().FirstOrDefault(item => string.Equals(item.Content?.ToString(), settings.Theme, StringComparison.OrdinalIgnoreCase)) ?? (ComboBoxItem)ThemeCombo.Items[0];
        BrightUiCheck.IsChecked = settings.BrightUi;
        NotificationsCheck.IsChecked = settings.Notifications;
        AllVersionsCheck.IsChecked = settings.AllVersions;
        LegacyFpsCheck.IsChecked = settings.LegacyFpsFlag;
        LaunchAfterApplyCheck.IsChecked = settings.LaunchAfterApply;
        CacheDaysSlider.Value = settings.CacheCleanupDays;
        CacheDaysLabel.Text = $"{settings.CacheCleanupDays} days";
        SettingsPathBox.Text = AppState.Instance.Store.Path;
        _loading = false;
    }

    private void SyncToSettings()
    {
        if (_loading)
            return;
        var settings = AppState.Instance.Settings;
        settings.Theme = (ThemeCombo.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "Lumina";
        settings.BrightUi = BrightUiCheck.IsChecked == true;
        settings.Notifications = NotificationsCheck.IsChecked == true;
        settings.AllVersions = AllVersionsCheck.IsChecked == true;
        settings.LegacyFpsFlag = LegacyFpsCheck.IsChecked == true;
        settings.LaunchAfterApply = LaunchAfterApplyCheck.IsChecked == true;
        settings.CacheCleanupDays = (int)CacheDaysSlider.Value;
        settings.Normalize();
        CacheDaysLabel.Text = $"{settings.CacheCleanupDays} days";
        ThemeService.Apply(settings.Theme);
    }

    private void RefreshFeatures() =>
        FeatureGrid.ItemsSource = AppState.Instance.Features.Document.Features.Select(f => new FeatureRow
        {
            Name = f.Name,
            Status = f.Status,
            Safety = f.Safe ? "Safe" : "Rejected",
            Flag = f.Flag ?? "safety boundary",
            Details = f.Details
        }).ToList();

    private void SettingsChangedClick(object sender, RoutedEventArgs e) => SyncToSettings();
    private void SettingsChangedValue(object sender, RoutedPropertyChangedEventArgs<double> e) => SyncToSettings();

    private void ThemeCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        SyncToSettings();
        AppState.Instance.Emit($"Theme set to {AppState.Instance.Settings.Theme}.");
    }

    private void ReportCache_Click(object sender, RoutedEventArgs e)
    {
        SyncToSettings();
        var report = AppState.Instance.Cache.Report(AppState.Instance.Settings.CacheCleanupDays);
        CacheReportBox.Text = Json.Serialize(new
        {
            olderThanDays = report.OlderThanDays,
            candidates = report.Items.Count,
            megabytes = Math.Round(report.TotalBytes / 1_048_576d, 2),
            errors = report.Errors,
            note = "Dry run only. No ClientAppSettings, executables, or game assets are included."
        });
        AppState.Instance.Emit($"Found {report.Items.Count} old log/temp cache candidates.");
    }

    private void CleanCache_Click(object sender, RoutedEventArgs e)
    {
        SyncToSettings();
        var days = AppState.Instance.Settings.CacheCleanupDays;
        if (MessageBox.Show($"Move log/temp cache files older than {days} days to quarantine?", "Roptimer", MessageBoxButton.YesNo, MessageBoxImage.Question) != MessageBoxResult.Yes)
            return;
        var report = AppState.Instance.Cache.Report(days);
        var result = AppState.Instance.Cache.Clean(report, true);
        CacheReportBox.Text = Json.Serialize(new
        {
            result.MovedFiles,
            megabytes = Math.Round(result.MovedBytes / 1_048_576d, 2),
            result.QuarantinePath,
            result.Errors
        });
        AppState.Instance.Emit($"Quarantined {result.MovedFiles} old cache files.");
    }

    private void Save_Click(object sender, RoutedEventArgs e)
    {
        SyncToSettings();
        AppState.Instance.Save();
    }

    private void OpenFolder_Click(object sender, RoutedEventArgs e)
    {
        var folder = AppState.Instance.Locator.StateRoot;
        Directory.CreateDirectory(folder);
        Process.Start(new ProcessStartInfo(folder) { UseShellExecute = true });
    }

    private void Reset_Click(object sender, RoutedEventArgs e)
    {
        if (MessageBox.Show("Reset all settings to safe defaults?", "Roptimer", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes)
            return;
        AppState.Instance.Reset();
        SyncFromSettings();
    }
}
