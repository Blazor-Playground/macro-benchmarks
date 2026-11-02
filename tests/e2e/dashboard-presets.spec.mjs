import { expect, test } from 'playwright/test';
import { focusFixture, routeFocusFixture } from '../helpers/focus-fixture.mjs';

test('R2R presets are selectable before their first published results', async ({ page }) => {
    const fixture = focusFixture();
    fixture.index.dimensions.presets = ['no-workload', 'aot', 'future-preset'];
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');

    await expect(page.locator('#filter-presets-no-workload')).toBeChecked();
    await expect(page.locator('#filter-presets-aot')).not.toBeChecked();
    await expect(page.locator('#filter-presets-future-preset')).toBeVisible();
    for (const [preset, label] of [
        ['r2r-pgo', 'R2R PGO'],
        ['r2r-composite', 'R2R Composite'],
        ['r2r-composite-pgo', 'R2R Composite PGO'],
    ]) {
        const checkbox = page.locator(`#filter-presets-${preset}`);
        await expect(checkbox).toBeVisible();
        await expect(checkbox).not.toBeChecked();
        await expect(page.locator(`label[for="filter-presets-${preset}"]`)).toHaveText(label);
        await checkbox.check();
        await expect(checkbox).toBeChecked();
    }
    await expect(page.locator('#filter-presets-aot')).toHaveCount(1);
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});

test('published R2R dimensions do not produce duplicate preset checkboxes', async ({ page }) => {
    const fixture = focusFixture();
    fixture.index.dimensions.presets.push('r2r-pgo', 'r2r-composite', 'r2r-composite-pgo');
    await routeFocusFixture(page, fixture);
    await page.goto('/macro-benchmarks/');
    for (const preset of ['aot', 'r2r-pgo', 'r2r-composite', 'r2r-composite-pgo']) {
        await expect(page.locator(`#filter-presets-${preset}`)).toHaveCount(1);
        await expect(page.locator(`#filter-presets-${preset}`)).toBeVisible();
    }
    await expect(page.locator('#blazor-error-ui')).toBeHidden();
});
