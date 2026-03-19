
const { test, expect } = require('@playwright/test');

test('generate large list and measure edit mode toggle', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Clear existing data
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Generate 500 items
    await page.evaluate(() => {
        const items = [];
        for (let i = 0; i < 500; i++) {
            items.push({
                id: 'item-' + i,
                text: 'Item ' + i,
                homeSectionId: 'sec-h-def',
                shopSectionId: 'sec-s-def',
                homeIndex: i,
                shopIndex: i,
                haveCount: 0,
                wantCount: 1,
                shopCompleted: false
            });
        }
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Large List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: items
            }],
            currentListId: 'list-1'
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });

    await page.reload();

    // Verify 500 items are rendered
    const itemCount = await page.locator('.grocery-item:not(.add-item-row):not(.add-section-row)').count();
    console.log(`Rendered ${itemCount} items`);

    // Ensure it starts in non-edit mode (app.js initializes with true, let's toggle it first if needed)
    const container = page.locator('.app-container');
    const isEdit = await container.evaluate(el => !el.classList.contains('hide-drag-handles'));
    if (isEdit) {
        await page.click('#toolbar-reorder');
    }
    await expect(container).toHaveClass(/hide-drag-handles/);

    // Measure time to toggle edit mode
    const start = Date.now();
    await page.click('#toolbar-reorder');
    const end = Date.now();
    console.log(`Toggle Edit Mode took ${end - start}ms`);

    // Check if it's in edit mode
    await expect(container).not.toHaveClass(/hide-drag-handles/);

    // Take a screenshot
    await page.screenshot({ path: 'edit-mode-large.png' });
});
