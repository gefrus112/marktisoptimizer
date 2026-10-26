using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using Roptimer.App.Views;

namespace Roptimer.App;

public partial class MainWindow : Window
{
    private readonly Dictionary<string, Func<Page>> _pages;
    private DispatcherTimer? _snackbarTimer;

    public MainWindow()
    {
        _pages = new Dictionary<string, Func<Page>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Dashboard"] = () => new DashboardPage(),
            ["Boost"] = () => new BoostPage(),
            ["FastFlags"] = () => new FastFlagsPage(),
            ["Allowlist"] = () => new AllowlistPage(),
            ["Session"] = () => new SessionPage(),
            ["Settings"] = () => new SettingsPage(),
            ["Safety"] = () => new SafetyPage(),
            ["About"] = () => new AboutPage()
        };
        InitializeComponent();
        AppState.Instance.StatusChanged += (_, message) => ShowSnackbar(message);
        Navigate("Dashboard");
    }

    private void NavList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (NavList?.SelectedItem is not ListBoxItem item)
            return;
        Navigate(item.Tag?.ToString() ?? "Dashboard");
    }

    private void Navigate(string key)
    {
        if (!_pages.TryGetValue(key, out var factory))
        {
            key = "Dashboard";
            factory = _pages[key];
        }
        Breadcrumb.Text = "Workspace / " + key;
        RootFrame.Navigate(factory());
        AppState.Instance.Emit($"Opened {key}.");
    }

    private void Save_Click(object sender, RoutedEventArgs e) => AppState.Instance.Save();

    private void SaveAndLaunch_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            AppState.Instance.Apply(true);
            ShowSnackbar("Applied settings and launched Roblox through roblox://.");
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "Apply failed", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void Close_Click(object sender, RoutedEventArgs e) => Close();

    private void ShowSnackbar(string message)
    {
        Dispatcher.Invoke(() =>
        {
            StatusText.Text = message;
            SnackbarText.Text = message;
            Snackbar.Visibility = Visibility.Visible;
            _snackbarTimer?.Stop();
            _snackbarTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(4) };
            _snackbarTimer.Tick += (_, _) =>
            {
                _snackbarTimer?.Stop();
                Snackbar.Visibility = Visibility.Collapsed;
            };
            _snackbarTimer.Start();
        });
    }
}
