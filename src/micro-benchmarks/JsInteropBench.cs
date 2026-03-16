// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System.Runtime.InteropServices.JavaScript;

/// <summary>
/// JS interop ping/pong benchmark.
/// JS calls this [JSExport] method in a tight loop to measure call overhead.
/// </summary>
public static partial class JsInteropBench
{
    [JSExport]
    public static int Ping(int value) => value + 1;
}
