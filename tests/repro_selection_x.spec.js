const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await mockFirebase(page);
  await page.goto('http://localhost:3000');
  // Clear any existing state
  const state = {
        lists: [{
            id: 'list-1',
            name: 'Test List',
            theme: 'var(--theme-blue)',
            homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }, { id: 'sec-h-1', name: 'Fruit' }],
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }, { id: 'sec-s-1', name: 'Produce' }],
            items: [{
                id: 'item-1',
                text: 'Apple',
                homeSectionId: 'sec-h-1',
                shopSectionId: 'sec-s-1',
                homeIndex: 0,
                shopIndex: 0,
                haveCount: 0,
                wantCount: 1,
                shopCompleted: false
            }]
        }],
        currentListId: 'list-1'
    };
await setMockState(page, { ...state, mode: 'shop', editMode: true });

  // 1. Verify we are in Shop Mode and Edit Mode
  await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
  await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

  // 2. Verify X button is visible initially on the "Produce" section
  const secDeleteBtn = page.locator('.section-header:has-text("Produce") .section-delete-btn');
  await expect(secDeleteBtn).toBeVisible();

  // Poll for opacity to handle transition
  await expect.poll(async () => {
    return await secDeleteBtn.evaluate(el => getComputedStyle(el).opacity);
  }).toBe("1");

  // 3. Select the item "Apple"
  // Click on the text part to select
  await page.click('.grocery-item:has-text("Apple") .item-text');

  // Wait for transitions
  await page.waitForTimeout(500);

  // 4. Check opacities
  const moveHereBtn = page.locator('.section-header:has-text("Produce") .move-here-btn');

  const secDeleteOpacity = await secDeleteBtn.evaluate(el => getComputedStyle(el).opacity);
  const moveHereOpacity = await moveHereBtn.evaluate(el => getComputedStyle(el).opacity);

  console.log(`Section Delete Opacity: ${secDeleteOpacity}`);
  console.log(`Move Here Opacity: ${moveHereOpacity}`);

  // After fix, secDeleteOpacity should be 0.
  expect(parseFloat(secDeleteOpacity)).toBeLessThan(0.1);
  expect(parseFloat(moveHereOpacity)).toBeGreaterThan(0.9);

  // 5. Deselect the item
  await page.click('.grocery-item:has-text("Apple") .item-text');
  await page.waitForTimeout(500);

  const secDeleteOpacityFinal = await secDeleteBtn.evaluate(el => getComputedStyle(el).opacity);
  const moveHereOpacityFinal = await moveHereBtn.evaluate(el => getComputedStyle(el).opacity);

  console.log(`Final Section Delete Opacity: ${secDeleteOpacityFinal}`);
  console.log(`Final Move Here Opacity: ${moveHereOpacityFinal}`);

  expect(parseFloat(secDeleteOpacityFinal)).toBeGreaterThan(0.9);
  expect(parseFloat(moveHereOpacityFinal)).toBeLessThan(0.1);
});
