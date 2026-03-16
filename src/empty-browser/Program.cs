// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System;
using System.Diagnostics;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;


partial class EmptyBenchmark
{
    public static Task<int> Main()
    {
        Console.WriteLine("Hello, Browser!");
        SetManagedReady();
        return Task.FromResult(0);
    }

    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();
}
