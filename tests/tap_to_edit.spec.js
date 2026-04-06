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
        localStorage.setItem('grocery-edit-mode', 'false'); // Force standard view
    });
    await page.reload();

    const milkRow = page.locator('.grocery-item', { hasText: 'Milk' });
    const eggsRow = page.locator('.grocery-item', { hasText: 'Eggs' });
    const sectionHeader = page.locator('.section-header', { hasText: 'Uncategorized' });

    // --- Initial State Verification ---
    await expect(milkRow).not.toHaveClass(/is-editing/);
    await expect(milkRow.locator('.quantity-controls')).toBeVisible();
    await expect(milkRow.locator('.item-delete-btn')).not.toBeVisible();

    // --- 1. Tap Milk Row ---
    await milkRow.click({ position: { x: 5, y: 5 } });
    await expect(milkRow).toHaveClass(/is-editing/);

    // Verify UI changes for Milk
    const editingMilkQtyWidth = await milkRow.locator('.quantity-controls').evaluate(el => getComputedStyle(el).width);
    expect(editingMilkQtyWidth).toBe('0px');
    await expect(milkRow.locator('.item-delete-btn')).toBeVisible();
    await expect(milkRow.locator('.drag-handle')).toBeVisible();

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
    const milkRowToEdit = page.locator('.grocery-item').filter({ hasText: 'Milk' });
    await milkRowToEdit.click({ position: { x: 5, y: 5 } });
    await expect(milkRowToEdit).toHaveClass(/is-editing/);
    // Tap text to edit
    await milkRowToEdit.locator('.item-text').click();
    await expect(milkRowToEdit.locator('.inline-edit-input')).toBeVisible();
    // Clear and type
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('Whole Milk');
    await page.keyboard.press('Enter');

    const textContent = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.grocery-item'));
        return items.map(i => i.querySelector('.item-text')?.textContent);
    });
    console.log('Item texts:', textContent);
    expect(textContent).toContain('Whole Milk');

    await page.screenshot({ path: '/home/jules/verification/screenshots/verification.png' });
});
