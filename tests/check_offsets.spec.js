const { test, expect } = require('@playwright/test');

test('compare input field offsets between home and shop modes', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('http://localhost:3000');

  await page.evaluate(() => {
    localStorage.clear();
    const defaultListId = 'test-list';
    const appState = {
        lists: [{
            id: defaultListId,
            name: 'Grocery List',
            theme: 'var(--theme-blue)',
            homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
            items: [{
                id: 'test-item-1',
                text: 'Test Item',
                homeSectionId: 'sec-h-def',
                shopSectionId: 'sec-s-def',
                homeIndex: 0,
                shopIndex: 0,
                haveCount: 0,
                wantCount: 1,
                shopCompleted: false
            }]
        }],
        currentListId: defaultListId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(appState));
    localStorage.setItem('grocery-mode', 'home');
    localStorage.setItem('grocery-edit-mode', 'false');
  });
  await page.reload();

  await page.waitForSelector('.grocery-item .item-text');

  // Home Mode Standard View
  await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);
  await page.waitForTimeout(500); // Wait for transitions

  const homeInput = page.locator('.have-stepper .qty-input');
  await expect(homeInput).toBeVisible();
  const homeBox = await homeInput.boundingBox();
  const homeContainerBox = await page.locator('.app-container').boundingBox();

  // Switch to Shop Mode and enter Edit Mode to see inputs
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500);
  await page.click('#toolbar-reorder');
  await page.waitForTimeout(500);

  await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

  const shopInput = page.locator('.want-stepper .qty-input');
  await expect(shopInput).toBeVisible();
  const shopBox = await shopInput.boundingBox();
  const shopContainerBox = await page.locator('.app-container').boundingBox();

  if (homeBox && shopBox && homeContainerBox && shopContainerBox) {
    const homeRelX = homeBox.x - homeContainerBox.x;
    const shopRelX = shopBox.x - shopContainerBox.x;
    const homeRelRight = (homeContainerBox.x + homeContainerBox.width) - (homeBox.x + homeBox.width);
    const shopRelRight = (shopContainerBox.x + shopContainerBox.width) - (shopBox.x + shopBox.width);

    console.log(`Home relative X: ${homeRelX}px, Relative Right: ${homeRelRight}px, Width: ${homeBox.width}px`);
    console.log(`Shop relative X: ${shopRelX}px, Relative Right: ${shopRelRight}px, Width: ${shopBox.width}px`);

    const diffRight = Math.abs(homeRelRight - shopRelRight);
    console.log(`Difference in relative Right offset: ${diffRight}px`);

    expect(homeBox.width).toBe(48);
    expect(shopBox.width).toBe(48);
    expect(diffRight).toBeLessThanOrEqual(1);
  } else {
    throw new Error('Could not find bounding boxes');
  }
});
