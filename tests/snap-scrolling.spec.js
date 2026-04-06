
const { test, expect } = require('@playwright/test');

test('verify snap scrolling alignment', async ({ page }) => {
    // Set viewport to a typical mobile size
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('http://localhost:3000');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // Add many items to ensure scrollability
    await page.evaluate(() => {
        const items = [];
        for (let i = 1; i <= 30; i++) {
            items.push({
                id: `item-${i}`,
                text: `Item ${i}`,
                homeSectionId: 'sec-h-def',
                shopSectionId: 'sec-s-def',
                homeIndex: i - 1,
                shopIndex: i - 1,
                haveCount: 0,
                wantCount: 1,
                shopCompleted: false
            });
        }
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Test List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: items
            }],
            currentListId: 'list-1'
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });
    await page.reload();

    // In mobile view (width < 600px), html/body is the scroller
    // The items are in .grocery-list which is inside .app-container
    // .app-container has padding-top: 1rem (16px)
    // The first row is .section-header (Uncategorized)

    // Scroll to an offset that is NOT a multiple of 50
    // We scroll the document
    await page.evaluate(() => window.scrollTo(0, 123));

    // Wait for scroll to settle
    await page.waitForTimeout(1000);

    const scrollTop = await page.evaluate(() => window.scrollY);
    console.log(`ScrollTop after snap (mobile): ${scrollTop}`);

    // Since it snaps to the start of a row, and rows are 50px high.
    // The first row starts at 16px (due to .app-container padding-top: 1rem)
    // Wait, if it snaps to .section-header (Uncategorized), it should align with the top of the viewport.
    // If Uncategorized header is at y=16, snapping to it would set scrollY to 16?
    // Let's check the row positions.
    const rowTops = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.grocery-item, .section-header'))
            .map(el => el.getBoundingClientRect().top + window.scrollY);
    });
    console.log('Row tops:', rowTops);

    // Verify that the final scroll position matches one of the row tops
    const matchesAnyRow = rowTops.some(top => Math.abs(top - scrollTop) < 2);
    expect(matchesAnyRow).toBe(true);

    // Test Desktop view
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.reload();

    const scroller = page.locator('.app-container');
    await scroller.evaluate(el => el.scrollTo(0, 123));
    await page.waitForTimeout(1000);

    const desktopScrollTop = await scroller.evaluate(el => el.scrollTop);
    console.log(`ScrollTop after snap (desktop): ${desktopScrollTop}`);

    const desktopRowTops = await page.evaluate(() => {
        const container = document.querySelector('.app-container');
        return Array.from(container.querySelectorAll('.grocery-item, .section-header'))
            .map(el => el.offsetTop);
    });
    console.log('Desktop row tops (offsetTop):', desktopRowTops);

    const matchesAnyDesktopRow = desktopRowTops.some(top => Math.abs(top - desktopScrollTop) < 2);
    expect(matchesAnyDesktopRow).toBe(true);
});
