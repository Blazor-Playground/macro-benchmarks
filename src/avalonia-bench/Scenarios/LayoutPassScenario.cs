using Avalonia.Controls;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Managed example: invalidate measure on ~200 TextBlocks and run a synchronous layout pass.
/// </summary>
public sealed class LayoutPassScenario : BenchScenario
{
    private const int ItemCount = 200;
    private StackPanel? _panel;

    public override string Name => "layout-pass";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _panel = new StackPanel();
        for (var i = 0; i < ItemCount; i++)
        {
            _panel.Children.Add(new TextBlock { Text = $"Item {i}" });
        }
        return _panel;
    }

    public override int RunIteration()
    {
        foreach (var child in _panel!.Children)
        {
            child.InvalidateMeasure();
        }
        _panel.UpdateLayout();
        return 1;
    }
}
