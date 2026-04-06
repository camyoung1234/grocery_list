const { test, expect } = require('@playwright/test');

test('Add item rows are NOT visible in shop mode when editing', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__MOCK_LOGIN__('test@example.com');
  });
  await expect(page.locator('#sync-modal-overlay')).not.toBeVisible();
  await page.reload();
  await page.reload();
  await page.evaluate(async () => window.dispatchEvent(new CustomEvent('mock-login', { detail: { email: 'test@example.com' } })));

  // Seed state: Add a section so we have a place for "Add item"
  await page.evaluate(async () => {
    const listId = Date.now().toString();
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
        shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
        items: []
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'shop');
    localStorage.setItem('grocery-edit-mode', 'true');
  });
  await page.reload();

  // If restore modal is visible, click cancel
  const cancelBtn = page.locator('#restore-cancel-btn');
  if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
  }

  // Switch to Shop mode if not already there (should be seeded, but let's be sure)
  const modeBtn = page.locator('#toolbar-mode');
  if (!await modeBtn.evaluate(el => el.classList.contains('active'))) {
    await modeBtn.click();
  }
  await expect(modeBtn).toHaveClass(/active/);

  // Re-enable Edit mode if it was toggled off by mode switch
  const reorderBtn = page.locator('#toolbar-reorder');
  if (!await reorderBtn.evaluate(el => el.classList.contains('active'))) {
      await reorderBtn.click();
  }
  await expect(reorderBtn).toHaveClass(/active/);

  // Check if .add-item-row is hidden (after fix)
  const addItemRow = page.locator('.add-item-row');
  await expect(addItemRow).not.toBeVisible();

  // Check if .add-section-row IS still visible
  const addSectionRow = page.locator('.add-section-row');
  await expect(addSectionRow).toBeVisible();
});

test('Add item rows ARE visible in home mode when editing', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(async () => {
    localStorage.clear();
    await window.__MOCK_LOGIN__('test@example.com');
  });
  await expect(page.locator('#sync-modal-overlay')).not.toBeVisible();
  await page.reload();
  await page.reload();
  await page.evaluate(async () => window.dispatchEvent(new CustomEvent('mock-login', { detail: { email: 'test@example.com' } })));

  // Seed state: Add a section, Home mode, Edit mode ON
  await page.evaluate(async () => {
    const listId = Date.now().toString();
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
        shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
        items: []
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'home');
    localStorage.setItem('grocery-edit-mode', 'true');
  });
  await page.reload();

  // If restore modal is visible, click cancel
  const cancelBtn = page.locator('#restore-cancel-btn');
  if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
  }

  // Ensure we are in Home mode
  await expect(page.locator('#toolbar-mode')).not.toHaveClass(/active/);

  // Verify Edit mode is ON
  const reorderBtn = page.locator('#toolbar-reorder');
  if (!await reorderBtn.evaluate(el => el.classList.contains('active'))) {
      await reorderBtn.click();
  }
  await expect(reorderBtn).toHaveClass(/active/);

  // Check if .add-item-row is visible in Home mode
  const addItemRow = page.locator('.add-item-row');
  await expect(addItemRow.first()).toBeVisible();

  // Check if .add-section-row IS visible
  const addSectionRow = page.locator('.add-section-row');
  await expect(addSectionRow).toBeVisible();
});
