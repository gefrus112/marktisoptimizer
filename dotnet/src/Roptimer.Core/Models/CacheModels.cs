namespace Roptimer.Core.Models;

public sealed class CacheItem
{
    public string Path { get; init; } = "";
    public long Bytes { get; init; }
    public DateTimeOffset LastWriteUtc { get; init; }
    public int AgeDays { get; init; }
    public string Root { get; init; } = "";
}

public sealed class CacheReport
{
    public int OlderThanDays { get; init; }
    public IReadOnlyList<CacheItem> Items { get; init; } = Array.Empty<CacheItem>();
    public long TotalBytes { get; init; }
    public IReadOnlyList<string> Errors { get; init; } = Array.Empty<string>();
}

public sealed record CacheCleanResult(
    bool DryRun,
    int MovedFiles,
    long MovedBytes,
    string QuarantinePath,
    IReadOnlyList<string> Errors);
