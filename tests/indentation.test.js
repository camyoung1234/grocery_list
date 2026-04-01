const { test, expect } = require('@playwright/test');

test('verify indentation behavior', async ({ page }) => {
  await page.goto('http://localhost:3000');

  await page.waitForSelector('.bottom-toolbar');

  // Setup state and reload
  await page.evaluate(() => {
    localStorage.clear();
    const listId = 'L1';
    const appState = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-1', name: 'Test Section' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [{
          id: 'item-1',
          text: 'Test Item',
          homeSectionId: 'sec-h-1',
          shopSectionId: 'sec-s-def',
          homeIndex: 0,
          shopIndex: 0,
          haveCount: 0,
          wantCount: 1,
          shopCompleted: false
        }]
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(appState));
    localStorage.setItem('grocery-mode', 'home');
    localStorage.setItem('grocery-edit-mode', 'true');
  });

  await page.goto('http://localhost:3000');

  // Wait for app to render
  const sectionTitle = page.locator('.section-title');
  await sectionTitle.waitFor({ state: 'visible', timeout: 10000 });

  // Helper to get X coordinate
  const getX = async (selector) => {
    const box = await page.locator(selector).first().boundingBox();
    return box.x;
  };

  // --- HOME MODE ---
  console.log('Testing Home Mode...');

  // Verify Edit Mode ON
  await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

  const sectionX_EditOn = await getX('.section-title');
  const itemX_EditOn = await getX('.item-text');

  console.log(`Home Edit ON - Section Title X: ${sectionX_EditOn}, Item Text X: ${itemX_EditOn}`);

  // Titles should align in edit mode
  expect(Math.abs(sectionX_EditOn - itemX_EditOn)).toBeLessThanOrEqual(1);

  // Toggle Edit Mode OFF
  await page.click('#toolbar-reorder');
  await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);
  await page.waitForTimeout(1000);

  const sectionX_EditOff = await getX('.section-title');
  const itemX_EditOff = await getX('.item-text');

  console.log(`Home Edit OFF - Section Title X: ${sectionX_EditOff}, Item Text X: ${itemX_EditOff}`);

  // Both should have moved left to the baseline
  expect(sectionX_EditOff).toBeLessThan(sectionX_EditOn);
  expect(itemX_EditOff).toBeLessThan(itemX_EditOn);

  // Alignment check: they should match in standard view
  expect(Math.abs(sectionX_EditOff - itemX_EditOff)).toBeLessThanOrEqual(1);

  // --- SHOP MODE ---
  console.log('Testing Shop Mode...');
  await page.click('#toolbar-mode');
  await page.waitForTimeout(1000);

  // Switch to Shop Mode defaults to Edit Mode OFF
  await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

  const shopSectionX_EditOff = await getX('.section-title');
  const shopItemX_EditOff = await getX('.item-text');

  console.log(`Shop Edit OFF - Section Title X: ${shopSectionX_EditOff}, Item Text X: ${shopItemX_EditOff}`);

  // Section title moved to edge (0 action), Item text indented for circle (48px action)
  expect(shopSectionX_EditOff).toBeLessThan(shopItemX_EditOff);

  // Toggle Edit Mode ON in Shop Mode
  await page.click('#toolbar-reorder');
  await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);
  await page.waitForTimeout(1000);

  const shopSectionX_EditOn = await getX('.section-title');
  const shopItemX_EditOn = await getX('.item-text');

  console.log(`Shop Edit ON - Section Title X: ${shopSectionX_EditOn}, Item Text X: ${shopItemX_EditOn}`);

  // Both should align when editing (drag handles visible)
  expect(Math.abs(shopSectionX_EditOn - shopItemX_EditOn)).toBeLessThanOrEqual(1);
});
