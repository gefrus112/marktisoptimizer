namespace Roptimer.Core.Services;

public static class Json
{
    public static readonly JsonSerializerOptions Options = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull
    };

    // Used for JsonObject payloads such as ClientAppSettings.json, where the
    // dictionary keys are FastFlag names and must never be camel-cased.
    public static readonly JsonSerializerOptions NodeOptions = new()
    {
        WriteIndented = true
    };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    public static T? Deserialize<T>(string text) => JsonSerializer.Deserialize<T>(text, Options);
}
