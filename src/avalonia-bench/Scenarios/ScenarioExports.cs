using System;
using System.Diagnostics;
using System.Linq;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;
using Avalonia.Controls;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// JS-facing scenario API, consumed by globalThis.avaloniaBench in wwwroot/main.mjs.
/// </summary>
public static partial class ScenarioExports
{
    private static BenchScenario? s_active;

    private static BenchScenario Active
        => s_active ?? throw new InvalidOperationException("No scenario prepared");

    /// <summary>Returns "name:kind" pairs separated by ';' (kind is "managed", "input", "frames" or "async").</summary>
    [JSExport]
    public static string ListScenarios()
        => string.Join(';', ScenarioRegistry.All.Select(s => $"{s.Name}:{s.Kind.ToString().ToLowerInvariant()}"));

    [JSExport]
    public static async Task PrepareScenario(string name)
    {
        var host = BenchHost.Current ?? throw new InvalidOperationException("BenchHost is not created yet");
        s_active = ScenarioRegistry.Get(name);
        host.SetContent(s_active.CreateView());
        await host.WaitForFramesAsync(2);
        s_active.Start();
    }

    /// <summary>Runs one managed iteration; returns the number of operations it performed.</summary>
    [JSExport]
    public static int RunManagedIteration() => Active.RunIteration();

    [JSExport]
    [return: JSMarshalAs<JSType.Promise<JSType.Number>>]
    public static Task<double> RunAsyncSample(double durationMs) => Active.RunSampleAsync(durationMs);

    [JSExport]
    public static void BeginInputSample(double parameter) => Active.BeginSample(parameter);

    /// <summary>Runs a frames scenario for <paramref name="durationMs"/> and returns the render ticks per second.</summary>
    [JSExport]
    [return: JSMarshalAs<JSType.Promise<JSType.Number>>]
    public static Task<double> RunFrameSample(double durationMs)
    {
        var scenario = Active;
        var topLevel = TopLevel.GetTopLevel(BenchHost.Current)
            ?? throw new InvalidOperationException("BenchHost is not attached to a TopLevel");
        var tcs = new TaskCompletionSource<double>();
        var stopwatch = Stopwatch.StartNew();
        var frames = 0;

        void OnFrame(TimeSpan _)
        {
            var elapsed = stopwatch.Elapsed;
            if (elapsed.TotalMilliseconds >= durationMs)
            {
                tcs.TrySetResult(frames / elapsed.TotalSeconds);
                return;
            }
            frames++;
            try
            {
                scenario.OnFrame(elapsed);
            }
            catch (Exception e)
            {
                tcs.TrySetException(e);
                return;
            }
            topLevel.RequestAnimationFrame(OnFrame);
        }

        topLevel.RequestAnimationFrame(OnFrame);
        return tcs.Task;
    }

    [JSExport]
    public static void ClearScenario()
    {
        s_active?.Stop();
        s_active = null;
        BenchHost.Current?.SetContent(null);
    }
}
