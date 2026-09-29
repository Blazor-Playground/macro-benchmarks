using System;
using Avalonia;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.Imaging;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Skia drawing: each iteration draws 120 shapes (star and blob paths, rounded rectangles, ellipses,
/// lines) with gradient fills, solid and dashed strokes and per-shape transforms into a 640x400
/// <see cref="RenderTargetBitmap"/>, plus one freshly built 64-segment <see cref="StreamGeometry"/>.
/// The bitmap is a CPU raster surface, so this measures Skia and Avalonia's drawing path in
/// WebAssembly independently of the browser's GPU. Reports shapes drawn per second.
/// </summary>
public sealed class SkiaDrawingScenario : BenchScenario
{
    private const int Width = 640;
    private const int Height = 400;
    private const int ShapesPerIteration = 120;

    private static readonly IBrush s_linear = new LinearGradientBrush
    {
        StartPoint = RelativePoint.TopLeft,
        EndPoint = RelativePoint.BottomRight,
        GradientStops = { new GradientStop(Colors.SteelBlue, 0), new GradientStop(Colors.Goldenrod, 1) },
    };

    private static readonly IBrush s_radial = new RadialGradientBrush
    {
        GradientStops = { new GradientStop(Colors.White, 0), new GradientStop(Colors.IndianRed, 1) },
    };

    private static readonly IPen s_pen = new Pen(Brushes.Black, 1.5);
    private static readonly IPen s_dashPen = new Pen(Brushes.SeaGreen, 2, DashStyle.Dash);

    private RenderTargetBitmap? _bitmap;
    private StreamGeometry? _star;
    private StreamGeometry? _blob;
    private int _iteration;

    public override string Name => "skia-drawing";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _bitmap = new RenderTargetBitmap(new PixelSize(Width, Height));
        _star = CreateStar();
        _blob = CreateBlob();
        _iteration = 0;
        return Placeholder("Skia drawing (off-screen)");
    }

    public override int RunIteration()
    {
        var iteration = _iteration++;
        using (var context = _bitmap!.CreateDrawingContext(true))
        {
            for (var i = 0; i < ShapesPerIteration; i++)
            {
                var x = (i * 53 + iteration * 7) % (Width - 60);
                var y = (i * 97) % (Height - 60);
                var transform = Matrix.CreateRotation((i + iteration) * 0.1) * Matrix.CreateTranslation(x + 30, y + 30);
                using (context.PushTransform(transform))
                {
                    switch (i % 5)
                    {
                        case 0:
                            context.DrawGeometry(s_linear, s_pen, _star!);
                            break;
                        case 1:
                            context.DrawGeometry(s_radial, null, _blob!);
                            break;
                        case 2:
                            context.DrawRectangle(s_linear, s_pen, new Rect(-30, -15, 60, 30), 6, 6);
                            break;
                        case 3:
                            context.DrawEllipse(s_radial, s_dashPen, default, 25, 15);
                            break;
                        default:
                            context.DrawLine(s_dashPen, new Point(-30, -10), new Point(30, 10));
                            break;
                    }
                }
            }

            context.DrawGeometry(null, s_pen, CreateWave(iteration));
        }
        return ShapesPerIteration + 1;
    }

    public override void Stop()
    {
        _bitmap?.Dispose();
        _bitmap = null;
    }

    private static StreamGeometry CreateStar()
    {
        var geometry = new StreamGeometry();
        using var context = geometry.Open();
        for (var i = 0; i < 10; i++)
        {
            var radius = i % 2 == 0 ? 28 : 12;
            var angle = Math.PI * i / 5;
            var point = new Point(radius * Math.Sin(angle), -radius * Math.Cos(angle));
            if (i == 0)
                context.BeginFigure(point, true);
            else
                context.LineTo(point);
        }
        context.EndFigure(true);
        return geometry;
    }

    private static StreamGeometry CreateBlob()
    {
        var geometry = new StreamGeometry();
        using var context = geometry.Open();
        context.BeginFigure(new Point(-25, 0), true);
        context.CubicBezierTo(new Point(-25, -30), new Point(25, -30), new Point(25, 0));
        context.CubicBezierTo(new Point(25, 20), new Point(0, 10), new Point(0, 25));
        context.CubicBezierTo(new Point(0, 10), new Point(-25, 20), new Point(-25, 0));
        context.EndFigure(true);
        return geometry;
    }

    /// <summary>A new path every iteration, so path building is measured as well.</summary>
    private static StreamGeometry CreateWave(int phase)
    {
        var geometry = new StreamGeometry();
        using var context = geometry.Open();
        context.BeginFigure(new Point(0, Height / 2.0), false);
        for (var i = 1; i <= 64; i++)
        {
            var x = i * (Width / 64.0);
            context.LineTo(new Point(x, Height / 2.0 + 80 * Math.Sin((i + phase) * 0.3)));
        }
        context.EndFigure(false);
        return geometry;
    }
}
