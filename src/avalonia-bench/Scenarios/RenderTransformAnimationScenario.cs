using System;
using System.Collections.Generic;
using System.Threading;
using Avalonia;
using Avalonia.Animation;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Styling;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Animation-system stress: ~1500 Borders, each with two infinite keyframe animations (Avalonia
/// <see cref="Animation"/>) evaluated on the UI thread every tick — Opacity, and an attached
/// <see cref="ProgressProperty"/> whose change handler updates the item's rotate/scale transforms.
/// Only render-affecting properties change, so there is no layout work.
/// </summary>
/// <remarks>
/// Animation targets must be visuals, and there is no animator for RenderTransform itself, so the
/// transform is driven from an animated double property on the Border.
/// </remarks>
public sealed class RenderTransformAnimationScenario : BenchScenario
{
    private const int Columns = 50;
    private const int Rows = 30;
    private const double Cell = 22;

    private static readonly IBrush[] s_brushes =
        [Brushes.DodgerBlue, Brushes.OrangeRed, Brushes.MediumSeaGreen, Brushes.Orchid];

    /// <summary>Animation progress 0..1, mapped to rotation and scale.</summary>
    public static readonly AttachedProperty<double> ProgressProperty =
        AvaloniaProperty.RegisterAttached<RenderTransformAnimationScenario, Border, double>("Progress");

    static RenderTransformAnimationScenario()
    {
        ProgressProperty.Changed.AddClassHandler<Border>(OnProgressChanged);
    }

    private readonly List<Border> _items = new(Columns * Rows);
    private CancellationTokenSource? _cts;

    public override string Name => "fps-render-transforms";

    public override ScenarioKind Kind => ScenarioKind.Frames;

    public override Control CreateView()
    {
        _items.Clear();
        var canvas = new Canvas();
        for (var r = 0; r < Rows; r++)
        {
            for (var c = 0; c < Columns; c++)
            {
                var item = new Border
                {
                    Width = 16,
                    Height = 16,
                    Background = s_brushes[(r * Columns + c) % s_brushes.Length],
                    RenderTransform = new TransformGroup { Children = { new ScaleTransform(), new RotateTransform() } },
                };
                Canvas.SetLeft(item, c * Cell);
                Canvas.SetTop(item, r * Cell);
                _items.Add(item);
                canvas.Children.Add(item);
            }
        }
        return canvas;
    }

    public override void Start()
    {
        _cts = new CancellationTokenSource();
        for (var i = 0; i < _items.Count; i++)
        {
            var duration = TimeSpan.FromMilliseconds(1200 + i % 7 * 150);
            _ = CreateAnimation(duration, ProgressProperty, (0, 0d), (1, 1d)).RunAsync(_items[i], _cts.Token);
            _ = CreateAnimation(duration, Visual.OpacityProperty, (0, 1d), (0.5, 0.35), (1, 1d)).RunAsync(_items[i], _cts.Token);
        }
    }

    public override void Stop()
    {
        _cts?.Cancel();
        _cts = null;
        _items.Clear();
    }

    private static void OnProgressChanged(Border item, AvaloniaPropertyChangedEventArgs e)
    {
        if (item.RenderTransform is not TransformGroup { Children: [ScaleTransform scale, RotateTransform rotate] })
            return;
        var progress = (double)e.NewValue!;
        var s = 1 - 0.5 * Math.Sin(progress * Math.PI);
        scale.ScaleX = s;
        scale.ScaleY = s;
        rotate.Angle = progress * 360;
    }

    private static Animation CreateAnimation(TimeSpan duration, AvaloniaProperty property, params (double Cue, double Value)[] keyFrames)
    {
        var animation = new Animation
        {
            Duration = duration,
            IterationCount = IterationCount.Infinite,
        };
        foreach (var (cue, value) in keyFrames)
        {
            animation.Children.Add(new KeyFrame
            {
                Cue = new Cue(cue),
                Setters = { new Setter(property, value) },
            });
        }
        return animation;
    }
}
