using System.Runtime.InteropServices.JavaScript;

namespace AvaloniaBench.Interop;

internal static partial class BenchInterop
{
    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();

    [JSImport("bench.setFirstFrameRendered", "main.mjs")]
    internal static partial void SetFirstFrameRendered();

    /// <summary>Tells the JS input driver that an input scenario sample has completed.</summary>
    [JSImport("bench.scenarioSignal", "main.mjs")]
    internal static partial void ScenarioSignal(string name, double value);
}
