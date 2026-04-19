const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('reproduce drag target glitch at far left', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.setViewportSize({ width: 375, height: 667 });

  // Setup state with several items
  const listId = 'list-1';
  const state = {
    lists: [{
      id: listId,
      name: 'Test List',
      theme: 'var(--theme-blue)',
      homeSections: [{ id: 'sec-h-1', name: 'Section 1' }],
      shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
      items: [
        { id: 'item-1', text: 'Item 1', homeSectionId: 'sec-h-1', shopSectionId: 'sec-s-def', homeIndex: 0, shopIndex: 0, haveCount: 0, wantCount: 1, shopCompleted: false },
        { id: 'item-2', text: 'Item 2', homeSectionId: 'sec-h-1', shopSectionId: 'sec-s-def', homeIndex: 1, shopIndex: 1, haveCount: 0, wantCount: 1, shopCompleted: false },
        { id: 'item-3', text: 'Item 3', homeSectionId: 'sec-h-1', shopSectionId: 'sec-s-def', homeIndex: 2, shopIndex: 2, haveCount: 0, wantCount: 1, shopCompleted: false }
      ]
    }],
    currentListId: listId
  };
  await setMockState(page, { ...state, mode: 'home', editMode: true });

  await page.waitForSelector('.grocery-item[data-id="item-1"]');

  const item1 = page.locator('.grocery-item[data-id="item-1"]');
  const item3 = page.locator('.grocery-item[data-id="item-3"]');

  const handle1 = item1.locator('.drag-handle');
  const box1 = await handle1.boundingBox();
  const box3 = await item3.boundingBox();

  // Start drag on item 1 handle
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2);
  await page.mouse.down();

  // Move slightly to trigger drag start
  await page.mouse.move(box1.x + box1.width / 2, box1.y + box1.height / 2 + 10);

  // Wait for placeholder to appear
  await expect(page.locator('.drag-placeholder')).toBeVisible();

  // Now move to the far left (x=2), but at the Y of item 3
  await page.mouse.move(2, box3.y + box3.height / 2);

  // In a glitchy scenario, the placeholder will NOT move to item 3's position
  // because document.elementFromPoint(2, y) won't hit an item.

  // Wait a bit for any RAF to fire
  await page.waitForTimeout(200);

  // Check placeholder position. It should be near item 3.
  // We can check the sibling of the placeholder.
  const placeholder = page.locator('.drag-placeholder');

  // If it's still before item 1, it didn't move.
  // We expect it to be near item 3 (either before or after it).

  const phBox = await placeholder.boundingBox();
  console.log(`Placeholder Y: ${phBox.y}, Item 3 Y: ${box3.y}`);

  // If glitching, phBox.y should be near box1.y (approx 66px from top usually)
  // item 3 is at approx 66 + 50 + 50 = 166.

  expect(phBox.y).toBeGreaterThan(box3.y - 50);
});
