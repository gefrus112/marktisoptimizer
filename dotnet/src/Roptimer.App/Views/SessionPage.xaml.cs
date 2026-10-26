using System.Windows;
using System.Windows.Controls;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class SessionPage : Page
{
    public SessionPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e) => Refresh();

    private void Refresh()
    {
        var state = AppState.Instance;
        DisplayNameBox.Text = state.Settings.RobloxDisplayName;
        var snapshot = state.Session();
        StatePill.Text = snapshot.Running ? "ROBLOX CLIENT RUNNING" : "NO CLIENT DETECTED";
        NotificationText.Text = snapshot.Notification;
        SessionGrid.ItemsSource = snapshot.Rows().Select(row => new SessionRow { Label = row.Label, Value = row.Value }).ToList();
        PathsBox.Text = snapshot.RunningPaths.Count == 0 ? "No Roblox client paths detected." : string.Join(Environment.NewLine, snapshot.RunningPaths);
    }

    private void SaveName_Click(object sender, RoutedEventArgs e)
    {
        AppState.Instance.Settings.RobloxDisplayName = DisplayNameBox.Text;
        AppState.Instance.Save();
        Refresh();
    }

    private void Refresh_Click(object sender, RoutedEventArgs e) => Refresh();
}
