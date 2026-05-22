using System.Collections.Concurrent;
using System.Diagnostics.Tracing;

namespace BlazorPerf;

/// <summary>
/// Listens to .NET EventCounters (System.Runtime, Microsoft.AspNetCore.Hosting, Kestrel)
/// and exposes a snapshot of current counter values via <see cref="GetSnapshot"/>.
/// </summary>
public sealed class EventCounterCollector : EventListener
{
    private readonly ConcurrentDictionary<string, double> _counters = new();

    private static readonly string[] Sources =
    [
        "System.Runtime",
        "Microsoft.AspNetCore.Hosting",
        "Microsoft-AspNetCore-Server-Kestrel",
    ];

    protected override void OnEventSourceCreated(EventSource eventSource)
    {
        if (Sources.Contains(eventSource.Name))
        {
            EnableEvents(eventSource, EventLevel.LogAlways, EventKeywords.All,
                new Dictionary<string, string?> { ["EventCounterIntervalSec"] = "1" });
        }
    }

    protected override void OnEventWritten(EventWrittenEventArgs eventData)
    {
        if (eventData.EventName != "EventCounters" || eventData.Payload == null)
            return;

        foreach (var item in eventData.Payload)
        {
            if (item is not IDictionary<string, object> data)
                continue;

            if (!data.TryGetValue("Name", out var nameObj) || nameObj is not string name)
                continue;

            // EventCounters report either "Mean" (for rate counters) or "Increment" (for cumulative)
            double value;
            if (data.TryGetValue("Mean", out var meanObj) && meanObj is double mean)
                value = mean;
            else if (data.TryGetValue("Increment", out var incObj) && incObj is double inc)
                value = inc;
            else
                continue;

            // Prefix with source name for disambiguation
            var source = data.TryGetValue("DisplayName", out _)
                ? eventData.EventSource?.Name ?? ""
                : "";
            var key = source != "" ? $"{source}/{name}" : name;
            _counters[key] = value;
        }
    }

    /// <summary>
    /// Returns a snapshot of all current counter values.
    /// Rate counters show the last 1-second sample; cumulative counters show the last increment.
    /// </summary>
    public Dictionary<string, double> GetSnapshot()
    {
        return new Dictionary<string, double>(_counters);
    }

    /// <summary>
    /// Resets all accumulated counter values to zero (for delta measurement).
    /// </summary>
    public void Reset()
    {
        _counters.Clear();
    }
}
