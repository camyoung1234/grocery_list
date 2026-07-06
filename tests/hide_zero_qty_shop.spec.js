const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('hide 0 quantity to buy items in shop mode when not editing', async ({ page }) => {
    const initialState = {
        lists: [{
            id: 'list-1',
            name: 'Grocery List',
            theme: 'var(--theme-blue)',
            accent: 'var(--theme-amber)',
            homeSections: [{ id: 'sec-h-def', name: 'Home' }],
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
            items: [
                {
                    id: 'item-1',
                    text: 'Item A (1 to buy)',
                    wantCount: 1,
                    haveCount: 0,
                    shopCompleted: false,
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0
                },
                {
                    id: 'item-2',
                    text: 'Item B (0 to buy)',
                    wantCount: 0,
                    haveCount: 0,
                    shopCompleted: true,
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 1,
                    shopIndex: 1
                },
                {
                    id: 'item-3',
                    text: 'Item C (Completed)',
                    wantCount: 1,
                    haveCount: 1,
                    shopCompleted: true,
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 2,
                    shopIndex: 2
                }
            ]
        }],
        currentListId: 'list-1',
        mode: 'shop',
        editMode: false
    };

    await mockFirebase(page, initialState);
    await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
    await page.goto('http://localhost:3000');

    // Wait for the app to load
    await page.waitForSelector('.app-container:not(.hidden)');

    // Verify we are in shop mode and NOT in edit mode
    await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Only Item A should be visible
    await expect(page.locator('.item-text', { hasText: 'Item A (1 to buy)' })).toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'Item B (0 to buy)' })).not.toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'Item C (Completed)' })).not.toBeVisible();

    // Toggle edit mode ON
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

    // All items should be visible
    await expect(page.locator('.item-text', { hasText: 'Item A (1 to buy)' })).toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'Item B (0 to buy)' })).toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'Item C (Completed)' })).toBeVisible();

    // Toggle edit mode OFF again
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Only Item A should be visible again
    await expect(page.locator('.item-text', { hasText: 'Item A (1 to buy)' })).toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'Item B (0 to buy)' })).not.toBeVisible();
    await expect(page.locator('.item-text', { hasText: 'Item C (Completed)' })).not.toBeVisible();
});
