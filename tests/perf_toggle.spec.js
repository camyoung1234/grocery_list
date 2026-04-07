const { test, expect } = require('@playwright/test');

test('measure toggle shop completed performance directly on UI', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Generates the same 2000 items state
    await page.evaluate(() => {
        const items = [];
        for (let i = 0; i < 2000; i++) {
            items.push({ id: 'item-' + i, text: 'Apple', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: i, shopIndex: i, haveCount: 0, wantCount: 1, shopCompleted: false });
        }
        localStorage.setItem('grocery-app-state', JSON.stringify({ lists: [{ id: 'list-1', name: 'Large List', homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }], shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }], items }] }));
        localStorage.setItem('grocery-mode', 'shop');
    });

    await page.reload();

    const itemCount = await page.locator('.grocery-item').count();
    console.log(`Rendered ${itemCount} items`);

    const duration = await page.evaluate(() => {
        const el = document.querySelector('.grocery-item.shop-chip');
        const start = performance.now();

        // We simulate a click to trigger delegation
        const event = new MouseEvent('click', { bubbles: true });
        el.dispatchEvent(event);

        return performance.now() - start;
    });

    console.log(`Synchronous click execution took: ${duration.toFixed(2)}ms`);

});
