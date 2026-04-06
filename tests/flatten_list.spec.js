const { test, expect } = require('@playwright/test');

test('flattenList behavior during drag', async ({ page }) => {
  await page.goto('/');

  // Setup state and reload
  await page.evaluate(() => {
    localStorage.clear();
    const listId = 'L1';
    const appState = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-1', name: 'Test Section' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [{
          id: 'item-1',
          text: 'Test Item',
          homeSectionId: 'sec-h-1',
          shopSectionId: 'sec-s-def',
          homeIndex: 0,
          shopIndex: 0,
          haveCount: 0,
          wantCount: 1,
          shopCompleted: false
        }]
      }],
      currentListId: listId
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(appState));
    localStorage.setItem('grocery-mode', 'home');
    localStorage.setItem('grocery-edit-mode', 'true');
  });

  await page.reload();

  // Wait for app to render
  const item = page.locator('.grocery-item[data-id="item-1"]');
  await item.waitFor({ state: 'visible', timeout: 5000 });
  const dragHandle = item.locator('.drag-handle');

  // Verify initial state
  const groceryList = page.locator('#grocery-list');
  const sectionContainer = groceryList.locator('.section-container').first();
  const sectionItemsList = sectionContainer.locator('.section-items-list').first();

  await expect(sectionContainer).toBeVisible();
  // Item should be inside the section-items-list initially
  await expect(sectionItemsList.locator('.grocery-item[data-id="item-1"]')).toHaveCount(1);
  await expect(groceryList.locator('> .grocery-item[data-id="item-1"]')).toHaveCount(0); // not a direct child

  // Trigger flattenList
  // flattenList is called inside `startDragging` which is called shortly after `dragstart` or `touchstart`
  // on a drag-handle. Since it's a mobile-first app, touchstart often works better for tests if dragstart is tricky.

  // We'll dispatch a touchstart event to the drag handle
  await page.evaluate(() => {
    const el = document.querySelector('.grocery-item[data-id="item-1"] .drag-handle');
    const rect = el.getBoundingClientRect();
    const touch = new Touch({
      identifier: Date.now(),
      target: el,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      pageX: rect.left + rect.width / 2,
      pageY: rect.top + rect.height / 2,
      radiusX: 2.5,
      radiusY: 2.5,
      rotationAngle: 10,
      force: 0.5,
    });

    const event = new TouchEvent('touchstart', {
      cancelable: true,
      bubbles: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch]
    });

    el.dispatchEvent(event);
  });

  // wait for the startDragging timeout to execute
  await page.waitForTimeout(100);

  // Assertions after flattenList

  // 1. section-container should have display: none
  await expect(sectionContainer).toHaveCSS('display', 'none');

  // 2. The item should now be a direct child of #grocery-list
  await expect(groceryList.locator('> .grocery-item[data-id="item-1"]')).toHaveCount(1);

  // 3. The section-header should now be a direct child of #grocery-list
  await expect(groceryList.locator('> .section-header')).toHaveCount(1);

  // 4. Elements should have data-original-section-id attribute
  const originalSectionId = await sectionContainer.getAttribute('data-id');

  const flattenedItem = groceryList.locator('> .grocery-item[data-id="item-1"]');
  const flattenedHeader = groceryList.locator('> .section-header');

  await expect(flattenedItem).toHaveAttribute('data-original-section-id', originalSectionId);
  await expect(flattenedHeader).toHaveAttribute('data-original-section-id', originalSectionId);

  // 5. The add-section-row should still be present, as a direct child of grocery-list
  await expect(groceryList.locator('> .add-section-row')).toHaveCount(1);

});
