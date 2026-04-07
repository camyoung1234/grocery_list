const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test.describe('startInlineItemEdit in Home Mode', () => {

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
            },
            {
              id: 'item-2',
              text: 'Banana',
              homeSectionId: 'sec-h-1',
              shopSectionId: 'sec-s-1',
              homeIndex: 1,
              shopIndex: 1,
              haveCount: 0,
              wantCount: 5,
              shopCompleted: false
            }
          ]
        }],
        currentListId: listId,
        mode: 'home',
        editMode: true
      };
    await mockFirebase(page, state);
    await page.goto('http://localhost:3000');

    const cancelBtn = page.locator('#restore-cancel-btn');
    if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
    }
  });

  test('Happy Path: Edit and save by pressing Enter', async ({ page }) => {
    const item1Text = page.locator('.grocery-item[data-id="item-1"] .item-text');
    await expect(item1Text).toBeVisible();
    await expect(item1Text).toHaveText('Apple');

    // Double click to edit
    await item1Text.click({ clickCount: 2 });

    const inlineInput = page.locator('.inline-edit-input');
    await expect(inlineInput).toBeVisible();
    await expect(inlineInput).toHaveValue('Apple');

    // Type new name and press Enter
    await inlineInput.fill('Green Apple');
    await inlineInput.press('Enter');

    // Check if new name is saved and visible
    await expect(inlineInput).not.toBeVisible();
    await expect(page.locator('.grocery-item[data-id="item-1"] .item-text')).toHaveText('Green Apple');
  });

  test('Cancel Path: Edit and abort by pressing Escape', async ({ page }) => {
    const item1Text = page.locator('.grocery-item[data-id="item-1"] .item-text');
    await expect(item1Text).toBeVisible();
    await expect(item1Text).toHaveText('Apple');

    // Double click to edit
    await item1Text.click({ clickCount: 2 });

    const inlineInput = page.locator('.inline-edit-input');
    await expect(inlineInput).toBeVisible();

    // Type new name but press Escape
    await inlineInput.fill('Green Apple');
    await inlineInput.press('Escape');

    // Check if original name is restored
    await expect(inlineInput).not.toBeVisible();
    await expect(page.locator('.grocery-item[data-id="item-1"] .item-text')).toHaveText('Apple');
  });

  test('Inherit WantCount: Rename item to match another item', async ({ page }) => {
    const item1Text = page.locator('.grocery-item[data-id="item-1"] .item-text');
    await expect(item1Text).toBeVisible();

    // Initial want counts can be checked in local storage
    let state = await page.evaluate(() => window.__MOCK_FIREBASE_STATE__);
    expect(state.lists[0].items.find(i => i.id === 'item-1').wantCount).toBe(1);
    expect(state.lists[0].items.find(i => i.id === 'item-2').wantCount).toBe(5);

    // Double click to edit Apple
    await item1Text.click({ clickCount: 2 });

    const inlineInput = page.locator('.inline-edit-input');
    await expect(inlineInput).toBeVisible();

    // Type name to match Banana
    await inlineInput.fill('Banana');
    await inlineInput.press('Enter');

    // Check if wantCount for item 1 updated to 5 to match item 2 (Banana)
    state = await page.evaluate(() => window.__MOCK_FIREBASE_STATE__);
    const item1 = state.lists[0].items.find(i => i.id === 'item-1');

    expect(item1.text).toBe('Banana');
    expect(item1.wantCount).toBe(5);
  });
});
