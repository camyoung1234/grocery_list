const { test, expect } = require('@playwright/test');
const path = require('path');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
});

test('Double tap on item in Shop mode should NOT trigger inline edit', async ({ page }) => {
  await page.evaluate(() => {
    const listId = 'test-list-1';
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
    localStorage.setItem('grocery-edit-mode', 'true');
  });
  await page.reload();

  const cancelBtn = page.locator('#restore-cancel-btn');
  if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
  }

  const itemText = page.locator('.grocery-item.shop-chip .item-text');
  await expect(itemText).toBeVisible();

  await expect(page.locator('#toolbar-reorder')).toHaveClass(/active/);

  // Perform double click
  await itemText.dblclick();

  // Check if inline edit input appears.
  const inlineInput = page.locator('.inline-edit-input');

  // IT SHOULD NOW BE HIDDEN
  await expect(inlineInput).not.toBeVisible();
});
