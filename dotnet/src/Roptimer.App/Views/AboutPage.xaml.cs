using System.Windows;
using System.Windows.Controls;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class AboutPage : Page
{
    public AboutPage() => InitializeComponent();

    private void OpenLink_Click(object sender, RoutedEventArgs e)
    {
        if (sender is Button button && button.Tag is string url)
            AppState.Instance.Launcher.OpenUrl(url);
    }
}
