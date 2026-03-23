const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Stepper remains expanded after incrementing wanted quantity', async ({ page }) => {
  await page.evaluate(() => {
    const listId = 'list-1';
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-1', name: 'Uncategorized' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [{
          id: 'item-1',
          text: 'Milk',
          homeSectionId: 'sec-1',
          shopSectionId: 'sec-s-def',
          homeIndex: 0,
          shopIndex: 0,
          haveCount: 0,
          wantCount: 1,
          shopCompleted: false
        }]
      }],
      currentListId: listId,
      sharedWantSynced: true
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-edit-mode', 'false'); // This makes .hide-drag-handles true, revealing controls
    window.location.reload();
  });

  // Verify Edit Mode is OFF (Home Mode uses Edit Mode OFF to show controls)
  const appContainer = page.locator('.app-container');
  await expect(appContainer).toHaveClass(/hide-drag-handles/);

  const milkRow = page.locator('.grocery-item:has-text("Milk")');
  const wantPart = milkRow.locator('.want-part');

  // 1. Expand the 'want' part
  await wantPart.click();
  await expect(wantPart).toHaveClass(/expanded/);

  // 2. Click the plus button to increment
  const plusBtn = wantPart.locator('.plus');
  await plusBtn.click();

  // 3. Verify quantity incremented
  await expect(wantPart.locator('.qty-val')).toHaveText('2');

  // 4. Verify stepper remains expanded
  await expect(wantPart).toHaveClass(/expanded/);
});
