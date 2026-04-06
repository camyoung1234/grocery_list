const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
});

test('Double tap on current list name should trigger rename list modal and save', async ({ page }) => {
  await page.evaluate(() => {
    const listId = 'test-list-1';
    const state = {
      lists: [{
        id: listId,
        name: 'Original List Name',
        theme: 'var(--theme-blue)',
        accent: 'var(--theme-amber)',
        homeSections: [],
        shopSections: [],
        items: []
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'home');
    localStorage.setItem('grocery-edit-mode', 'true');
  });
  await page.reload();

  const cancelBtn = page.locator('#restore-cancel-btn');
  if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
  }

  const currentListName = page.locator('#current-list-name');
  await expect(currentListName).toHaveText('Original List Name');

  // Need to evaluate double tap because the custom logic looks for element.dataset.id or something similar.
  // Wait, let's just trigger double click via evaluate on the element.
  await currentListName.evaluate(node => {
      // simulate double tap
      node.click();
      setTimeout(() => node.click(), 50);
  });

  // Verify modal appears
  const modalOverlay = page.locator('#modal-overlay');
  await expect(modalOverlay).toBeVisible();

  const modalInput = page.locator('#modal-input');
  await expect(modalInput).toHaveValue('Original List Name');

  // Change the name
  await modalInput.fill('Updated List Name');

  // Save the changes
  const saveBtn = page.locator('#modal-save-btn');
  await saveBtn.click();

  // Wait for modal to disappear
  await expect(modalOverlay).not.toBeVisible();

  // Verify UI is updated
  await expect(currentListName).toHaveText('Updated List Name');

  // Verify localStorage is updated
  const updatedState = await page.evaluate(() => {
    return JSON.parse(localStorage.getItem('grocery-app-state'));
  });

  expect(updatedState.lists[0].name).toBe('Updated List Name');
});

test('Rename list and cancel should not modify the list', async ({ page }) => {
  await page.evaluate(() => {
    const listId = 'test-list-2';
    const state = {
      lists: [{
        id: listId,
        name: 'Another List Name',
        theme: 'var(--theme-blue)',
        accent: 'var(--theme-amber)',
        homeSections: [],
        shopSections: [],
        items: []
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'home');
    localStorage.setItem('grocery-edit-mode', 'true');
  });
  await page.reload();

  const cancelBtn = page.locator('#restore-cancel-btn');
  if (await cancelBtn.isVisible()) {
      await cancelBtn.click();
  }

  const currentListName = page.locator('#current-list-name');
  await expect(currentListName).toHaveText('Another List Name');

  await currentListName.evaluate(node => {
      node.click();
      setTimeout(() => node.click(), 50);
  });

  const modalOverlay = page.locator('#modal-overlay');
  await expect(modalOverlay).toBeVisible();

  const modalInput = page.locator('#modal-input');
  await modalInput.fill('Discarded Name Change');

  // Cancel the changes
  const modalCancelBtn = page.locator('#modal-cancel-btn');
  await modalCancelBtn.click();

  await expect(modalOverlay).not.toBeVisible();

  // Verify UI is not changed
  await expect(currentListName).toHaveText('Another List Name');

  // Verify localStorage is not changed
  const updatedState = await page.evaluate(() => {
    return JSON.parse(localStorage.getItem('grocery-app-state'));
  });

  expect(updatedState.lists[0].name).toBe('Another List Name');
});
