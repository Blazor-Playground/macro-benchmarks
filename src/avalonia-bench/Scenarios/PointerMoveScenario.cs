using Avalonia.Controls;
using Avalonia.Media;
using AvaloniaBench.Interop;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Input example: JS dispatches pointermove DOM events with strictly increasing X, ending at a known
/// final X. Avalonia may merge consecutive moves, so completion is detected by position rather than
/// by counting events.
/// </summary>
public sealed class PointerMoveScenario : BenchScenario
{
    private double _finalX = double.NaN;
    private int _received;

    public override string Name => "pointer-move";

    public override ScenarioKind Kind => ScenarioKind.Input;

    public override Control CreateView()
    {
        // A background is required for hit testing.
        var target = new Border { Background = Brushes.LightSteelBlue };
        target.PointerMoved += (_, e) =>
        {
            if (double.IsNaN(_finalX))
                return;
            _received++;
            if (e.GetPosition(target).X >= _finalX - 0.5)
            {
                _finalX = double.NaN;
                BenchInterop.ScenarioSignal(Name, _received);
            }
        };
        return target;
    }

    /// <param name="parameter">X position (DIPs, relative to the view) of the last dispatched move.</param>
    public override void BeginSample(double parameter)
    {
        _received = 0;
        _finalX = parameter;
    }
}
