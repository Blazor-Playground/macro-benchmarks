using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Layout;

namespace AvaloniaBench.Scenarios;

public enum ScenarioKind
{
    /// <summary>JS calls <see cref="BenchScenario.RunIteration"/> in a tight loop; reported as ops/sec.</summary>
    Managed,

    /// <summary>JS dispatches real DOM events; the scenario signals completion; reported as ms.</summary>
    Input,

    /// <summary>
    /// The scenario animates for a fixed duration while Avalonia render ticks are counted
    /// (<see cref="BenchScenario.OnFrame"/> runs on every tick); reported as frames per second.
    /// </summary>
    Frames,

    /// <summary>
    /// The scenario runs one sample itself via <see cref="BenchScenario.RunSampleAsync"/> (for work
    /// that must yield to the dispatcher/browser event loop); reported as the returned value.
    /// </summary>
    Async,
}

public abstract class BenchScenario
{
    /// <summary>Scenario name, shared with the JS driver in wwwroot/main.mjs.</summary>
    public abstract string Name { get; }

    public abstract ScenarioKind Kind { get; }

    /// <summary>Creates the view hosted by <see cref="BenchHost"/> while the scenario runs.</summary>
    public abstract Control CreateView();

    /// <summary>Called once the view is attached and rendered (e.g. to start animations).</summary>
    public virtual void Start()
    {
    }

    /// <summary>Called when the scenario is cleared (e.g. to cancel animations).</summary>
    public virtual void Stop()
    {
    }

    /// <summary>One iteration of a managed scenario; returns the number of operations performed (for ops/sec).</summary>
    public virtual int RunIteration()
        => throw new NotSupportedException($"Scenario '{Name}' is not a managed scenario");

    /// <summary>One sample of an async scenario lasting about <paramref name="durationMs"/>; returns ops/sec.</summary>
    public virtual Task<double> RunSampleAsync(double durationMs)
        => throw new NotSupportedException($"Scenario '{Name}' is not an async scenario");

    /// <summary>Simple view for scenarios that don't need visuals of their own.</summary>
    protected static Control Placeholder(string text) => new TextBlock
    {
        Text = text,
        HorizontalAlignment = HorizontalAlignment.Center,
        VerticalAlignment = VerticalAlignment.Center,
    };

    /// <summary>Called before each input sample with a driver-specific <paramref name="parameter"/>.</summary>
    public virtual void BeginSample(double parameter)
        => throw new NotSupportedException($"Scenario '{Name}' is not an input scenario");

    /// <summary>Called on every render tick of a frames scenario; <paramref name="elapsed"/> is time since the sample started.</summary>
    public virtual void OnFrame(TimeSpan elapsed)
    {
    }
}
