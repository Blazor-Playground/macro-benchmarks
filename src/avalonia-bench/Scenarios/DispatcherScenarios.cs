using System.Diagnostics;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Threading;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Dispatcher queue throughput: posts batches of 1000 jobs at mixed priorities
/// (Normal/Input/Background) and awaits a Background job queued after them, so each batch is fully
/// drained by the browser dispatcher loop before the next. Reports jobs per second.
/// </summary>
public sealed class DispatcherPostScenario : BenchScenario
{
    private const int BatchSize = 1000;

    private static readonly DispatcherPriority[] s_priorities =
        [DispatcherPriority.Normal, DispatcherPriority.Input, DispatcherPriority.Background];

    private int _counter;

    public override string Name => "dispatcher-post";

    public override ScenarioKind Kind => ScenarioKind.Async;

    public override Control CreateView() => Placeholder(Name);

    public override async Task<double> RunSampleAsync(double durationMs)
    {
        var dispatcher = Dispatcher.UIThread;
        var stopwatch = Stopwatch.StartNew();
        long jobs = 0;
        while (stopwatch.Elapsed.TotalMilliseconds < durationMs)
        {
            for (var i = 0; i < BatchSize; i++)
            {
                dispatcher.Post(Work, s_priorities[i % s_priorities.Length]);
            }
            await dispatcher.InvokeAsync(static () => { }, DispatcherPriority.Background);
            jobs += BatchSize;
        }
        return jobs / stopwatch.Elapsed.TotalSeconds;
    }

    private void Work() => _counter++;
}

/// <summary>
/// Dispatcher round-trips: chained <c>await Dispatcher.UIThread.InvokeAsync(...)</c> calls, each
/// queuing one job and resuming after it ran (DispatcherOperation + continuation cost). Reports
/// round-trips per second.
/// </summary>
public sealed class DispatcherInvokeAsyncScenario : BenchScenario
{
    private int _counter;

    public override string Name => "dispatcher-invoke-async";

    public override ScenarioKind Kind => ScenarioKind.Async;

    public override Control CreateView() => Placeholder(Name);

    public override async Task<double> RunSampleAsync(double durationMs)
    {
        var dispatcher = Dispatcher.UIThread;
        var stopwatch = Stopwatch.StartNew();
        long jobs = 0;
        while (stopwatch.Elapsed.TotalMilliseconds < durationMs)
        {
            for (var i = 0; i < 100; i++)
            {
                await dispatcher.InvokeAsync(Work, i % 2 == 0 ? DispatcherPriority.Normal : DispatcherPriority.Background);
            }
            jobs += 100;
        }
        return jobs / stopwatch.Elapsed.TotalSeconds;
    }

    private void Work() => _counter++;
}
