const { test, expect } = require('@playwright/test');
const { mockFirebase, setMockState } = require('./mockFirebase');

test.beforeEach(async ({ page }) => {
  await mockFirebase(page);
  await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
    await page.goto('http://localhost:3000');
});

test('Shared wantCount synchronizes across items with same name', async ({ page }) => {
    const listId = 'list-1';
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [
            { id: 'sec-1', name: 'Sec 1' },
            { id: 'sec-2', name: 'Sec 2' }
        ],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [
          {
            id: 'item-1',
            text: 'Bananas',
            homeSectionId: 'sec-1',
            shopSectionId: 'sec-s-def',
            homeIndex: 0,
            shopIndex: 0,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
          },
          {
            id: 'item-2',
            text: 'Bananas',
            homeSectionId: 'sec-2',
            shopSectionId: 'sec-s-def',
            homeIndex: 0,
            shopIndex: 1,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
          }
        ]
      }],
      currentListId: listId,
      sharedWantSynced: true,
      mode: 'home',
      editMode: false
    };
    await setMockState(page, state);

  const bananaRows = page.locator('.grocery-item:has-text("Bananas")');
  await expect(bananaRows).toHaveCount(2);

  // Switch to Shop Mode to change wantCount
  await page.click('#toolbar-mode');
  await page.click('#toolbar-reorder');

  const firstBanana = bananaRows.first();
  const wantInput = firstBanana.locator('.want-stepper .qty-input');
  await wantInput.fill('2');
  await wantInput.press('Enter');

  await expect(bananaRows.first().locator('.want-stepper .qty-input')).toHaveValue('2');

  // Switch back to Home Mode to add another item
  await page.click('#toolbar-mode');
  const addBtn = page.locator('.add-item-row .add-row-plus').first();
  await addBtn.click();
  const input = page.locator('.add-item-row input.add-item-input').first();
  await input.fill('Bananas');
  await input.press('Enter');

  const allBananaRows = page.locator('.grocery-item:has-text("Bananas")');
  await expect(allBananaRows).toHaveCount(3);

  // Verify wantCount sync in Shop Edit Mode
  await page.click('#toolbar-mode');
  await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
  await expect(page.locator('.grocery-item:has-text("Bananas")')).toHaveCount(1);
  await expect(page.locator('.grocery-item:has-text("Bananas")').locator('.want-stepper .qty-input')).toHaveValue('2');
});

test('Shop mode groups items with shared wantCount correctly', async ({ page }) => {
    const listId = 'list-1';
    const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [
            { id: 'sec-1', name: 'Sec 1' },
            { id: 'sec-2', name: 'Sec 2' }
        ],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [
          {
            id: 'item-1',
            text: 'Bananas',
            homeSectionId: 'sec-1',
            shopSectionId: 'sec-s-def',
            homeIndex: 0,
            shopIndex: 0,
            haveCount: 1,
            wantCount: 5,
            shopCompleted: false
          },
          {
            id: 'item-2',
            text: 'Bananas',
            homeSectionId: 'sec-2',
            shopSectionId: 'sec-s-def',
            homeIndex: 0,
            shopIndex: 1,
            haveCount: 2,
            wantCount: 5,
            shopCompleted: false
          }
        ]
      }],
      currentListId: listId,
      sharedWantSynced: true,
      mode: 'shop',
      editMode: false
    };
    await setMockState(page, state);

  const shopRows = page.locator('.grocery-item:has-text("Bananas")');
  await expect(shopRows).toHaveCount(1);

  const buyCircle = shopRows.locator('.shop-qty-circle');
  await expect(buyCircle).toHaveText('2');
});

test('Committing a grouped item in Shop mode distributes haveCount correctly', async ({ page }) => {
        const listId = 'list-1';
        const state = {
          lists: [{
            id: listId,
            name: 'Test List',
            theme: 'var(--theme-blue)',
            homeSections: [
                { id: 'sec-1', name: 'Sec 1' },
                { id: 'sec-2', name: 'Sec 2' }
            ],
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
            items: [
              {
                id: 'item-1',
                text: 'Bananas',
                homeSectionId: 'sec-1',
                shopSectionId: 'sec-s-def',
                homeIndex: 0,
                shopIndex: 0,
                haveCount: 0,
                wantCount: 5,
                shopCompleted: false
              },
              {
                id: 'item-2',
                text: 'Bananas',
                homeSectionId: 'sec-2',
                shopSectionId: 'sec-s-def',
                homeIndex: 0,
                shopIndex: 1,
                haveCount: 0,
                wantCount: 5,
                shopCompleted: false
              }
            ]
          }],
          currentListId: listId,
          sharedWantSynced: true,
          mode: 'shop',
          editMode: false
        };
        await setMockState(page, state);

    const bananaRow = page.locator('.grocery-item:has-text("Bananas")');
    await bananaRow.locator('.item-text').click();

    // Wait for completion animation
    await expect(bananaRow).toHaveClass(/completed/, { timeout: 10000 });

    // Switch back to Home mode
    await page.click('#toolbar-mode');

    const bananaItems = page.locator('.grocery-item:has-text("Bananas")');
    await expect(bananaItems).toHaveCount(2);
});

test('Renaming an item to an existing name syncs wantCount', async ({ page }) => {
        const listId = 'list-1';
        const state = {
          lists: [{
            id: listId,
            name: 'Test List',
            theme: 'var(--theme-blue)',
            homeSections: [{ id: 'sec-1', name: 'Sec 1' }],
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
            items: [
              {
                id: 'item-1',
                text: 'Apples',
                homeSectionId: 'sec-1',
                shopSectionId: 'sec-s-def',
                homeIndex: 0,
                shopIndex: 0,
                haveCount: 0,
                wantCount: 10,
                shopCompleted: false
              },
              {
                id: 'item-2',
                text: 'Bananas',
                homeSectionId: 'sec-1',
                shopSectionId: 'sec-s-def',
                homeIndex: 1,
                shopIndex: 1,
                haveCount: 0,
                wantCount: 2,
                shopCompleted: false
              }
            ]
          }],
          currentListId: listId,
          sharedWantSynced: true,
          mode: 'home',
          editMode: true
        };
        await setMockState(page, state);

    const bananaRow = page.locator('.grocery-item:has-text("Bananas")');
    await bananaRow.locator('.item-text').click({ clickCount: 2 });

    const input = page.locator('.grocery-item input.inline-edit-input');
    await input.fill('Apples');
    await input.press('Enter');

    const appleRows = page.locator('.grocery-item:has-text("Apples")');
    await expect(appleRows).toHaveCount(2);

    // Verify wantCount sync in Shop Edit Mode
    await page.click('#toolbar-mode');
    await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
    const appleGroup = page.locator('.grocery-item:has-text("Apples")');
    await expect(appleGroup).toHaveCount(1);
    await expect(appleGroup.locator('.want-stepper .qty-input')).toHaveValue('10');
});
