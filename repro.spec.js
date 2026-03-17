
import { test, expect } from '@playwright/test';

test('capture current state', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Wait for app to load
  await page.waitForSelector('.app-container');

  // Seed some items if empty
  await page.evaluate(() => {
    localStorage.setItem('grocery-app-state', JSON.stringify({
      lists: [{
        id: 'test-list',
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [
          { id: '1', text: 'Apples', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 0, shopIndex: 0, haveCount: 2, wantCount: 5, shopCompleted: false },
          { id: '2', text: 'Milk', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 1, shopIndex: 1, haveCount: 0, wantCount: 1, shopCompleted: false }
        ]
      }],
      currentListId: 'test-list'
    }));
    window.location.reload();
  });

  await page.waitForSelector('.grocery-item');

  // Screenshot Home Mode
  await page.screenshot({ path: 'home-mode.png' });

  // Switch to Shop Mode
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500); // Wait for transition
  await page.screenshot({ path: 'shop-mode.png' });

  // Turn on Edit Mode in Shop Mode
  await page.click('#toolbar-reorder');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'shop-mode-edit.png' });
});
