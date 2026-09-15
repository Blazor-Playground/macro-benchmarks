using System;
using System.Collections.Generic;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Rendering.Composition;
using Avalonia.Rendering.Composition.Animations;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Compositor stress: ~1500 Borders whose composition visuals run infinite keyframe animations on
/// RotationAngle, Scale and Opacity. The UI thread and layout stay idle; the per-tick cost is the
/// compositor evaluating animations and updating/rendering the composition tree.
/// </summary>
public sealed class CompositionAnimationScenario : BenchScenario
{
    private const int Columns = 50;
    private const int Rows = 30;
    private const double Cell = 22;
    private const double Size = 16;

    private static readonly IBrush[] s_brushes =
        [Brushes.Teal, Brushes.Crimson, Brushes.DarkOrange, Brushes.SlateBlue];

    private readonly List<Border> _items = new(Columns * Rows);

    public override string Name => "fps-composition-animations";

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
                    Width = Size,
                    Height = Size,
                    Background = s_brushes[(r + c) % s_brushes.Length],
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
        for (var i = 0; i < _items.Count; i++)
        {
            var visual = ElementComposition.GetElementVisual(_items[i])
                ?? throw new InvalidOperationException("Composition visual is not available");
            var compositor = visual.Compositor;
            var duration = TimeSpan.FromMilliseconds(1200 + i % 7 * 150);

            visual.CenterPoint = new Vector3D(Size / 2, Size / 2, 0);

            var rotation = compositor.CreateScalarKeyFrameAnimation();
            rotation.InsertKeyFrame(0f, 0f);
            rotation.InsertKeyFrame(1f, MathF.PI * 2);
            rotation.Duration = duration;
            rotation.IterationBehavior = AnimationIterationBehavior.Forever;
            visual.StartAnimation("RotationAngle", rotation);

            var scale = compositor.CreateVector3DKeyFrameAnimation();
            scale.InsertKeyFrame(0f, new Vector3D(1, 1, 1));
            scale.InsertKeyFrame(0.5f, new Vector3D(0.5, 0.5, 1));
            scale.InsertKeyFrame(1f, new Vector3D(1, 1, 1));
            scale.Duration = duration;
            scale.IterationBehavior = AnimationIterationBehavior.Forever;
            visual.StartAnimation("Scale", scale);

            var opacity = compositor.CreateScalarKeyFrameAnimation();
            opacity.InsertKeyFrame(0f, 1f);
            opacity.InsertKeyFrame(0.5f, 0.35f);
            opacity.InsertKeyFrame(1f, 1f);
            opacity.Duration = duration;
            opacity.IterationBehavior = AnimationIterationBehavior.Forever;
            visual.StartAnimation("Opacity", opacity);
        }
    }

    public override void Stop() => _items.Clear();
}
