namespace Roptimer.Core.Services;

/// <summary>
/// Loads the canonical, grouped Roblox local FastFlag allowlist that is embedded
/// in Roptimer.Core. The file is generated from the repository root
/// fastflags-allowlist.json by build_downloads.py.
/// </summary>
public sealed class FastFlagAllowlist
{
    private readonly string _json;

    private FastFlagAllowlist(string json, IReadOnlyList<FastFlagAllowlistGroup> groups, IReadOnlySet<string> flags)
    {
        _json = json;
        Groups = groups;
        Flags = flags;
    }

    public IReadOnlyList<FastFlagAllowlistGroup> Groups { get; }
    public IReadOnlySet<string> Flags { get; }
    public int CategoryCount => Groups.Count;
    public int FlagCount => Flags.Count;

    public string AsJson() => _json;

    public bool Contains(string flag) => Flags.Contains(flag);

    public static FastFlagAllowlist Load()
    {
        var assembly = typeof(FastFlagAllowlist).Assembly;
        using var stream = assembly.GetManifestResourceStream("Roptimer.Core.fastflags-allowlist.json")
            ?? throw new InvalidOperationException("Embedded fastflags-allowlist.json is missing.");
        using var reader = new StreamReader(stream, Encoding.UTF8);
        var json = reader.ReadToEnd();

        var groups = new List<FastFlagAllowlistGroup>();
        var flags = new HashSet<string>(StringComparer.Ordinal);

        using var document = JsonDocument.Parse(json);
        var root = document.RootElement;
        if (root.TryGetProperty("categories", out var categories) && categories.ValueKind == JsonValueKind.Array)
        {
            foreach (var category in categories.EnumerateArray())
            {
                var name = category.TryGetProperty("name", out var nameNode) ? nameNode.GetString() ?? "" : "";
                var group = new FastFlagAllowlistGroup { Name = name };
                if (category.TryGetProperty("flags", out var flagNodes) && flagNodes.ValueKind == JsonValueKind.Array)
                {
                    foreach (var flagNode in flagNodes.EnumerateArray())
                    {
                        var flag = flagNode.GetString();
                        if (string.IsNullOrWhiteSpace(flag)) continue;
                        group.Flags.Add(flag);
                        flags.Add(flag);
                    }
                }
                groups.Add(group);
            }
        }

        if (flags.Count == 0)
            throw new InvalidOperationException("Embedded fastflags-allowlist.json contained no flags.");

        return new FastFlagAllowlist(json, groups, flags);
    }
}

public sealed class FastFlagAllowlistGroup
{
    public string Name { get; set; } = "";
    public List<string> Flags { get; set; } = new();
}
