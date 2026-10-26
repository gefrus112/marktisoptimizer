using System.Windows;
using System.Windows.Controls;
using Roptimer.App;

namespace Roptimer.App.Views;

public partial class SafetyPage : Page
{
    public SafetyPage() => InitializeComponent();

    private void Page_Loaded(object sender, RoutedEventArgs e) =>
        FeatureGrid.ItemsSource = AppState.Instance.Features.Document.Features.Select(f => new FeatureRow
        {
            Name = f.Name,
            Status = f.Status,
            Safety = f.Safe ? "Safe" : "Rejected",
            Flag = f.Flag ?? "",
            Details = f.Details
        }).ToList();
}
