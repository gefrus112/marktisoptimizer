namespace Roptimer.App.Views;

public sealed class FlagRow
{
    public string Flag { get; set; } = "";
    public string Value { get; set; } = "";
    public string Status { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class AllowlistRow
{
    public string Category { get; set; } = "";
    public string Flag { get; set; } = "";
    public string Status { get; set; } = "";
    public string Notes { get; set; } = "";
}

public sealed class FeatureRow
{
    public string Name { get; set; } = "";
    public string Status { get; set; } = "";
    public string Safety { get; set; } = "";
    public string Flag { get; set; } = "";
    public string Details { get; set; } = "";
}

public sealed class SessionRow
{
    public string Label { get; set; } = "";
    public string Value { get; set; } = "";
}
