using Avalonia;
using Avalonia.Controls;
using Avalonia.Input;
using Avalonia.Media;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Hit testing: ~2000 overlapping Borders (some rotated, some with a nested child) placed
/// pseudo-randomly on a Canvas; each iteration runs 100 <c>InputHitTest</c> queries at
/// pseudo-random points. Reports hit tests per second.
/// </summary>
public sealed class HitTestScenario : BenchScenario
{
    private const int ItemCount = 2000;
    private const int TestsPerIteration = 100;
    private const double AreaWidth = 1200;
    private const double AreaHeight = 680;

    private static readonly IBrush[] s_brushes =
        [Brushes.SteelBlue, Brushes.IndianRed, Brushes.SeaGreen, Brushes.Goldenrod, Brushes.MediumPurple];

    private Canvas? _canvas;
    private uint _seed = 12345;
    private int _hits;

    public override string Name => "hit-test";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _seed = 12345;
        _canvas = new Canvas();
        for (var i = 0; i < ItemCount; i++)
        {
            var size = 10 + Next() * 30;
            var item = new Border
            {
                Width = size,
                Height = size,
                Background = s_brushes[i % s_brushes.Length],
            };
            if (i % 4 == 0)
                item.RenderTransform = new RotateTransform(30);
            if (i % 5 == 0)
                item.Child = new Border { Margin = new Thickness(2), Background = Brushes.White };
            Canvas.SetLeft(item, Next() * AreaWidth);
            Canvas.SetTop(item, Next() * AreaHeight);
            _canvas.Children.Add(item);
        }
        return _canvas;
    }

    public override int RunIteration()
    {
        for (var i = 0; i < TestsPerIteration; i++)
        {
            if (_canvas!.InputHitTest(new Point(Next() * AreaWidth, Next() * AreaHeight)) is not null)
                _hits++;
        }
        return TestsPerIteration;
    }

    public override void Stop() => _canvas = null;

    /// <summary>Deterministic LCG in [0, 1).</summary>
    private double Next()
    {
        _seed = _seed * 1664525 + 1013904223;
        return (_seed >> 8) / (double)(1 << 24);
    }
}
