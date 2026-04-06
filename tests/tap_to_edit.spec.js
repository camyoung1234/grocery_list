const { test, expect } = require('@playwright/test');

test('verify tap-to-edit UI and transitions', async ({ page }) => {
    await page.goto('http://localhost:3000');
    // Clear localStorage to start fresh
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
                    {
                        id: 'item-milk',
                        text: 'Milk',
                        homeSectionId: 'sec-h-def',
                        shopSectionId: 'sec-s-def',
                        homeIndex: 0,
                        shopIndex: 0,
                        haveCount: 0,
                        wantCount: 1,
                        shopCompleted: false
                    },
                    {
                        id: 'item-eggs',
                        text: 'Eggs',
                        homeSectionId: 'sec-h-def',
                        shopSectionId: 'sec-s-def',
                        homeIndex: 1,
                        shopIndex: 1,
                        haveCount: 0,
                        wantCount: 1,
                        shopCompleted: false
                    }
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

    const milkRow = page.locator('.grocery-item', { hasText: 'Milk' });
    const eggsRow = page.locator('.grocery-item', { hasText: 'Eggs' });
    const sectionHeader = page.locator('.section-header', { hasText: 'Uncategorized' });

    // --- Initial State Verification ---
    await expect(milkRow).not.toHaveClass(/is-editing/);
    await expect(milkRow.locator('.quantity-controls')).toBeVisible();
    const initialMilkQtyWidth = await milkRow.locator('.quantity-controls').evaluate(el => getComputedStyle(el).width);
    expect(initialMilkQtyWidth).toBe('48px');
    await expect(milkRow.locator('.item-delete-btn')).not.toBeVisible();

    // --- 1. Tap Milk Row ---
    await milkRow.click({ position: { x: 5, y: 5 } }); // Click near the edge to avoid text click
    await expect(milkRow).toHaveClass(/is-editing/);

    // Verify UI changes for Milk
    const editingMilkQtyWidth = await milkRow.locator('.quantity-controls').evaluate(el => getComputedStyle(el).width);
    expect(editingMilkQtyWidth).toBe('0px');
    await expect(milkRow.locator('.item-delete-btn')).toBeVisible();
    await expect(milkRow.locator('.drag-handle')).toBeVisible();

    // Take screenshot
    await page.screenshot({ path: '/home/jules/verification/screenshots/milk_editing_playwright.png' });

    // --- 2. Tap Eggs Row (Focus shift) ---
    await eggsRow.click({ position: { x: 5, y: 5 } });
    await expect(milkRow).not.toHaveClass(/is-editing/);
    await expect(eggsRow).toHaveClass(/is-editing/);

    await expect(milkRow.locator('.quantity-controls')).toBeVisible();
    await expect(eggsRow.locator('.quantity-controls')).not.toBeVisible();
    await expect(eggsRow.locator('.item-delete-btn')).toBeVisible();

    // --- 3. Tap Section Header ---
    await sectionHeader.click({ position: { x: 5, y: 5 } });
    await expect(eggsRow).not.toHaveClass(/is-editing/);
    await expect(sectionHeader).toHaveClass(/is-editing/);
    await expect(sectionHeader.locator('.section-delete-btn')).toBeVisible();
    await expect(sectionHeader.locator('.drag-handle')).toBeVisible();

    // --- 4. Tap Bottom Toolbar (Close edit) ---
    await page.locator('.bottom-toolbar').click();
    await expect(sectionHeader).not.toHaveClass(/is-editing/);
    await expect(sectionHeader.locator('.section-delete-btn')).not.toBeVisible();

    // --- 5. Inline Editing Name (Milk) ---
    await milkRow.click({ position: { x: 5, y: 5 } });
    await expect(milkRow).toHaveClass(/is-editing/);
    // Tap text to edit
    await milkRow.locator('.item-text').click();
    await expect(milkRow.locator('.inline-edit-input')).toBeVisible();
    await page.keyboard.type(' Whole');
    await page.keyboard.press('Enter');
    await expect(milkRow.locator('.item-text')).toHaveText(/Milk Whole/);
    // After enter, it should still be in edit mode (or not? requirement says "tapping on another... will close exciting". Usually blur/enter in our app re-renders)
    // Actually current startInlineItemEdit calls renderList() at the end, and editingRowId is NOT cleared.
    await expect(milkRow).toHaveClass(/is-editing/);

    await page.screenshot({ path: '/home/jules/verification/screenshots/verification.png' });
});
