const { test, expect } = require('@playwright/test');

test('verify drag and drop functionality in tap-to-edit mode', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        localStorage.clear();
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Test List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [
                    { id: 'item-1', text: 'Item 1', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 0, shopIndex: 0, haveCount: 0, wantCount: 1, shopCompleted: false },
                    { id: 'item-2', text: 'Item 2', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 1, shopIndex: 1, haveCount: 0, wantCount: 1, shopCompleted: false }
                ]
            }],
            currentListId: 'list-1',
            updatedAt: Date.now()
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
        localStorage.setItem('grocery-mode', 'home');
        localStorage.setItem('grocery-edit-mode', 'false');
    });
    await page.reload();

    const item1Row = page.locator('.grocery-item', { hasText: 'Item 1' });
    const item2Row = page.locator('.grocery-item', { hasText: 'Item 2' });

    // Tap Item 1 to reveal drag handle
    await item1Row.click({ position: { x: 5, y: 5 } });
    await expect(item1Row).toHaveClass(/is-editing/);
    const handle1 = item1Row.locator('.drag-handle');
    await expect(handle1).toBeVisible();

    // Verify draggable attribute
    const draggable = await handle1.evaluate(el => el.getAttribute('draggable'));
    expect(draggable).toBe('true');

    // Perform drag and drop (Item 1 below Item 2)
    const handle1Box = await handle1.boundingBox();
    const item2Box = await item2Row.boundingBox();

    await page.mouse.move(handle1Box.x + handle1Box.width / 2, handle1Box.y + handle1Box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(100);
    // Drag down past item 2
    await page.mouse.move(item2Box.x + item2Box.width / 2, item2Box.y + item2Box.height + 10, { steps: 10 });
    await page.mouse.up();

    await page.waitForTimeout(500);

    // Verify order in DOM
    const texts = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.grocery-item:not(.add-item-row) .item-text')).map(el => el.textContent);
    });
    console.log('Order after drag:', texts);
    expect(texts[0]).toBe('Item 2');
    expect(texts[1]).toBe('Item 1');

    await page.screenshot({ path: '/home/jules/verification/screenshots/drag_drop_verify.png' });
});
