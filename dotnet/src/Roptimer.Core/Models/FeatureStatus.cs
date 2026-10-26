namespace Roptimer.Core.Models;

public sealed class FeatureCatalogDocument
{
    [JsonPropertyName("product")]
    public string Product { get; set; } = "Roptimer Hub V3";

    [JsonPropertyName("version")]
    public string Version { get; set; } = "3.0.0";

    [JsonPropertyName("platform")]
    public string Platform { get; set; } = ".NET 8 / WPF / Windows 10+";

    [JsonPropertyName("safety")]
    public Dictionary<string, bool> Safety { get; set; } = new();

    [JsonPropertyName("features")]
    public List<FeatureStatus> Features { get; set; } = new();

    [JsonPropertyName("sources")]
    public List<SourceInfo> Sources { get; set; } = new();
}

public sealed class FeatureStatus
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("status")]
    public string Status { get; set; } = "";

    [JsonPropertyName("implemented")]
    public bool Implemented { get; set; }

    [JsonPropertyName("safe")]
    public bool Safe { get; set; }

    [JsonPropertyName("flag")]
    public string? Flag { get; set; }

    [JsonPropertyName("details")]
    public string Details { get; set; } = "";
}

public sealed class SourceInfo
{
    [JsonPropertyName("title")]
    public string Title { get; set; } = "";

    [JsonPropertyName("url")]
    public string Url { get; set; } = "";
}
