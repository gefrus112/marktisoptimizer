namespace Roptimer.Core.Services;

public sealed class FastFlagService
{
    public const string LegacyFpsFlag = "DFIntTaskSchedulerTargetFps";

    public static readonly IReadOnlySet<string> AllowlistedManagedFlags = new HashSet<string>(StringComparer.Ordinal)
    {
        "DFIntCSGLevelOfDetailSwitchingDistance",
        "DFIntCSGLevelOfDetailSwitchingDistanceL12",
        "DFIntCSGLevelOfDetailSwitchingDistanceL23",
        "DFIntCSGLevelOfDetailSwitchingDistanceL34",
        "FFlagHandleAltEnterFullscreenManually",
        "DFFlagTextureQualityOverrideEnabled",
        "DFIntTextureQualityOverride",
        "FIntDebugForceMSAASamples",
        "DFFlagDisableDPIScale",
        "FFlagDebugGraphicsPreferD3D11",
        "FFlagDebugSkyGray",
        "DFFlagDebugPauseVoxelizer",
        "DFIntDebugFRMQualityLevelOverride",
        "FIntFRMMaxGrassDistance",
        "FIntFRMMinGrassDistance",
        "FFlagDebugGraphicsPreferVulkan",
        "FFlagDebugGraphicsPreferOpenGL",
        "FIntGrassMovementReducedMotionFactor"
    };

    public static readonly IReadOnlySet<string> ManagedFlags =
        new HashSet<string>(AllowlistedManagedFlags.Append(LegacyFpsFlag), StringComparer.Ordinal);

    private readonly RobloxLocator _locator;
    private readonly LaunchService _launcher;

    public FastFlagService(RobloxLocator locator, LaunchService? launcher = null)
    {
        _locator = locator;
        _launcher = launcher ?? new LaunchService();
    }

    public string Preview(AppSettings settings) => Json.Serialize(BuildFlags(settings));

