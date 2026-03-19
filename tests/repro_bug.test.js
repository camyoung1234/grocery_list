const { test, expect } = require('@playwright/test');

test('Clicking on item name in Shop mode toggles completion', async ({ page }) => {
  await page.goto('http://localhost:3000#');

  // Seed state: One item, Shop mode, Edit mode OFF
  await page.evaluate(() => {
    const listId = Date.now().toString();
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
        shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
        items: [{
            id: 'item-1',
            text: 'Test Item',
            homeSectionId: 'sec-h-1',
            shopSectionId: 'sec-s-1',
            homeIndex: 0,
            shopIndex: 0,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
        }]
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'shop');
    localStorage.setItem('grocery-edit-mode', 'false');
  });
  await page.reload();

  // If restore modal is visible, click cancel
  const cancelBtn = page.locator('#restore-cancel-btn');
  if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
  }

  // Ensure we are in Shop mode
  await expect(page.locator('#toolbar-mode')).toHaveClass(/active/);

  const itemText = page.locator('.grocery-item.shop-chip .item-text');
  await expect(itemText).toHaveText('Test Item');

  // Check that it's NOT completed
  const itemRow = page.locator('.grocery-item.shop-chip');
  await expect(itemRow).not.toHaveClass(/completed/);

  // Click on the item name
  await itemText.click();

  // It should become completed (after animation)
  // The toggleShopCompleted has some timeouts, so we might need to wait
  await expect(itemRow).toHaveClass(/completed/, { timeout: 5000 });
});
