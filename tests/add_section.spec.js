const { test, expect } = require('@playwright/test');

test.describe('addSection functionality', () => {

  test('should add a section in Home mode', async ({ page }) => {
    await page.goto('http://localhost:3000#');

    // Seed state: Home mode, empty list
    await page.evaluate(() => {
      const listId = Date.now().toString();
      const state = {
        lists: [{
          id: listId,
          name: 'Test List',
          theme: 'var(--theme-blue)',
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

    // Ensure we are in Home mode
    await expect(page.locator('#toolbar-mode')).not.toHaveClass(/active/);

    // Ensure edit mode is ON
    const reorderBtn = page.locator('#toolbar-reorder');
    if (!await reorderBtn.evaluate(el => el.classList.contains('active'))) {
        await reorderBtn.click();
    }
    await expect(reorderBtn).toHaveClass(/active/);

    // Verify initial state: no sections
    await expect(page.locator('.section-container')).toHaveCount(0);

    // Add a section
    const addSectionInput = page.locator('.add-section-input');
    await addSectionInput.fill('Produce');
    await addSectionInput.press('Enter');

    // Verify section was added
    await expect(page.locator('.section-container')).toHaveCount(1);
    await expect(page.locator('.section-container .section-title').first()).toHaveText('Produce');
  });

  test('should add a section in Shop mode', async ({ page }) => {
    await page.goto('http://localhost:3000#');

    // Seed state: Shop mode, empty list
    await page.evaluate(() => {
      const listId = Date.now().toString();
      const state = {
        lists: [{
          id: listId,
          name: 'Test List',
          theme: 'var(--theme-blue)',
          homeSections: [],
          shopSections: [],
          items: []
        }],
        currentListId: listId
      };
      localStorage.setItem('grocery-app-state', JSON.stringify(state));
      localStorage.setItem('grocery-mode', 'shop');
      localStorage.setItem('grocery-edit-mode', 'true');
    });
    await page.reload();

    // Switch to Shop mode if not already there
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

    // Verify initial state: no sections
    await expect(page.locator('.section-container')).toHaveCount(0);

    // Add a section
    const addSectionInput = page.locator('.add-section-input');
    await addSectionInput.fill('Aisle 1');
    await addSectionInput.press('Enter');

    // Verify section was added
    await expect(page.locator('.section-container')).toHaveCount(1);
    await expect(page.locator('.section-container .section-title').first()).toHaveText('Aisle 1');
  });

  test('should not add a section with empty or whitespace name', async ({ page }) => {
    await page.goto('http://localhost:3000#');

    // Seed state: Home mode, empty list
    await page.evaluate(() => {
      const listId = Date.now().toString();
      const state = {
        lists: [{
          id: listId,
          name: 'Test List',
          theme: 'var(--theme-blue)',
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

    // Ensure edit mode is ON
    const reorderBtn = page.locator('#toolbar-reorder');
    if (!await reorderBtn.evaluate(el => el.classList.contains('active'))) {
        await reorderBtn.click();
    }
    await expect(reorderBtn).toHaveClass(/active/);

    // Verify initial state: no sections
    await expect(page.locator('.section-container')).toHaveCount(0);

    // Attempt to add a section with empty name
    const addSectionInput = page.locator('.add-section-input');
    await addSectionInput.fill('');
    await addSectionInput.press('Enter');

    // Verify no section was added
    await expect(page.locator('.section-container')).toHaveCount(0);

    // Attempt to add a section with only spaces
    await addSectionInput.fill('   ');
    await addSectionInput.press('Enter');

    // Verify no section was added
    await expect(page.locator('.section-container')).toHaveCount(0);
  });
});
