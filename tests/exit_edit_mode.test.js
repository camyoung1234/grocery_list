const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('switching mode preserves edit mode', async ({ page }) => {

  // Seed the state: in home mode with edit mode ON
  await setMockState(page, { mode: 'home', editMode: true });

  const reorderBtn = page.locator('#toolbar-reorder');
  await expect(reorderBtn).toHaveClass(/active/);

  // Switch to Shop mode
  const modeBtn = page.locator('#toolbar-mode');
  await modeBtn.click();

  // Edit mode should be preserved
  await expect(reorderBtn).toHaveClass(/active/);

  const editModePersisted = await page.evaluate(() => window.__MOCK_FIREBASE_STATE__.editMode);
  expect(editModePersisted).toBe(true);

  // Switch back to Home mode
  await modeBtn.click();
  await expect(reorderBtn).toHaveClass(/active/);

  const editModePersistedAgain = await page.evaluate(() => window.__MOCK_FIREBASE_STATE__.editMode);
  expect(editModePersistedAgain).toBe(true);
});
