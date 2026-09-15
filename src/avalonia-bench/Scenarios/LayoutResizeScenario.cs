using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Layout stress: every frame resizes ~1200 leaf Borders inside nested StackPanels, so each tick
/// invalidates measure on all leaves and runs a full measure/arrange cascade.
/// </summary>
public sealed class LayoutResizeScenario : BenchScenario
{
    private const int Columns = 40;
    private const int Rows = 30;

    private static readonly IBrush[] s_brushes =
        [Brushes.SteelBlue, Brushes.IndianRed, Brushes.SeaGreen, Brushes.Goldenrod, Brushes.MediumPurple];

    private readonly List<Border> _leaves = new(Columns * Rows);

    public override string Name => "fps-layout-resize";

    public override ScenarioKind Kind => ScenarioKind.Frames;

    public override Control CreateView()
    {
        _leaves.Clear();
        var root = new StackPanel { Orientation = Orientation.Horizontal };
        for (var c = 0; c < Columns; c++)
        {
            var column = new StackPanel { Margin = new Thickness(1) };
            for (var r = 0; r < Rows; r++)
            {
                var leaf = new Border
                {
                    Width = 20,
                    Height = 10,
                    Margin = new Thickness(1),
                    Background = s_brushes[(c + r) % s_brushes.Length],
                };
                _leaves.Add(leaf);
                column.Children.Add(leaf);
            }
            root.Children.Add(column);
        }
        return root;
    }

    public override void OnFrame(TimeSpan elapsed)
    {
        var t = elapsed.TotalSeconds;
        for (var i = 0; i < _leaves.Count; i++)
        {
            var leaf = _leaves[i];
            leaf.Width = 14 + 8 * Math.Sin(t * 4 + i * 0.1);
            leaf.Height = 8 + 5 * Math.Sin(t * 3 + i * 0.07);
        }
    }

    public override void Stop() => _leaves.Clear();
}
