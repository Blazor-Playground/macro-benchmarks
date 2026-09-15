using Avalonia;
using Avalonia.Controls;
using Avalonia.Data;

namespace AvaloniaBench.Scenarios;

/// <summary>
/// Property system stress on plain <see cref="AvaloniaObject"/>s (no visuals, no layout):
/// per object, set a styled value at style and local priority, set a direct property, set/clear a
/// reference-type styled property, and read values back. Change notifications go through
/// <see cref="AvaloniaObject.OnPropertyChanged"/>. Reports property operations per second.
/// </summary>
public sealed class PropertySetGetScenario : BenchScenario
{
    private const int ObjectCount = 1000;
    private const int OpsPerObject = 6;

    private BenchObject[] _objects = [];
    private int _iteration;

    public override string Name => "property-set-get";

    public override ScenarioKind Kind => ScenarioKind.Managed;

    public override Control CreateView()
    {
        _objects = new BenchObject[ObjectCount];
        for (var i = 0; i < _objects.Length; i++)
        {
            _objects[i] = new BenchObject();
        }
        return Placeholder(Name);
    }

    public override int RunIteration()
    {
        var v = ++_iteration;
        var even = (v & 1) == 0;
        double sum = 0;
        foreach (var o in _objects)
        {
            o.SetValue(BenchObject.ValueProperty, v * 2.0, BindingPriority.Style);
            o.SetValue(BenchObject.ValueProperty, (double)v);
            o.Count = v;
            if (even)
                o.SetValue(BenchObject.TextProperty, "even");
            else
                o.ClearValue(BenchObject.TextProperty);
            sum += o.GetValue(BenchObject.ValueProperty) + o.Count;
            sum += o.GetValue(BenchObject.TextProperty)?.Length ?? 0;
        }
        return sum > 0 ? ObjectCount * OpsPerObject : 0;
    }

    public override void Stop() => _objects = [];

    private sealed class BenchObject : AvaloniaObject
    {
        public static readonly StyledProperty<double> ValueProperty =
            AvaloniaProperty.Register<BenchObject, double>(nameof(Value));

        public static readonly StyledProperty<string?> TextProperty =
            AvaloniaProperty.Register<BenchObject, string?>(nameof(Text));

        public static readonly DirectProperty<BenchObject, int> CountProperty =
            AvaloniaProperty.RegisterDirect<BenchObject, int>(nameof(Count), o => o.Count, (o, v) => o.Count = v);

        private int _count;

        public double Value
        {
            get => GetValue(ValueProperty);
            set => SetValue(ValueProperty, value);
        }

        public string? Text
        {
            get => GetValue(TextProperty);
            set => SetValue(TextProperty, value);
        }

        public int Count
        {
            get => _count;
            set => SetAndRaise(CountProperty, ref _count, value);
        }

        public int Changes { get; private set; }

        protected override void OnPropertyChanged(AvaloniaPropertyChangedEventArgs change)
        {
            base.OnPropertyChanged(change);
            Changes++;
        }
    }
}
