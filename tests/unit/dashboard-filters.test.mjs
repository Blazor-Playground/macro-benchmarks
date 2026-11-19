import assert from 'node:assert/strict';
import test from 'node:test';

import { isRowVisible } from '../../src/bench-viewer/wwwroot/chart/dataset-builder.js';

test('Radzen walkthrough shows desktop Chrome timings under the default mobile profile', () => {
    const filters = {
        runtimes: ['coreclr', 'mono'],
        presets: ['no-workload'],
        profiles: ['mobile'],
        engines: ['chrome'],
    };

    for (const runtime of filters.runtimes) {
        const row = `${runtime}/no-workload/desktop/chrome`;
        assert.equal(isRowVisible(row, filters, 'radzen-walkthrough'), true);
        assert.equal(isRowVisible(row, filters, 'time-to-reach-managed-warm'), false);
    }

    assert.equal(isRowVisible('coreclr/aot/desktop/chrome', filters, 'radzen-walkthrough'), false);
});
