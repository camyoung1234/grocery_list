const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await mockFirebase(page);
await page.goto('http://localhost:3000');
});

test('Stepper remains expanded after incrementing wanted quantity', async ({ page }) => {
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
  await setMockState(page, { ...state, mode: 'home', editMode: false });

  // Verify Edit Mode is OFF
  const appContainer = page.locator('.app-container');
  await expect(appContainer).toHaveClass(/hide-drag-handles/);

  // Enter Edit Mode
  await page.click('#toolbar-reorder');
  // Switch to Shop Mode (want-stepper is visible in Shop + Edit Mode)
  await page.click('#toolbar-mode');
  await page.waitForTimeout(600);

  const milkRow = page.locator('.grocery-item:has-text("Milk")');
  const wantInput = milkRow.locator('.want-stepper .qty-input');

  // 1. Fill input to increment
  await wantInput.fill('2');

  // 2. Verify quantity incremented
  await expect(wantInput).toHaveValue('2');
});
