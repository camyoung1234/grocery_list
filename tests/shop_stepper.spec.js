const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test('verify shop mode quantity stepper', async ({ page }) => {
    await mockFirebase(page);
await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
    await page.goto('http://localhost:3000');
    await setMockState(page, { mode: 'home', editMode: true });

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

    // In Shop Mode, hide-drag-handles should be NOT present if editMode is true
    await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

    // Toggle editMode off
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Toggle editMode back on
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

    // Check if quantity controls are visible
    const qtyControls = page.locator('.grocery-item .quantity-controls');
    await expect(qtyControls).toBeVisible();

    // Verify input exists
    const wantInput = page.locator('.want-stepper .qty-input');
    await expect(wantInput).toBeVisible();
    await expect(wantInput).toHaveValue('1');

    // Change value
    await wantInput.fill('2');
    await expect(wantInput).toHaveValue('2');

    // Verify shop qty circle also updated
    const circleNum = page.locator('.shop-qty-circle .qty-number');
    await expect(circleNum).toHaveText('2');

    // Change back
    await wantInput.fill('1');
    await expect(wantInput).toHaveValue('1');
    await expect(circleNum).toHaveText('1');

    // Exit Edit Mode and verify controls are STILL visible in shop mode
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Wait for transition
    await page.waitForTimeout(600);
    await expect(qtyControls).toBeVisible();
});
