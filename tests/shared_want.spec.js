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

test('Shared wantCount synchronizes across items with same name', async ({ page }) => {
  await page.evaluate(async () => {
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
      sharedWantSynced: true
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-edit-mode', 'false');
    window.location.reload();
  });

  const bananaRows = page.locator('.grocery-item:has-text("Bananas")');
  await expect(bananaRows).toHaveCount(2);

  // Switch to Shop Mode to change wantCount (removed from Home Mode)
  await page.click('#toolbar-mode');
  await page.click('#toolbar-reorder');

  const firstBanana = bananaRows.first();
  const wantInput = firstBanana.locator('.want-stepper .qty-input');
  await wantInput.fill('2');

  await expect(bananaRows.first().locator('.want-stepper .qty-input')).toHaveValue('2');
  await expect(bananaRows.last().locator('.want-stepper .qty-input')).toHaveValue('2');

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
  await page.evaluate(async () => {
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
      sharedWantSynced: true
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-mode', 'shop');
    window.location.reload();
  });

  const shopRows = page.locator('.grocery-item:has-text("Bananas")');
  await expect(shopRows).toHaveCount(1);

  const buyCircle = shopRows.locator('.shop-qty-circle');
  await expect(buyCircle).toHaveText('2');
});

test('Committing a grouped item in Shop mode distributes haveCount correctly', async ({ page }) => {
    await page.evaluate(async () => {
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
          sharedWantSynced: true
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
        localStorage.setItem('grocery-mode', 'shop');
        localStorage.setItem('grocery-edit-mode', 'false');
        window.location.reload();
    });

    const bananaRow = page.locator('.grocery-item:has-text("Bananas")');
    await bananaRow.locator('.item-text').click();

    // The commit animation is 5s. We can either wait or switch modes to trigger auto-commit.
    await page.waitForTimeout(6000);

    // Switch back to Home mode to check individual counts - should still be 0
    await page.click('#toolbar-mode');

    const bananaItems = page.locator('.grocery-item:has-text("Bananas")');
    await expect(bananaItems).toHaveCount(2);

    const haveTexts = await bananaItems.locator('.have-stepper .qty-input').evaluateAll(inputs => inputs.map(i => i.value));
    const totalHave = haveTexts.reduce((sum, val) => sum + (parseInt(val) || 0), 0);
    expect(totalHave).toBe(0);
});

test('Renaming an item to an existing name syncs wantCount', async ({ page }) => {
    await page.evaluate(async () => {
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
          sharedWantSynced: true
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
        localStorage.setItem('grocery-edit-mode', 'true');
        window.location.reload();
    });

    const bananaRow = page.locator('.grocery-item:has-text("Bananas")');
    // Double tap triggers inline edit
    await bananaRow.locator('.item-text').click();
    await page.waitForTimeout(100);
    await bananaRow.locator('.item-text').click();

    const input = page.locator('.grocery-item input.inline-edit-input');
    await input.fill('Apples');
    await input.press('Enter');

    const appleRows = page.locator('.grocery-item:has-text("Apples")');
    await expect(appleRows).toHaveCount(2);

    // Verify wantCount sync in Shop Edit Mode (removed from Home Mode)
    await page.click('#toolbar-mode');
    await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
    const appleGroup = page.locator('.grocery-item:has-text("Apples")');
    await expect(appleGroup).toHaveCount(1);
    await expect(appleGroup.locator('.want-stepper .qty-input')).toHaveValue('10');
});
