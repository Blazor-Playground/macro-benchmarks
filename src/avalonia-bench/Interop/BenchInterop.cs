using System.Runtime.InteropServices.JavaScript;

namespace AvaloniaBench.Interop;

internal static partial class BenchInterop
{
    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();

    [JSImport("bench.setContentReady", "main.mjs")]
    internal static partial void SetContentReady();

    [JSImport("bench.setFirstFrameRendered", "main.mjs")]
    internal static partial void SetFirstFrameRendered();
}
