using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Visual tree stress: a WrapPanel of ~800 small nested subtrees (3 Borders each); every frame the
/// oldest 80 are removed and 80 new ones are created and added. Exercises control creation,
/// attach/detach to the visual/logical tree, styling, and WrapPanel re-layout.
/// </summary>
public sealed class TreeChurnScenario : BenchScenario
{
    private const int ItemCount = 800;
    private const int ChurnPerFrame = 80;

    // 7 brushes: ChurnPerFrame must not be a multiple of the palette size, otherwise the shifted
    // content looks identical every frame and the renderer has nothing to redraw.
    private static readonly IBrush[] s_brushes =
    [
        Brushes.CornflowerBlue, Brushes.Tomato, Brushes.YellowGreen, Brushes.Plum,
        Brushes.SandyBrown, Brushes.Turquoise, Brushes.Khaki,
    ];

    private WrapPanel? _panel;
    private int _next;

    public override string Name => "fps-tree-churn";

    public override ScenarioKind Kind => ScenarioKind.Frames;

    public override Control CreateView()
    {
        _panel = new WrapPanel();
        _next = 0;
        for (var i = 0; i < ItemCount; i++)
        {
            _panel.Children.Add(CreateItem(_next++));
        }
        return _panel;
    }

    public override void OnFrame(TimeSpan elapsed)
    {
        var children = _panel!.Children;
        children.RemoveRange(0, ChurnPerFrame);
        var added = new Control[ChurnPerFrame];
        for (var i = 0; i < added.Length; i++)
        {
            added[i] = CreateItem(_next++);
        }
        children.AddRange(added);
    }

    public override void Stop() => _panel = null;

    private static Control CreateItem(int index) => new Border
    {
        Width = 24,
        Height = 24,
        Margin = new Thickness(2),
        Background = s_brushes[index % s_brushes.Length],
        Child = new Border
        {
            Margin = new Thickness(4),
            Background = Brushes.White,
            Child = new Border
            {
                Margin = new Thickness(3),
                Background = s_brushes[(index + 2) % s_brushes.Length],
            },
        },
    };
}
