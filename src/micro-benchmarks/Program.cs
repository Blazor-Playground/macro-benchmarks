// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System;
using System.Runtime.InteropServices.JavaScript;
using System.Threading.Tasks;

partial class MicroBenchmarkApp
{
    public static Task<int> Main()
    {
        Console.WriteLine("micro-benchmarks ready");
        SetManagedReady();
        return Task.FromResult(0);
    }

    [JSImport("bench.setManagedReady", "main.mjs")]
    internal static partial void SetManagedReady();
}
