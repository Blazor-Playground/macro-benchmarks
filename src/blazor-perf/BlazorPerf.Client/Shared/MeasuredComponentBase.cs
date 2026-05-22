using System.Diagnostics;
using Microsoft.AspNetCore.Components;
using Microsoft.JSInterop;

namespace BlazorPerf.Client.Shared;

/// <summary>
/// Base class for benchmark pages that measures render throughput.
/// Subclasses call RunMeasurementLoop to count renders/sec over a duration window.
/// </summary>
public abstract class MeasuredComponentBase : ComponentBase, IAsyncDisposable
{
    [Inject] protected IJSRuntime JS { get; set; } = default!;

    private TaskCompletionSource? _renderTcs;
    private DotNetObjectReference<MeasuredComponentBase>? _dotNetRef;

    protected override async Task OnAfterRenderAsync(bool firstRender)
    {
        if (firstRender)
        {
            _dotNetRef = DotNetObjectReference.Create(this);
            await JS.InvokeVoidAsync("blazorPerf.setBenchComponent", _dotNetRef);
        }
        _renderTcs?.TrySetResult();
    }

    /// <summary>
    /// Triggers StateHasChanged and waits for the render to complete.
    /// </summary>
    protected Task WaitForRender()
    {
        _renderTcs = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
        StateHasChanged();
        return _renderTcs.Task;
    }

    /// <summary>
    /// Called from JS via JSInterop. Runs the benchmark loop for the given duration.
    /// Subclasses must override MutateState() to change component state before each render.
    /// </summary>
    [JSInvokable]
    public async Task<double> RunBenchmark(int durationMs)
    {
        // Warmup: 3 renders discarded
        for (int i = 0; i < 3; i++)
        {
            MutateState();
            await WaitForRender();
        }

        var count = 0;
        var sw = Stopwatch.StartNew();
        while (sw.ElapsedMilliseconds < durationMs)
        {
            MutateState();
            await WaitForRender();
            count++;
        }
        sw.Stop();

        return count * 1000.0 / sw.ElapsedMilliseconds;
    }

    /// <summary>
    /// Override to change component state before each render cycle.
    /// </summary>
    protected abstract void MutateState();

    public ValueTask DisposeAsync()
    {
        _dotNetRef?.Dispose();
        return ValueTask.CompletedTask;
    }
}
