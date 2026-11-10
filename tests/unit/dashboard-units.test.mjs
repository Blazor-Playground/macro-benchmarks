import assert from 'node:assert/strict';
import test from 'node:test';

globalThis.Chart = { register() {} };

const chartUrl = new URL('../../src/bench-viewer/wwwroot/chart/chart-factory.js', import.meta.url);
const constantsUrl = new URL('../../src/bench-viewer/wwwroot/chart/constants.js', import.meta.url);
const { formatValue } = await import(chartUrl);
const { metricUnit } = await import(constantsUrl);

test('byte chart values use binary thresholds and unit labels', () => {
    assert.equal(formatValue(1_048_576, 'bytes'), '1.00 MiB');
    assert.equal(formatValue(1_000_000, 'bytes'), '976.56 KiB');
    assert.equal(formatValue(1_024, 'bytes'), '1.00 KiB');
    assert.equal(formatValue(1_023, 'bytes'), '1023 B');
});

test('OpenTelemetry memory and allocation-rate labels describe binary values', () => {
    assert.equal(metricUnit('blazor-counter-heavy-server-otel-heap-mb'), 'MiB');
    assert.equal(metricUnit('blazor-counter-heavy-server-otel-working-set-mb'), 'MiB');
    assert.equal(metricUnit('blazor-counter-heavy-server-otel-alloc-rate'), 'MiB/s');
});
