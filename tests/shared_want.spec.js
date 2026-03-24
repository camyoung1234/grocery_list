const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test('Shared wantCount synchronizes across items with same name', async ({ page }) => {
  await page.evaluate(() => {
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

  // Switch to Shop mode to adjust wantCount
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500);

  // In Shop mode, items are grouped if they have the same name.
  const bananaGroup = page.locator('.grocery-item:has-text("Bananas")');
  await expect(bananaGroup).toHaveCount(1); // Grouped

  // Enter edit mode to see steppers
  await page.click('#toolbar-reorder');

  const plusBtn = bananaGroup.locator('.shop-stepper-btn.plus');
  await plusBtn.click();

  await expect(bananaGroup.locator('.qty-val')).toHaveText('2');

  // Switch back to Home mode to verify persistence/sync
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500);

  // Back in Home Mode, let's add a 3rd banana item.
  // Make sure we are in edit mode to see "Add item"
  if (await page.locator('.app-container').evaluate(el => el.classList.contains('hide-drag-handles'))) {
      await page.click('#toolbar-reorder');
  }

  const addBtn = page.locator('.add-item-row .add-row-plus').first();
  await addBtn.click();
  const input = page.locator('.add-item-row input.add-item-input').first();
  await input.fill('Bananas');
  await input.press('Enter');

  // Verify that the new item also got wantCount = 2 (by checking Shop mode again)
  await page.click('#toolbar-mode');
  await page.waitForTimeout(500);
  await expect(page.locator('.grocery-item:has-text("Bananas")').locator('.shop-qty-circle .qty-number')).toHaveText('2');
});

test('Shop mode groups items with shared wantCount correctly', async ({ page }) => {
  await page.evaluate(() => {
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
    await page.evaluate(() => {
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

    // Switch back to Home mode to check individual counts
    await page.click('#toolbar-mode');

    const bananaItems = page.locator('.grocery-item:has-text("Bananas")');
    await expect(bananaItems).toHaveCount(2);

    // Standard view Home Mode shows haveCount in circles
    const haveTexts = await bananaItems.locator('.shop-qty-circle .qty-number').allTextContents();
    const totalHave = haveTexts.reduce((sum, val) => sum + parseInt(val), 0);
    expect(totalHave).toBe(5);
    expect(haveTexts).toContain('5');
    expect(haveTexts).toContain('0');
});

test('Renaming an item to an existing name syncs wantCount', async ({ page }) => {
    await page.evaluate(() => {
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

    // Switch to Shop mode to check wantCount
    await page.click('#toolbar-mode');
    await page.waitForTimeout(500);

    // In Shop mode grouped
    const appleGroup = page.locator('.grocery-item:has-text("Apples")');
    await expect(appleGroup).toHaveCount(1);

    // Enter edit mode to see wantCount in stepper
    await page.click('#toolbar-reorder');
    const wantText = await appleGroup.locator('.qty-val').textContent();
    expect(wantText).toBe('10');
});
