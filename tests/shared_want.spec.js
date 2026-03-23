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

  const firstBanana = bananaRows.first();
  const wantPart = firstBanana.locator('.want-part');
  await wantPart.click();

  const plusBtn = wantPart.locator('.plus');
  await plusBtn.click();

  await expect(bananaRows.first().locator('.want-part .qty-val')).toHaveText('2');
  await expect(bananaRows.last().locator('.want-part .qty-val')).toHaveText('2');

  await page.click('#toolbar-reorder');
  const addBtn = page.locator('.add-item-row .add-row-plus').first();
  await addBtn.click();
  const input = page.locator('.add-item-row input.add-item-input').first();
  await input.fill('Bananas');
  await input.press('Enter');

  const allBananaRows = page.locator('.grocery-item:has-text("Bananas")');
  await expect(allBananaRows).toHaveCount(3);
  await page.click('#toolbar-reorder');
  await expect(allBananaRows.nth(0).locator('.want-part .qty-val')).toHaveText('2');
  await expect(allBananaRows.nth(1).locator('.want-part .qty-val')).toHaveText('2');
  await expect(allBananaRows.nth(2).locator('.want-part .qty-val')).toHaveText('2');
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

    const haveTexts = await bananaItems.locator('.have-part .qty-val').allTextContents();
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

    // Switch Edit Mode OFF to see controls
    await page.click('#toolbar-reorder');
    const wantTexts = await appleRows.locator('.want-part .qty-val').allTextContents();
    expect(wantTexts).toEqual(['10', '10']);
});
