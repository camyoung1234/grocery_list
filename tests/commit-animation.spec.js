const { test, expect } = require('@playwright/test');

test('Commit animation logic and cancellation', async ({ page }) => {
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

  // Wait for flare (0.7s) + some time for commit to start
  await page.waitForTimeout(2000);

  // Check if .is-committing is applied
  await expect(item).toHaveClass(/is-committing/);

  // Check progress variable
  let progress = await item.evaluate(el => parseFloat(el.style.getPropertyValue('--commit-progress')));
  expect(progress).toBeLessThan(1);
  expect(progress).toBeGreaterThan(0);

  // Test cancellation
  await item.click();
  await page.waitForTimeout(100);
  await expect(item).not.toHaveClass(/is-committing/);
  await expect(item).not.toHaveClass(/completed/); // newState false means it goes to is-undoing then back to normal

  // Wait for undo sequence to finish and re-complete
  await page.waitForTimeout(500);
  await item.click();

  // Wait for flare + start commit
  await page.waitForTimeout(1000);
  await expect(item).toHaveClass(/is-committing/);

  // Wait for 4s commit + 0.8s circle + 0.3s collapse
  await page.waitForTimeout(6000);

  // Item should be gone from Shop mode
  await expect(item).not.toBeVisible();

  // Switch to Home mode and verify haveCount
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500); // Animation

  const haveCount = page.locator('.shop-qty-circle .qty-number');
  await expect(haveCount).toHaveText('1');
});
