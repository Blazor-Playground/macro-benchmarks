using Microsoft.AspNetCore.Components;
using System;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

namespace IgniteUILight;

public partial class App : ComponentBase
{
    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();
}
