// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System.Runtime.InteropServices.JavaScript;
using System.Text.Json;

/// <summary>
/// JSON parsing benchmark.
/// JS passes a JSON string; C# deserializes with System.Text.Json.
/// </summary>
public static partial class JsonBench
{
    [JSExport]
    public static int ParseJson(string json)
    {
        using var doc = JsonDocument.Parse(json);
        return doc.RootElement.GetProperty("count").GetInt32();
    }
}
