namespace Roptimer.Core.Services;

public sealed class FeatureCatalog
{
    private FeatureCatalog(FeatureCatalogDocument document) => Document = document;

    public FeatureCatalogDocument Document { get; }

    public string AsJson() => Json.Serialize(Document);

    public static FeatureCatalog Load()
    {
        var assembly = typeof(FeatureCatalog).Assembly;
        using var stream = assembly.GetManifestResourceStream("Roptimer.Core.feature-status.json")
            ?? throw new InvalidOperationException("Embedded feature-status.json is missing.");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var document = Json.Deserialize<FeatureCatalogDocument>(reader.ReadToEnd())
            ?? throw new InvalidOperationException("Could not parse feature-status.json.");
        return new FeatureCatalog(document);
    }
}
