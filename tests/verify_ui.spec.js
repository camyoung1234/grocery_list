
const { test, expect } = require('@playwright/test');

test('verify edit mode UI consistency', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Add one item
    await page.evaluate(() => {
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Test List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-1',
                    text: 'Item 1',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-1'
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });
    await page.reload();

    const container = page.locator('.app-container');

    // Ensure we are in home mode and NOT edit mode initially
    await expect(container).toHaveClass(/home-mode/);
    if (await container.evaluate(el => !el.classList.contains('hide-drag-handles'))) {
        await page.click('#toolbar-reorder');
    }
    await expect(container).toHaveClass(/hide-drag-handles/);

    // Enter Edit Mode
    await page.click('#toolbar-reorder');
    await expect(container).not.toHaveClass(/hide-drag-handles/);

    // In Edit Mode (Home Mode):
    // 1. Delete button should be visible (width 40px)
    // 2. Quantity controls should be hidden (width 0)
    // 3. Drag handle should be visible (opacity 1)

    const deleteBtn = page.locator('.item-delete-btn');
    const qtyControls = page.locator('.quantity-controls');
    const dragHandle = page.locator('.drag-handle').first();

    await expect(deleteBtn).toBeVisible();
    const deleteWidth = await deleteBtn.evaluate(el => getComputedStyle(el).width);
    console.log(`Delete button width: ${deleteWidth}`);
    expect(deleteWidth).toBe('40px');

    const qtyWidth = await qtyControls.evaluate(el => getComputedStyle(el).width);
    console.log(`Qty controls width: ${qtyWidth}`);
    expect(qtyWidth).toBe('0px');

    const handleOpacity = await dragHandle.evaluate(el => getComputedStyle(el).opacity);
    console.log(`Drag handle opacity: ${handleOpacity}`);
    expect(handleOpacity).toBe('1');

    await page.screenshot({ path: 'verify-ui-edit-mode.png' });
});
