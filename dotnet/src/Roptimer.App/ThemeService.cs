using System.Windows;
using System.Windows.Media;

namespace Roptimer.App;

public static class ThemeService
{
    public static void Apply(string theme)
    {
        var resources = Application.Current?.Resources;
        if (resources is null)
            return;
        var palettes = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["Lumina"] = new()
            {
                ["AccentBrush"] = "#7C5CFF",
                ["Accent2Brush"] = "#22D3EE",
                ["GlowBrush"] = "#8B5CF6",
                ["AppBackgroundBrush"] = "#070A14",
                ["PanelBrush"] = "#0D1222",
                ["CardBrush"] = "#131A2F",
                ["FieldBrush"] = "#0A0F1E",
                ["BorderBrush"] = "#2A3358",
                ["TextBrush"] = "#F3F6FF",
                ["MutedBrush"] = "#A7B0D0",
                ["InfoBrush"] = "#38BDF8",
                ["WarningBrush"] = "#FBBF24",
                ["DangerBrush"] = "#FB7185"
            },
            ["Midnight"] = new()
            {
                ["AccentBrush"] = "#6366F1",
                ["Accent2Brush"] = "#818CF8",
                ["GlowBrush"] = "#4F46E5",
                ["AppBackgroundBrush"] = "#050713",
                ["PanelBrush"] = "#0A0D1C",
                ["CardBrush"] = "#10152B",
                ["FieldBrush"] = "#080B18",
                ["BorderBrush"] = "#252C52",
                ["TextBrush"] = "#EEF2FF",
                ["MutedBrush"] = "#A5B4FC",
                ["InfoBrush"] = "#60A5FA",
                ["WarningBrush"] = "#FBBF24",
                ["DangerBrush"] = "#FB7185"
            },
            ["Frost"] = new()
            {
                ["AccentBrush"] = "#0EA5E9",
                ["Accent2Brush"] = "#67E8F9",
                ["GlowBrush"] = "#22D3EE",
                ["AppBackgroundBrush"] = "#06101C",
                ["PanelBrush"] = "#0A1726",
                ["CardBrush"] = "#0F2033",
                ["FieldBrush"] = "#08131F",
                ["BorderBrush"] = "#1E405B",
                ["TextBrush"] = "#ECFEFF",
                ["MutedBrush"] = "#A5F3FC",
                ["InfoBrush"] = "#38BDF8",
                ["WarningBrush"] = "#FBBF24",
                ["DangerBrush"] = "#FB7185"
            }
        };
        if (!palettes.TryGetValue(theme, out var palette))
            palette = palettes["Lumina"];
        foreach (var pair in palette)
        {
            var converted = ColorConverter.ConvertFromString(pair.Value);
            var color = converted is Color parsed ? parsed : Colors.White;
            var brush = new SolidColorBrush(color);
            brush.Freeze();
            resources[pair.Key] = brush;
        }
    }
}
