const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('verify quantity field is always displayed in shop mode', async ({ page }) => {
    await mockFirebase(page);
    await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
    await page.goto('http://localhost:3000');

    // Set up a list with one item
    await setMockState(page, {
        mode: 'home',
        editMode: true,
        lists: [{
            id: 'list-1',
            name: 'Test List',
            theme: 'var(--theme-blue)',
            accent: 'var(--theme-amber)',
            homeSections: [{ id: 'sec-1', name: 'Fruits' }],
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
            items: [{
                id: 'item-1',
                text: 'Apple',
                homeSectionId: 'sec-1',
                shopSectionId: 'sec-s-def',
                homeIndex: 0,
                shopIndex: 0,
                haveCount: 0,
                wantCount: 1,
                shopCompleted: false
            }]
        }],
        currentListId: 'list-1'
    });

    // Switch to Shop Mode
    await page.click('#toolbar-mode');
    await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);

    // Disable editMode
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Verify quantity controls are visible even when NOT in edit mode in shop mode
    const wantStepper = page.locator('.grocery-item .want-stepper');
    await expect(wantStepper).toBeVisible();
});
