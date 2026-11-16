namespace RadzenBlazorDemos;

public sealed class RenderTracker
{
    public int Generation { get; private set; }
    public int Pending { get; private set; }
    public event Action Changed;

    public void BeginNavigation()
    {
        Generation++;
    }

    public void BeginInitialization() => Pending++;

    public void EndInitialization()
    {
        Pending--;
        if (Pending == 0)
        {
            Changed?.Invoke();
        }
    }
}
