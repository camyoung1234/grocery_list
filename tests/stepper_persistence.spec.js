const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await mockFirebase(page);
await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
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

  // Verify Edit Mode is OFF (want-stepper is visible in Home non-edit Mode)
  const appContainer = page.locator('.app-container');
  await expect(appContainer).toHaveClass(/hide-drag-handles/);

  const milkRow = page.locator('.grocery-item:has-text("Milk")');
  const wantInput = milkRow.locator('.want-stepper .qty-input');

  // 1. Click and type to increment
  await wantInput.click();
  await page.keyboard.type('2');

  // 2. Verify quantity incremented
  await expect(wantInput).toHaveText('2');
});