    public Dictionary<string, string> BuildFlags(AppSettings settings)
    {
        settings.Normalize();
        var flags = new Dictionary<string, string>(StringComparer.Ordinal);

        if (settings.LegacyFpsFlag)
            flags[LegacyFpsFlag] = settings.FpsTarget.ToString(CultureInfo.InvariantCulture);

        var mode = settings.OptimizationMode;
        var lod = mode switch
        {
            "Reduce building lag" or "Maximum performance" => ("25", "15", "20", "30"),
            "Balanced" => ("2000", "1000", "1500", "2500"),
            "Visual quality" => ("10000", "10000", "10000", "10000"),
            _ => ("100", "75", "100", "150")
        };
        if (settings.BuildingLagReducer)
            lod = ("25", "15", "20", "30");

        if (settings.OptimizeRendering || settings.BuildingLagReducer)
        {
            flags["DFIntCSGLevelOfDetailSwitchingDistance"] = lod.Item1;
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL12"] = lod.Item2;
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL23"] = lod.Item3;
            flags["DFIntCSGLevelOfDetailSwitchingDistanceL34"] = lod.Item4;
            flags["DFFlagDebugPauseVoxelizer"] = "True";
            flags["FFlagHandleAltEnterFullscreenManually"] = "True";
        }

        // 0-21 extended graphics tiers. 0 is automatic, 1-6 are low, 7-21 are high/legacy micro levels.
        flags["DFIntDebugFRMQualityLevelOverride"] = settings.GraphicsTier.ToString(CultureInfo.InvariantCulture);

        // Texture tiers 0-3. VFX reducer clamps texture and anti-aliasing without changing the chosen FRM tier.
        flags["DFFlagTextureQualityOverrideEnabled"] = "True";
        flags["DFIntTextureQualityOverride"] = settings.VfxReducer
            ? Math.Min(settings.TextureTier, 1).ToString(CultureInfo.InvariantCulture)
            : settings.TextureTier.ToString(CultureInfo.InvariantCulture);
        flags["FIntDebugForceMSAASamples"] = settings.VfxReducer ? "1" : "2";
        flags["FIntGrassMovementReducedMotionFactor"] = settings.VfxReducer ? "0" : "50";

        if (settings.BuildingLagReducer)
        {
            flags["FIntFRMMaxGrassDistance"] = "0";
            flags["FIntFRMMinGrassDistance"] = "0";
            flags["FIntDebugForceMSAASamples"] = "1";
            flags["FIntGrassMovementReducedMotionFactor"] = "0";
        }

        var unknown = flags.Keys.Where(key => !ManagedFlags.Contains(key)).ToList();
        if (unknown.Count > 0)
            throw new InvalidOperationException("Refusing to write unmanaged flags: " + string.Join(", ", unknown));
        return flags.OrderBy(pair => pair.Key, StringComparer.Ordinal)
            .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.Ordinal);
    }

    public ApplyResult Apply(AppSettings settings, bool launch = false)
    {
        settings.Normalize();
        var flags = BuildFlags(settings);
        var versions = _locator.DiscoverVersions(settings.CustomRoot);
        var paths = _locator.ResolveProfilePaths(settings, versions);
        if (paths.Count == 0)
            throw new InvalidOperationException("No safe Roblox ClientSettings paths were found.");

        var state = LoadState();
        var backups = new List<string>();
        var stamp = DateTimeOffset.UtcNow;
        foreach (var path in paths)
        {
            var existing = ReadJsonObject(path);
            var original = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var key in ManagedFlags)
            {
                if (existing.TryGetPropertyValue(key, out var node) && node is not null)
                    original[key] = NodeToString(node);
                existing.Remove(key);
            }
            foreach (var pair in flags)
                existing[pair.Key] = JsonValue.Create(pair.Value);

            var backup = "";
            var existed = File.Exists(path);
            if (existed)
            {
                backup = BackupPath(path, stamp);
                File.Copy(path, backup, true);
                backups.Add(backup);
            }
            SettingsStore.AtomicWrite(path, existing.ToJsonString(Json.NodeOptions));
            state.Profiles[path] = new ProfileState
            {
                OriginalManagedFlags = original,
                Backup = backup,
                Existed = existed
            };
        }
        SaveState(state);
        settings.LastAppliedUtc = stamp;
        if (launch)
            _launcher.LaunchRoblox();
        return new ApplyResult(flags.Count, paths, backups, stamp);
    }

    public RestoreResult Restore()
    {
        var state = LoadState();
        var restored = new List<string>();
        foreach (var pair in state.Profiles)
        {
            var path = pair.Key;
            if (!_locator.IsSafeProfilePath(path))
                continue;
            if (!File.Exists(path))
                continue;
            var current = ReadJsonObject(path);
            var backup = BackupPath(path, DateTimeOffset.UtcNow);
            File.Copy(path, backup, true);
            foreach (var key in ManagedFlags)
                current.Remove(key);
            foreach (var original in pair.Value.OriginalManagedFlags)
                if (ManagedFlags.Contains(original.Key))
                    current[original.Key] = JsonValue.Create(original.Value);
            SettingsStore.AtomicWrite(path, current.ToJsonString(Json.NodeOptions));
            restored.Add(path);
        }
        SaveState(new ApplyState());
        return new RestoreResult(restored.Count, restored);
    }

    private ApplyState LoadState()
    {
        try
        {
            if (!File.Exists(_locator.StatePath))
                return new ApplyState();
            return Json.Deserialize<ApplyState>(File.ReadAllText(_locator.StatePath, Encoding.UTF8)) ?? new ApplyState();
        }
        catch { return new ApplyState(); }
    }

    private void SaveState(ApplyState state) =>
        SettingsStore.AtomicWrite(_locator.StatePath, Json.Serialize(state));

    private static JsonObject ReadJsonObject(string path)
    {
        if (!File.Exists(path))
            return new JsonObject();
        try
        {
            var text = File.ReadAllText(path, Encoding.UTF8);
            return JsonNode.Parse(text) as JsonObject ?? new JsonObject();
        }
        catch { return new JsonObject(); }
    }

    private static string NodeToString(JsonNode node)
    {
        try
        {
            using var document = JsonDocument.Parse(node.ToJsonString());
            var root = document.RootElement;
            return root.ValueKind == JsonValueKind.String ? root.GetString() ?? "" : root.GetRawText();
        }
        catch { return node.ToJsonString(); }
    }

    private static string BackupPath(string path, DateTimeOffset stamp) =>
        path + ".bak-" + stamp.ToString("yyyyMMdd-HHmmss", CultureInfo.InvariantCulture) + "-" + Guid.NewGuid().ToString("N")[..6];

    public sealed class ApplyState
    {
        public Dictionary<string, ProfileState> Profiles { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    }

    public sealed class ProfileState
    {
        public Dictionary<string, string> OriginalManagedFlags { get; set; } = new(StringComparer.Ordinal);
        public string Backup { get; set; } = "";
        public bool Existed { get; set; }
    }
}
