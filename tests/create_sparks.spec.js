const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('createSparks function generates particles that animate and disappear', async ({ page }) => {
    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  await mockFirebase(page);
  await page.goto('http://localhost:3000');

    // Add one item
    const state = {
            lists: [{
                id: 'list-1',
                name: 'Test List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-1',
                    text: 'Item 1',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-1'
        };
await setMockState(page, { ...state, mode: 'shop', editMode: false });

    const item = page.locator('.grocery-item[data-id="item-1"]');
    await expect(item).toBeVisible();

    // Click the item to check it
    await item.click();

    const particles = page.locator('.spark-particle');

    // Sparks should be added to the DOM after 300ms
    // We can use toHaveCount which will poll until the condition is met (up to timeout).
    await expect(particles).toHaveCount(8);

    // The animation takes 600ms, and they are removed onfinish
    // Wait for a little more than 600ms
    await expect(particles).toHaveCount(0, { timeout: 1500 });
});
