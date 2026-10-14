export function withRuntimeReady(builder, callback) {
    if (typeof builder.withDotnetReady === 'function') {
        builder.withDotnetReady(callback);
    } else if (typeof builder.withModuleConfig === 'function') {
        console.warn('Runtime builder lacks withDotnetReady; using the older SDK ready callback.');
        builder.withModuleConfig({ onDotnetReady: callback });
    } else {
        throw new Error('The runtime builder has no supported managed-ready callback API.');
    }
}
