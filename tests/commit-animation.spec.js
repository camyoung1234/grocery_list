const { test, expect } = require('@playwright/test');

test('Item checking behavior (no commit)', async ({ page }) => {
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  await page.goto('http://localhost:3000#');

  // Seed state: One item, Shop mode, Edit mode OFF
  await page.evaluate(() => {
    const listId = 'list-1';
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [{
          id: 'item-1',
          text: 'Milk',
          homeSectionId: 'sec-h-def',
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
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'shop');
    localStorage.setItem('grocery-edit-mode', 'false');
    window.location.reload();
  });

  const item = page.locator('.grocery-item[data-id="item-1"]');
  await expect(item).toBeVisible();

  // Click to complete
  await item.click();

  // Wait for flare (approx 400ms)
  await page.waitForTimeout(600);

  // Check if .completed is applied
  await expect(item).toHaveClass(/completed/);
  await expect(item).not.toHaveClass(/is-committing/);

  // Item should still be visible (no more disappearing)
  await page.waitForTimeout(1000);
  await expect(item).toBeVisible();

  // Switch to Home mode and verify haveCount remains 0 (checking in Shop doesn't change Have)
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500); // Animation

  const haveCount = page.locator('.have-stepper .qty-input');
  await expect(haveCount).toHaveValue('0');

  // Switch back to Shop
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500);

  // Uncheck it
  await item.click();
  await page.waitForTimeout(1000); // Increased timeout to ensure re-render happens
  await expect(item).not.toHaveClass(/completed/);

  // Verify haveCount is still 0 in Home mode
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500);
  await expect(haveCount).toHaveValue('0');
});
