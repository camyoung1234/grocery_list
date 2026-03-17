
import { test, expect } from '@playwright/test';

test('verify counters in home and shop mode', async ({ page }) => {
  await page.goto('http://localhost:3000');

  await page.goto('http://localhost:3000#');

  // Seed some items
  await page.evaluate(() => {
    localStorage.setItem('grocery-app-state', JSON.stringify({
      lists: [{
        id: 'test-list',
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [
          { id: '1', text: 'Apples', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 0, shopIndex: 0, haveCount: 2, wantCount: 5, shopCompleted: false }
        ]
      }],
      currentListId: 'test-list'
    }));
    localStorage.setItem('grocery-edit-mode', 'false');
    localStorage.setItem('grocery-mode', 'home');
    window.location.reload();
  });
  await page.waitForSelector('.grocery-item');

  // 1. Verify Home mode: Exit edit mode to see the counter
  // Note: editMode defaults to true but switchMode(newMode, true) sets it to false.
  // Actually, init() reads it from localStorage or defaults to true.
  await page.waitForSelector('.grocery-item');

  // Home mode should show only ONE qty-part (have)
  const homeControls = page.locator('.grocery-item .quantity-controls');
  await expect(homeControls).toBeVisible();
  const havePart = homeControls.locator('.have-part');
  const wantPart = homeControls.locator('.want-part');
  await expect(havePart).toBeVisible();
  await expect(wantPart).not.toBeVisible();

  // 2. Switch to Shop mode
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500); // Wait for transition

  // Shop mode (not editing) should have no counters visible
  const shopControls = page.locator('.grocery-item .quantity-controls');
  await expect(shopControls.first()).not.toBeVisible();

  // 3. Turn on Edit Mode in Shop Mode
  await page.click('#toolbar-reorder');
  await page.waitForTimeout(1000);

  // Shop mode (editing) should show ONLY the want counter
  await expect(shopControls.first()).toHaveCSS('width', '52px');
  const shopWantPart = shopControls.locator('.want-part');
  const shopHavePart = shopControls.locator('.have-part');
  await expect(shopWantPart).toBeVisible();
  await expect(shopHavePart).not.toBeVisible();

  // 4. Verify quantity update works in Shop Edit mode
  await shopWantPart.click(); // Expand it
  await page.waitForTimeout(300);
  await shopWantPart.locator('.plus').click();
  await page.waitForTimeout(300);

  const wantVal = await shopWantPart.locator('.qty-val').textContent();
  expect(wantVal).toBe('6');

  // 5. Verify Shop mode display (not editing) updates correctly
  await page.click('#toolbar-reorder'); // Turn off edit mode
  await page.waitForTimeout(300);

  // toBuy should be wantCount (6) - haveCount (2) = 4
  const shopQtyCircle = page.locator('.shop-qty-circle .qty-number');
  await expect(shopQtyCircle).toHaveText('4');
});
