using System;
using System.Threading.Tasks;
using Avalonia.Controls;
using Avalonia.Layout;
using Avalonia.Media;

namespace AvaloniaBench;

/// <summary>
/// Root view. Shows "Hello, Avalonia!" by default; scenarios swap in their own content.
/// A Border is used because template-less controls render without a theme.
/// </summary>
public sealed class BenchHost : Border
{
    private readonly Control _hello;

    public static BenchHost? Current { get; set; }

    public BenchHost()
    {
        Background = Brushes.White;
        _hello = new TextBlock
        {
            Text = "Hello, Avalonia!",
            FontSize = 32,
            Foreground = Brushes.Black,
            HorizontalAlignment = HorizontalAlignment.Center,
            VerticalAlignment = VerticalAlignment.Center,
        };
        Child = _hello;
    }

    public void SetContent(Control? content) => Child = content ?? _hello;

    public Task WaitForFramesAsync(int count)
    {
        var topLevel = TopLevel.GetTopLevel(this)
            ?? throw new InvalidOperationException("BenchHost is not attached to a TopLevel");
        var tcs = new TaskCompletionSource();

        void OnFrame(TimeSpan _)
        {
            if (--count <= 0)
                tcs.TrySetResult();
            else
                topLevel.RequestAnimationFrame(OnFrame);
        }

        topLevel.RequestAnimationFrame(OnFrame);
        return tcs.Task;
    }
}
