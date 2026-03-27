export async function jsInvokableWithJson(n, forecasts) {
    return await DotNet.invokeMethodAsync('EmptyBlazor', 'JSInvokableWithJson', n, forecasts);
}

export async function jsInvokableWithNumber(number, bigNumber, decimalNumber) {
    return await DotNet.invokeMethodAsync('EmptyBlazor', 'JSInvokableWithNumber', number, bigNumber, decimalNumber);
}

export async function jsInvokableWithString(value) {
    return await DotNet.invokeMethodAsync('EmptyBlazor', 'JSInvokableWithString', value);
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
    return await DotNet.invokeMethodAsync('EmptyBlazor', 'BenchCsToJs', ms);
}

export async function benchJsToCs(ms) {
    const results = { numberCount: 0, stringCount: 0, jsonCount: 0 };
    let total = 0;
    let deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        const numberResult = await jsInvokableWithNumber(42, 1234567890123456789, 3.14);
        total += numberResult;
        results.numberCount++;
    }
    deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        const value = await jsInvokableWithString("test" + total);
        total += value.length;
        results.stringCount++;
    }
    deadline = Date.now() + ms;
    const sampleForecasts = [
        { date: new Date().toISOString().split('T')[0], temperatureC: 20, summary: 'Mild' },
        { date: new Date(Date.now() + 86400000).toISOString().split('T')[0], temperatureC: 25, summary: 'Warm' },
        { date: new Date(Date.now() + 172800000).toISOString().split('T')[0], temperatureC: 30, summary: 'Hot' }
    ];
    while (Date.now() < deadline) {
        sampleForecasts[0].temperatureC = total % 40 - 20;
        sampleForecasts[0].date = new Date(deadline).toISOString().split('T')[0];
        const average = await jsInvokableWithJson(1, sampleForecasts);
        total += Math.trunc(average);
        results.jsonCount++;
    }
    return results;
}

globalThis.jsInvokableWithJson = jsInvokableWithJson;
globalThis.jsInvokableWithNumber = jsInvokableWithNumber;
globalThis.jsInvokableWithString = jsInvokableWithString;
globalThis.csInvokableWithString = csInvokableWithString;
globalThis.csInvokableWithNumber = csInvokableWithNumber;
globalThis.csInvokableWithJson = csInvokableWithJson;
globalThis.benchJsToCs = benchJsToCs;
globalThis.benchCsToJs = benchCsToJs;