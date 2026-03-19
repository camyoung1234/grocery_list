const { test, expect } = require('@playwright/test');

test('switching mode preserves edit mode', async ({ page }) => {
  await page.goto('http://localhost:3000#');

  // Seed the state: in home mode with edit mode ON
  await page.evaluate(() => {
    localStorage.setItem('grocery-edit-mode', 'true');
    localStorage.setItem('grocery-mode', 'home');
  });

  await page.reload();

  const reorderBtn = page.locator('#toolbar-reorder');
  await expect(reorderBtn).toHaveClass(/active/);

  // Switch to Shop mode
  const modeBtn = page.locator('#toolbar-mode');
  await modeBtn.click();

  // Edit mode should be preserved
  await expect(reorderBtn).toHaveClass(/active/);

  const editModePersisted = await page.evaluate(() => localStorage.getItem('grocery-edit-mode'));
  expect(editModePersisted).toBe('true');

  // Switch back to Home mode
  await modeBtn.click();
  await expect(reorderBtn).toHaveClass(/active/);

  const editModePersistedAgain = await page.evaluate(() => localStorage.getItem('grocery-edit-mode'));
  expect(editModePersistedAgain).toBe('true');
});
