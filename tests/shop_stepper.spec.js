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

    // Switch to Home non-edit Mode where Have and Want steppers live
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).toHaveClass(/hide-drag-handles/);

    // Check if quantity controls are visible
    const qtyControls = page.locator('.grocery-item .quantity-controls').first();
    await expect(qtyControls).toBeVisible();

    // Verify want input exists
    const wantInput = page.locator('.want-stepper .qty-input').first();
    await expect(wantInput).toBeVisible();
    await expect(wantInput).toHaveText('1');

    // Change value
    await wantInput.click();
    await page.keyboard.type('2');
    await expect(wantInput).toHaveText('2');

    // Switch to Shop Mode and verify shop qty circle updated
    await page.click('#toolbar-mode');
    await page.waitForTimeout(600);
    await expect(page.locator('.app-container')).toHaveClass(/shop-mode/);
    const circleNum = page.locator('.shop-check-area .qty-number');
    await expect(circleNum).toHaveText('2');

    // Store Mode should not show want-stepper
    await expect(page.locator('.want-stepper')).toHaveCount(0);

    // Switch back to Home Mode and change back to 1
    await page.click('#toolbar-mode');
    await page.waitForTimeout(600);
    await wantInput.click();
    await page.keyboard.press('Backspace');
    await page.keyboard.type('1');
    await expect(wantInput).toHaveText('1');

    // Enter Edit Mode and verify controls are hidden
    await page.click('#toolbar-reorder');
    await expect(page.locator('.app-container')).not.toHaveClass(/hide-drag-handles/);

    // Wait for transition
    await page.waitForTimeout(600);
    await expect(qtyControls).not.toBeVisible();
});
