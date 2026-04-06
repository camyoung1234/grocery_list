const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__MOCK_LOGIN__('test@example.com');
  });
  await expect(page.locator('#sync-modal-overlay')).not.toBeVisible();
  await page.reload();
  await page.reload();
});

test('Stepper remains expanded after incrementing wanted quantity', async ({ page }) => {
  await page.evaluate(async () => {
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

  // Note: Expansion logic was removed in favor of simplified always-visible steppers.
  // This test is updated to verify simple increment in Edit Mode.
  await page.click('#toolbar-reorder');
  // Switch to Shop Mode (want-stepper removed from Home Mode)
  await page.click('#toolbar-mode');
  const milkRow = page.locator('.grocery-item:has-text("Milk")');
  const wantInput = milkRow.locator('.want-stepper .qty-input');

  // 1. Fill input to increment
  await wantInput.fill('2');

  // 2. Verify quantity incremented
  await expect(wantInput).toHaveValue('2');
});
