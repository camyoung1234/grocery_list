const { test, expect } = require('@playwright/test');

test('benchmark reorder', async ({ page }) => {
  await page.goto('http://localhost:3000');

  // Create 5000 items to make the DOM large
  await page.evaluate(() => {
    const list = document.getElementById('grocery-list');
    list.innerHTML = '';
    for (let i = 0; i < 5000; i++) {
        const li = document.createElement('li');
        li.className = 'grocery-item in-view';
        li.dataset.id = i;
        li.innerHTML = `Item ${i}`;
        list.appendChild(li);
    }
  });

  const timeQuerySelectorAll = await page.evaluate(() => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        const visibleRows = Array.from(document.querySelectorAll('.grocery-item.in-view, .section-header.in-view'));
        let topRow = null;
        let topOffset = 0;
        for (const row of visibleRows) {
            const rect = row.getBoundingClientRect();
            if (rect.bottom > 0) {
                topRow = row;
                topOffset = rect.top;
                break;
            }
        }
    }
    return performance.now() - start;
  });

  console.log(`querySelectorAll time for 100 iterations: ${timeQuerySelectorAll} ms`);

  // Simulate Set tracking
  await page.evaluate(() => {
    window.inViewportSet = new Set(Array.from(document.querySelectorAll('.grocery-item.in-view, .section-header.in-view')));
  });

  const timeSet = await page.evaluate(() => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        const visibleRows = window.inViewportSet;
        let topRow = null;
        let topOffset = 0;
        for (const row of visibleRows) {
            const rect = row.getBoundingClientRect();
            if (rect.bottom > 0) {
                topRow = row;
                topOffset = rect.top;
                break;
            }
        }
    }
    return performance.now() - start;
  });

  console.log(`Set tracking time for 100 iterations: ${timeSet} ms`);
});
