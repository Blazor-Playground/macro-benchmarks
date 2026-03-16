// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System;
using System.Runtime.InteropServices.JavaScript;

/// <summary>
/// Exception handling benchmark with realistic stack depth.
/// Recursive Fibonacci that throws from 20 levels deep, caught at the top.
/// Each JS call runs 100 iterations to amortize interop overhead and measure
/// the exception unwinding cost through a deep managed call stack.
/// </summary>
public static partial class ExceptionBench
{
    private const int Depth = 10;
    private const int Iterations = 100;

    [JSExport]
    public static int ThrowCatch(int value)
    {
        int result = 0;
        for (int i = 0; i < Iterations; i++)
        {
            try
            {
                result += Fib(value, Depth);
            }
            catch (InvalidOperationException)
            {
                result += i;
            }
        }
        return result;
    }

    /// <summary>
    /// Linear recursion to depth 10, then throws.
    /// This creates a 10-frame managed stack for the exception to unwind through,
    /// without the exponential blowup of tree-recursive Fibonacci.
    /// </summary>
    private static int Fib(int value, int depth)
    {
        try
        {
            if (depth <= 0)
            {
                throw new InvalidOperationException("bench: reached bottom of recursion");
            }
            return Fib(value, depth - 1) + depth;
        }
        catch (InvalidOperationException ex)
        {
            throw new InvalidOperationException($"bench: unwinding depth {depth}", ex);
        }
    }
}
