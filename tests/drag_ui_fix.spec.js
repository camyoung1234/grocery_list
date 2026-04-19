const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('UI behavior of other items during drag', async ({ page }) => {
  await mockFirebase(page);
  await page.goto('/');

  // Setup state with two items and reload
  const listId = 'list-1';
  const state = {
      lists: [{
        id: listId,
        name: 'Test List',
        theme: 'var(--theme-blue)',
        homeSections: [{ id: 'sec-h-1', name: 'Test Section' }],
        shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
        items: [
          {
            id: 'item-1',
            text: 'Item 1',
            homeSectionId: 'sec-h-1',
            shopSectionId: 'sec-s-def',
            homeIndex: 0,
            shopIndex: 0,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
          },
          {
            id: 'item-2',
            text: 'Item 2',
            homeSectionId: 'sec-h-1',
            shopSectionId: 'sec-s-def',
            homeIndex: 1,
            shopIndex: 1,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
          }
        ]
      }],
      currentListId: listId
    };
  await setMockState(page, { ...state, mode: 'home', editMode: true });

  // Wait for app to render
  const item1 = page.locator('.grocery-item[data-id="item-1"]');
  const item2 = page.locator('.grocery-item[data-id="item-2"]');
  await item1.waitFor({ state: 'visible' });
  await item2.waitFor({ state: 'visible' });

  // Trigger drag on item 1
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
    });

    el.dispatchEvent(new TouchEvent('touchstart', {
      cancelable: true,
      bubbles: true,
      touches: [touch],
      targetTouches: [touch],
      changedTouches: [touch]
    }));
  });

  // wait for the startDragging timeout to execute
  await page.waitForTimeout(150);

  // Check that .is-dragging is on html
  await expect(page.locator('html')).toHaveClass(/is-dragging/);

  // Check other item (item 2)
  const dragHandle2 = item2.locator('.drag-handle');
  const deleteBtn2 = item2.locator('.item-delete-btn');
  const quantityControls2 = item2.locator('.quantity-controls');

  const handleOpacity = await dragHandle2.evaluate(el => getComputedStyle(el).opacity);
  const deleteOpacity = await deleteBtn2.evaluate(el => getComputedStyle(el).opacity);
  const quantityOpacity = await quantityControls2.evaluate(el => getComputedStyle(el).opacity);
  const deleteVisibility = await deleteBtn2.evaluate(el => getComputedStyle(el).visibility);

  console.log('Fixed Handle Opacity:', handleOpacity);
  console.log('Fixed Delete Opacity:', deleteOpacity);
  console.log('Fixed Quantity Opacity:', quantityOpacity);
  console.log('Fixed Delete Visibility:', deleteVisibility);

  // Expectations for FIXED state
  expect(parseFloat(handleOpacity)).toBe(0);
  expect(parseFloat(deleteOpacity)).toBe(0);
  expect(deleteVisibility).toBe('hidden');
  expect(parseFloat(quantityOpacity)).toBe(1);
});
