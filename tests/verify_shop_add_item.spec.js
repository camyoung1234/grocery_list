const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('Add item rows ARE visible in shop mode when editing', async ({ page }) => {
    await mockFirebase(page);
    await page.goto('http://localhost:3000#');
    await page.waitForSelector('.app-container:not(.hidden)');

    // Seed state: Add a section so we have a place for "Add item"
    const listId = 'list-1';
    const state = {
        lists: [{
            id: listId,
            name: 'Test List',
            theme: 'var(--theme-blue)',
            homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
            shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
            items: []
        }],
        currentListId: listId
    };
    await setMockState(page, { ...state, mode: 'shop', editMode: true });

    const cancelBtn = page.locator('#restore-cancel-btn');
    if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
    }

    // Switch to Shop mode if not already there
    const modeBtn = page.locator('#toolbar-mode');
    await expect(modeBtn).toHaveClass(/active/);

    // Verify Edit mode is ON
    const reorderBtn = page.locator('#toolbar-reorder');
    await expect(reorderBtn).toHaveClass(/active/);

    // Check if .add-item-row is visible
    const addItemRow = page.locator('.add-item-row');
    await expect(addItemRow.first()).toBeVisible();

    // Check if .add-section-row IS still visible
    const addSectionRow = page.locator('.add-section-row');
    await expect(addSectionRow).toBeVisible();
});

test('Add item rows ARE visible in home mode when editing', async ({ page }) => {
    await mockFirebase(page);
    await page.goto('http://localhost:3000#');
    await page.waitForSelector('.app-container:not(.hidden)');

    // Seed state: Add a section, Home mode, Edit mode ON
    const listId = 'list-1';
    const state = {
        lists: [{
            id: listId,
            name: 'Test List',
            theme: 'var(--theme-blue)',
            homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
            shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
            items: []
        }],
        currentListId: listId
    };
    await setMockState(page, { ...state, mode: 'home', editMode: true });

    const cancelBtn = page.locator('#restore-cancel-btn');
    if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
    }

    // Ensure we are in Home mode
    await expect(page.locator('#toolbar-mode')).not.toHaveClass(/active/);

    // Verify Edit mode is ON
    const reorderBtn = page.locator('#toolbar-reorder');
    await expect(reorderBtn).toHaveClass(/active/);

    // Check if .add-item-row is visible in Home mode
    const addItemRow = page.locator('.add-item-row');
    await expect(addItemRow.first()).toBeVisible();

    // Check if .add-section-row IS visible
    const addSectionRow = page.locator('.add-section-row');
    await expect(addSectionRow).toBeVisible();
});
