const { test, expect } = require('@playwright/test');
const { mockFirebase } = require('./mockFirebase');

test.describe('Long Press Drag', () => {
    test.beforeEach(async ({ page }) => {
        const initialState = {
            lists: [{
                id: 'list-1',
                name: 'Grocery List',
                theme: 'var(--theme-blue)',
                accent: 'var(--theme-amber)',
                homeSections: [{ id: 'sec-1', name: 'Produce' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [
                    { id: 'item-1', text: 'Apples', homeSectionId: 'sec-1', shopSectionId: 'sec-s-def', haveCount: 0, wantCount: 1, homeIndex: 0, shopIndex: 0 }
                ]
            }],
            currentListId: 'list-1',
            mode: 'home',
            editMode: false,
            updatedAt: Date.now() + 10000
        };
        await mockFirebase(page, initialState);
        await page.goto('http://localhost:3000');
        // Wait for app to initialize and list to render
        await page.waitForSelector('.grocery-item:not(.add-item-row):not(.add-section-row)');
    });

    test('should start dragging after 500ms long press on a grocery item', async ({ page }) => {
        const item = page.locator('.grocery-item:not(.add-item-row):not(.add-section-row)').first();
        const box = await item.boundingBox();

        // Move to the item
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        // Wait for 600ms (more than 500ms)
        await page.waitForTimeout(600);

        // Check if is-dragging class is added to document element
        const isDragging = await page.evaluate(() => document.documentElement.classList.contains('is-dragging'));
        expect(isDragging).toBe(true);

        // Check if touch-ghost exists
        const ghostCount = await page.locator('.touch-ghost').count();
        expect(ghostCount).toBe(1);

        await page.mouse.up();
    });

    test('should NOT start dragging if mouse moves during long press', async ({ page }) => {
        const item = page.locator('.grocery-item:not(.add-item-row):not(.add-section-row)').first();
        const box = await item.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        await page.waitForTimeout(200);

        // Move the mouse significantly
        await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2);

        await page.waitForTimeout(400);

        const isDragging = await page.evaluate(() => document.documentElement.classList.contains('is-dragging'));
        expect(isDragging).toBe(false);

        await page.mouse.up();
    });

    test('should start dragging after long press on a section header', async ({ page }) => {
        const header = page.locator('.section-header').first();
        const box = await header.boundingBox();

        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down();

        await page.waitForTimeout(600);

        const isDragging = await page.evaluate(() => document.documentElement.classList.contains('is-dragging'));
        expect(isDragging).toBe(true);

        await page.mouse.up();
    });
});
