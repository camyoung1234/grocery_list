const { test, expect } = require('@playwright/test');

test('verify shop mode quantity stepper', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        localStorage.clear();
        localStorage.setItem('grocery-edit-mode', 'false');
    });
    await page.reload();

    // Create a section first to ensure an item can be added
    await page.fill('.add-section-input', 'Fruits');
    await page.press('.add-section-input', 'Enter');

    // Add an item in Home Mode
    await page.fill('.add-item-input', 'Apple');
    await page.press('.add-item-input', 'Enter');

    // Switch to Shop Mode - Wait for animation
    await page.click('#toolbar-mode');
    await page.waitForTimeout(600);
    await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Enter Edit Mode - Toggle reorder
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

    // Check if quantity controls are visible
    const qtyControls = page.locator('.grocery-item .quantity-controls');
    await expect(qtyControls).toBeVisible();

    // Verify stepper exists
    const stepper = page.locator('.shop-qty-stepper');
    await expect(stepper).toBeVisible();

    const valSpan = stepper.locator('.qty-val');
    await expect(valSpan).toHaveText('1');

    // Click plus button
    await page.click('.shop-stepper-btn.plus');
    await expect(valSpan).toHaveText('2');

    // Verify shop qty circle also updated
    const circleNum = page.locator('.shop-qty-circle .qty-number');
    await expect(circleNum).toHaveText('2');

    // Click minus button
    await page.click('.shop-stepper-btn.minus');
    await expect(valSpan).toHaveText('1');
    await expect(circleNum).toHaveText('1');

    // Exit Edit Mode and verify controls are hidden
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Wait for transition
    await page.waitForTimeout(600);
    const width = await qtyControls.evaluate(el => getComputedStyle(el).width);
    expect(width).toBe('0px');
});
