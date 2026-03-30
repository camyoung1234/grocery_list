const { test, expect } = require('@playwright/test');

test('compare input field offsets between home and shop modes', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Ensure we are in a clean state with some items
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload();

  // Add an item
  await page.fill('.add-item-input', 'Test Item');
  await page.keyboard.press('Enter');

  // Home Mode Standard View (Edit mode is ON by default in this app apparently, let's check)
  // Memory says "editMode = true" is default in init().
  // "toolbarReorderBtn" toggles it.

  // Wait for item to appear
  await expect(page.locator('.grocery-item .item-text')).toHaveText('Test Item');

  // Get position of quantity input in Home Mode (Standard View)
  // Need to ensure we are in Standard View (hide-drag-handles)
  const isEditMode = await page.evaluate(() => document.querySelector('.app-container').classList.contains('hide-drag-handles') === false);
  if (isEditMode) {
    await page.click('#toolbar-reorder');
  }
  await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

  const homeInput = page.locator('.have-stepper .qty-input');
  const homeBox = await homeInput.boundingBox();
  console.log('Home Mode Input Box:', homeBox);

  // Switch to Shop Mode and enter Edit Mode to see inputs
  await page.click('#toolbar-mode');
  await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);

  const isShopEditMode = await page.evaluate(() => document.querySelector('.app-container').classList.contains('hide-drag-handles') === false);
  if (!isShopEditMode) {
    await page.click('#toolbar-reorder');
  }
  await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

  const shopInput = page.locator('.want-stepper .qty-input');
  const shopBox = await shopInput.boundingBox();
  console.log('Shop Mode Input Box:', shopBox);

  // Take screenshots
  await page.screenshot({ path: 'home-mode-input.png' });
  await page.click('#toolbar-mode'); // back to home for reference? No, I want both.

  // Just log the difference
  if (homeBox && shopBox) {
    const diff = homeBox.x - shopBox.x;
    console.log(`Difference in X offset: ${diff}px`);
  }
});
