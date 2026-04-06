const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__MOCK_LOGIN__('test@example.com');
  });
  await expect(page.locator('#sync-modal-overlay')).not.toBeVisible();
  await page.reload();
  await page.reload();
});

test('X button should be hidden and move button shown when items are selected in shop mode', async ({ page }) => {
  // Use evaluate to set state directly
  await page.evaluate(async () => {
      const listId = Date.now().toString();
      const state = {
          lists: [{
              id: listId,
              name: 'Test List',
              theme: 'var(--theme-blue)',
              homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
              shopSections: [
                  { id: 'sec-s-def', name: 'Uncategorized' },
                  { id: 'sec-s-2', name: 'Produce' }
              ],
              items: [
                  { id: '1', text: 'Apples', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 0, shopIndex: 0, haveCount: 0, wantCount: 1, shopCompleted: false },
                  { id: '2', text: 'Bananas', homeSectionId: 'sec-h-def', shopSectionId: 'sec-s-def', homeIndex: 1, shopIndex: 1, haveCount: 0, wantCount: 1, shopCompleted: false }
              ]
          }],
          currentListId: listId,
          updatedAt: Date.now()
      };
      localStorage.setItem('grocery-app-state', JSON.stringify(state));
      localStorage.setItem('grocery-mode', 'shop');
      localStorage.setItem('grocery-edit-mode', 'false');
  });

  await page.reload();
  await page.evaluate(async () => window.dispatchEvent(new CustomEvent('mock-login', { detail: { email: 'test@example.com' } })));
  await expect(page.locator('#sync-modal-overlay')).not.toBeVisible();
  await page.reload();
  await page.reload();

  // 1. Enter selection mode by clicking Apples
  const applesChip = page.locator('.shop-chip', { hasText: 'Apples' });
  await applesChip.click();

  // Verify selection mode active (X button hidden via CSS)
  const xButton = page.locator('.section-delete-btn').first();
  const moveButton = page.locator('.move-here-btn').first();

  // Check opacity and pointer-events as enforced by the CSS rules
  await expect(xButton).toHaveCSS('opacity', '0');
  await expect(xButton).toHaveCSS('pointer-events', 'none');

  // Move button should be visible
  await expect(moveButton).toHaveCSS('opacity', '1');
  await expect(moveButton).toHaveCSS('pointer-events', 'auto');

  // 2. Deselect Apples - selection mode should end
  await applesChip.click();

  // X button should return
  await expect(xButton).toHaveCSS('opacity', '1');
  await expect(moveButton).toHaveCSS('opacity', '0');
});
