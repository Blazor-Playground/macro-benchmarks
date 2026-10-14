using System;
using System.Reflection.Metadata;
using System.Threading;
using System.Runtime.InteropServices.JavaScript;

[assembly: MetadataUpdateHandler(typeof(MacroBenchmarks.DebugProbe.ProbeState))]

namespace MacroBenchmarks.DebugProbe;

internal static partial class ProbeState
{
    public static readonly string RuntimeId = Guid.NewGuid().ToString("N");
    public static int Generation;
    public static void UpdateApplication(Type[]? updatedTypes)
    {
        ReportApplied(Interlocked.Increment(ref Generation));
    }

    [JSImport("globalThis.debugBenchmark.applied")]
    internal static partial void ReportApplied(int generation);
}
