const { test, expect } = require('./test-utils');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('undoDeleteItem undoes pending deletion and removes the item from pending list', async ({ page }) => {
  // Seed the state: in home mode with edit mode ON
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
          text: 'Apple',
          homeSectionId: 'sec-1',
          shopSectionId: 'sec-s-def',
          homeIndex: 0,
          shopIndex: 0,
          haveCount: 0,
          wantCount: 1,
          shopCompleted: false,
          pendingDelete: false
        }]
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-edit-mode', 'true');
  });

  // Install the clock to manipulate time
  await page.clock.install();

  await page.reload();

  // Find the item delete button and click it
  const deleteBtn = page.locator('.grocery-item[data-id="item-1"] .item-delete-btn');
  await deleteBtn.click();

  // The item should now have pendingDelete state, which might be visually indicated
  // e.g. an undo button might appear, and text may have a strikethrough or opacity change.
  // Wait for undo button to be visible.
  const undoBtn = page.locator('.grocery-item[data-id="item-1"] .undo-btn-inline');
  await expect(undoBtn).toBeVisible();

  const itemLocator = page.locator('.grocery-item[data-id="item-1"]');
  await expect(itemLocator).toHaveClass(/undo-row/);

  // Click undo button
  await undoBtn.click();

  // Undo button should disappear, and pending delete class should be removed
  await expect(undoBtn).not.toBeVisible();
  await expect(itemLocator).not.toHaveClass(/undo-row/);

  // Fast forward 5.5 seconds (the timeout length) to make sure the item isn't deleted later
  await page.clock.fastForward(5500);

  // Ensure the item still exists
  await expect(itemLocator).toBeVisible();
});
