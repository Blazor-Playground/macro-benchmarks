export async function jsInvokableWithJson(n, forecasts) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'JSInvokableWithJson', n, forecasts);
}

export async function jsInvokableWithNumber(number, bigNumber, decimalNumber) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'JSInvokableWithNumber', number, bigNumber, decimalNumber);
}

export async function jsInvokableWithString(value) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'JSInvokableWithString', value);
}

export async function csInvokableWithString() {
    return "Hello from JavaScript";
}

export async function csInvokableWithNumber(n, bigNumber, decimalNumber) {
    return Math.trunc(42 + n + bigNumber + decimalNumber) | 0;
}

export async function csInvokableWithJson(n, forecasts) {
    const sum = forecasts.reduce((acc, f) => acc + f.temperatureC, 0);
    return n + sum / forecasts.length;
}

export async function benchCsToJs(ms) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'BenchCsToJs', ms);
}

export async function benchCsToJsNumber(ms) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'BenchCsToJsNumber', ms);
}

export async function benchCsToJsString(ms) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'BenchCsToJsString', ms);
}

export async function benchCsToJsJson(ms) {
    return await DotNet.invokeMethodAsync('BlazorPerf.Client', 'BenchCsToJsJson', ms);
}

export async function benchJsToCsNumber(ms) {
    let count = 0;
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        await DotNet.invokeMethodAsync('BlazorPerf.Client', 'JSInvokableWithNumber', 42, 1234567890123456789, 3.14);
        count++;
    }
    return count;
}

export async function benchJsToCsString(ms) {
    let count = 0;
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        await DotNet.invokeMethodAsync('BlazorPerf.Client', 'JSInvokableWithString', 'test');
        count++;
    }
    return count;
}

export async function benchJsToCsJson(ms) {
    let count = 0;
    const sampleForecasts = [
        { date: new Date().toISOString().split('T')[0], temperatureC: 20, summary: 'Mild' },
        { date: new Date(Date.now() + 86400000).toISOString().split('T')[0], temperatureC: 25, summary: 'Warm' },
        { date: new Date(Date.now() + 172800000).toISOString().split('T')[0], temperatureC: 30, summary: 'Hot' }
    ];
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        await DotNet.invokeMethodAsync('BlazorPerf.Client', 'JSInvokableWithJson', 1, sampleForecasts);
        count++;
    }
    return count;
}

globalThis.jsInvokableWithJson = jsInvokableWithJson;
globalThis.jsInvokableWithNumber = jsInvokableWithNumber;
globalThis.jsInvokableWithString = jsInvokableWithString;
globalThis.csInvokableWithString = csInvokableWithString;
globalThis.csInvokableWithNumber = csInvokableWithNumber;
globalThis.csInvokableWithJson = csInvokableWithJson;
globalThis.benchJsToCsNumber = benchJsToCsNumber;
globalThis.benchJsToCsString = benchJsToCsString;
globalThis.benchJsToCsJson = benchJsToCsJson;
globalThis.benchCsToJsNumber = benchCsToJsNumber;
globalThis.benchCsToJsString = benchCsToJsString;
globalThis.benchCsToJsJson = benchCsToJsJson;
