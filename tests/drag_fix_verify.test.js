const { test, expect } = require('@playwright/test');

test('drag locks body scrolling', async ({ page }) => {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Clear localStorage and hash to start fresh
  await page.goto('http://localhost:3000#');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  // Wait for initial render
  await page.waitForSelector('body');

  // Log all classes of all li elements to debug
  const liClasses = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('li')).map(li => li.className);
  });
  console.log('LI classes:', liClasses);

  // If there are no home sections, renderList() might not render ANY items yet.
  // Wait for the app-container to be visible
  await page.waitForSelector('.app-container');

  // If the app is truly fresh, we should see "Create New List" or "Grocery List" in the loading state
  // Check the list name
  const listName = await page.textContent('#current-list-name');
  console.log('Current list name:', listName);

  // Instead of complex UI interaction, let's seed the state directly to localStorage
  await page.evaluate(() => {
    const state = {
      lists: [{
        id: "1",
        name: "Test List",
        theme: "var(--theme-blue)",
        homeSections: [{ id: "h1", name: "Section 1" }],
        shopSections: [{ id: "sec-s-def", name: "Uncategorized" }],
        items: [{
          id: "i1",
          text: "Item 1",
          homeSectionId: "h1",
          shopSectionId: "sec-s-def",
          homeIndex: 0,
          shopIndex: 0,
          haveCount: 0,
          wantCount: 1,
          shopCompleted: false
        }]
      }],
      currentListId: "1"
    };
    localStorage.setItem('grocery-app-state', JSON.stringify(state));
    localStorage.setItem('grocery-edit-mode', 'true');
  });
  await page.reload();

  // Wait for list items to render using a longer timeout and waitForSelector with state: 'visible'
  await page.waitForSelector('.grocery-item', { state: 'visible', timeout: 30000 });

  const handle = page.locator('.grocery-item:not(.add-item-row):not(.add-section-row) .drag-handle').first();
  await expect(handle).toBeVisible();

  // Check initial overflow
  const initialOverflow = await page.evaluate(() => document.body.style.overflow);
  console.log('Initial overflow:', initialOverflow);
  expect(initialOverflow).not.toBe('hidden');

  // Simulate touchstart on the drag handle
  const box = await handle.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  // Actually, we need to trigger the event manually or use a more complex interaction
  // since tap might not trigger handleTouchStart if it's just a quick tap.
  // But handleTouchStart is bound to 'touchstart'.

  await page.evaluate((selector) => {
    const el = document.querySelector(selector);
    const ev = new TouchEvent('touchstart', {
      touches: [{ clientX: 0, clientY: 0, target: el }],
      bubbles: true,
      cancelable: true
    });
    el.dispatchEvent(ev);
  }, '.drag-handle');

  // Check overflow during drag
  const dragOverflow = await page.evaluate(() => document.body.style.overflow);
  console.log('Overflow during drag:', dragOverflow);
  expect(dragOverflow).toBe('hidden');

  // Simulate touchend to restore scrolling
  await page.evaluate(() => {
    const ev = new Event('drop', { bubbles: true });
    document.getElementById('grocery-list').dispatchEvent(dropEvent);
  }).catch(() => {}); // drop logic might fail if not fully set up but we care about handleDragEnd

  await page.evaluate(() => {
    const ev = new Event('dragend', { bubbles: true });
    document.getElementById('grocery-list').dispatchEvent(ev);
  });

  // Check restored overflow
  const restoredOverflow = await page.evaluate(() => document.body.style.overflow);
  console.log('Restored overflow:', restoredOverflow);
  expect(restoredOverflow).toBe('');
});
