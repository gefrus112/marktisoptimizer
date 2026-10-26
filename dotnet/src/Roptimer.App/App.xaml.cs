using System.Windows;

namespace Roptimer.App;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        ThemeService.Apply(AppState.Instance.Settings.Theme);
    }
}
