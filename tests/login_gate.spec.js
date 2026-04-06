import { test, expect } from '@playwright/test';

test('verify login gate prevents access for unauthenticated users', async ({ page }) => {
    // Go to the app
    await page.goto('http://localhost:3000');

    // 1. Check if the sync modal is visible
    const syncModal = page.locator('#sync-modal-overlay');
    await expect(syncModal).toBeVisible();

    // 2. Try to close the modal (should not work when unauthenticated)
    const cancelBtn = page.locator('#sync-cancel-btn');
    await cancelBtn.click();
    await expect(syncModal).toBeVisible();

    // 3. Verify that the grocery list is empty/not rendered (or gated)
    const groceryList = page.locator('#grocery-list');
    const items = await groceryList.locator('li').count();
    // Since loadAppState hasn't been called, the list should be empty
    expect(items).toBe(0);
});
