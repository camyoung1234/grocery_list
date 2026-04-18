const { mockFirebase } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test.describe('Edit Outside Edit Mode in Home Mode', () => {

  test.beforeEach(async ({ page }) => {
    const listId = 'list-1';
    const state = {
        lists: [{
          id: listId,
          name: 'Test List',
          theme: 'var(--theme-blue)',
          homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
          shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
          items: [
            {
              id: 'item-1',
              text: 'Apple',
              homeSectionId: 'sec-h-1',
              shopSectionId: 'sec-s-1',
              homeIndex: 0,
              shopIndex: 0,
              haveCount: 0,
              wantCount: 1,
              shopCompleted: false
            }
          ]
        }],
        currentListId: listId,
        mode: 'home',
        editMode: false
      };
    await mockFirebase(page, state);
    await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
    await page.goto('http://localhost:3000');

    const cancelBtn = page.locator('#restore-cancel-btn');
    if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
    }
  });

  test('Single tap shows controls, subsequent tap on name starts editing', async ({ page }) => {
    const item1 = page.locator('.grocery-item[data-id="item-1"]');
    const item1Text = item1.locator('.item-text');
    const dragHandle = item1.locator('.drag-handle');
    const deleteBtn = item1.locator('.item-delete-btn');
    const stepper = item1.locator('.have-stepper');

    // Initially, controls should be hidden (via .hide-drag-handles on container)
    // and stepper should be visible (as per existing CSS for home-mode.hide-drag-handles)
    await expect(dragHandle).not.toBeVisible();
    await expect(deleteBtn).not.toBeVisible();
    await expect(stepper).toBeVisible();

    // Single tap on the item
    await item1.click();

    // Now controls should be visible and stepper hidden
    await expect(dragHandle).toBeVisible();
    await expect(deleteBtn).toBeVisible();
    await expect(stepper).not.toBeVisible();

    // Tap on the name to start editing
    await item1Text.click();

    const inlineInput = page.locator('.inline-edit-input');
    await expect(inlineInput).toBeVisible();
    await expect(inlineInput).toHaveValue('Apple');

    // Type new name and press Enter
    await inlineInput.fill('Green Apple');
    await inlineInput.press('Enter');

    // Check if new name is saved and visible, and controls are hidden again (due to renderList)
    await expect(inlineInput).not.toBeVisible();
    await expect(item1Text).toHaveText('Green Apple');
    await expect(dragHandle).not.toBeVisible();
    await expect(stepper).toBeVisible();
  });

  test('Tapping outside hides controls', async ({ page }) => {
    const item1 = page.locator('.grocery-item[data-id="item-1"]');
    const dragHandle = item1.locator('.drag-handle');

    // Single tap to show controls
    await item1.click();
    await expect(dragHandle).toBeVisible();

    // Tap on the background (body)
    await page.click('body', { position: { x: 0, y: 0 } });

    // Controls should be hidden
    await expect(dragHandle).not.toBeVisible();
  });

  test('Tapping another item switches controls', async ({ page }) => {
    // Re-mock with two items from the start to avoid reload/sync issues in this test
    const listId = 'list-1';
    const state = {
        lists: [{
          id: listId,
          name: 'Test List',
          theme: 'var(--theme-blue)',
          homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
          shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
          items: [
            {
              id: 'item-1',
              text: 'Apple',
              homeSectionId: 'sec-h-1',
              shopSectionId: 'sec-s-1',
              homeIndex: 0,
              shopIndex: 0,
              haveCount: 0,
              wantCount: 1,
              shopCompleted: false
            },
            {
              id: 'item-2',
              text: 'Banana',
              homeSectionId: 'sec-h-1',
              shopSectionId: 'sec-s-1',
              homeIndex: 1,
              shopIndex: 1,
              haveCount: 0,
              wantCount: 1,
              shopCompleted: false
            }
          ]
        }],
        currentListId: listId,
        mode: 'home',
        editMode: false
      };
    await mockFirebase(page, state);
    await page.goto('http://localhost:3000');

    const item1 = page.locator('.grocery-item[data-id="item-1"]');
    const item2 = page.locator('.grocery-item[data-id="item-2"]');

    await item1.click();
    await expect(item1.locator('.drag-handle')).toBeVisible();
    await expect(item2.locator('.drag-handle')).not.toBeVisible();

    await item2.click();
    await expect(item1.locator('.drag-handle')).not.toBeVisible();
    await expect(item2.locator('.drag-handle')).toBeVisible();
  });
});
