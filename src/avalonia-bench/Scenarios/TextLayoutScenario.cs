using System.Text;
using Avalonia.Controls;
using Avalonia.Media;
using Avalonia.Media.TextFormatting;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Text shaping (HarfBuzz) and line breaking: each iteration lays out 10 pseudo-random sentences of
/// 16-24 words as wrapped <see cref="TextLayout"/>s. Sentences differ every time, so no shaping
/// result can be reused. Reports text layouts per second.
/// </summary>
public sealed class TextLayoutScenario : BenchScenario
{
    private const int LayoutsPerIteration = 10;
    private const double MaxWidth = 360;

    // ASCII only, so every glyph comes from the default font without font fallback.
    // Includes ligature candidates (fi, ffl), digits and punctuation.
    private static readonly string[] s_words =
    [
        "the", "quick", "brown", "fox", "jumps", "over", "a", "lazy", "dog", "Avalonia", "layout",
        "rendering", "shaping", "glyph", "kerning", "office", "affinity", "waffle", "WebAssembly",
        "1234", "3.14159", "(parenthesized)", "e-mail", "don't", "Visual", "TextBlock", "measure",
        "arrange", "AVAWAY", "Typography", "x86_64", "#tag", "50%", "and/or", "firefly", "scaffold",
    ];

    private static readonly Typeface s_typeface = new(FontFamily.Default);

    private readonly StringBuilder _builder = new();
    private uint _seed = 12345;
    private double _height;

    public override string Name => "text-layout";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _seed = 12345;
        return Placeholder("Text layout (off-screen)");
    }

    public override int RunIteration()
    {
        for (var i = 0; i < LayoutsPerIteration; i++)
        {
            using var layout = new TextLayout(
                NextSentence(), s_typeface, 14, Brushes.Black,
                textWrapping: TextWrapping.Wrap, maxWidth: MaxWidth);
            _height += layout.Height;
        }
        return LayoutsPerIteration;
    }

    private string NextSentence()
    {
        _builder.Clear();
        var count = 16 + (int)(Next() % 9);
        for (var i = 0; i < count; i++)
        {
            if (i > 0)
                _builder.Append(' ');
            _builder.Append(s_words[Next() % (uint)s_words.Length]);
        }
        _builder.Append('.');
        return _builder.ToString();
    }

    /// <summary>Deterministic LCG.</summary>
    private uint Next()
    {
        _seed = _seed * 1664525 + 1013904223;
        return _seed >> 8;
    }
}
