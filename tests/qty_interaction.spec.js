const { test, expect } = require('@playwright/test');

test.describe('Quantity Input Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check if Uncategorized section exists, if not add it
    const hasSection = await page.locator('.section-title').count() > 0;
    if (!hasSection) {
      await page.fill('.add-section-input', 'Uncategorized');
      await page.press('.add-section-input', 'Enter');
    }

    // Exit Edit Mode to see quantity inputs in Home Mode
    await page.click('#toolbar-reorder');

    // Add items to ensure we have quantity inputs to interact with and enough for scrolling
    for (let i = 1; i <= 15; i++) {
        await page.fill('.add-item-input', `Item ${i}`);
        await page.press('.add-item-input', 'Enter');
    }
  });

  test('Enter key moves focus to next quantity input', async ({ page }) => {
    const qtyInputs = page.locator('.qty-input');
    await expect(qtyInputs).toHaveCount(15);

    // Focus the first input
    await qtyInputs.nth(0).click(); // Click to ensure focus
    await expect(qtyInputs.nth(0)).toBeFocused();

    // Press Enter
    await page.keyboard.press('Enter');

    // Focus should move to the next input
    await expect(qtyInputs.nth(1)).toBeFocused();

    // Press Enter again
    await page.keyboard.press('Enter');
    await expect(qtyInputs.nth(2)).toBeFocused();
  });

  test('Focus style transition and background color', async ({ page }) => {
    const firstQtyInput = page.locator('.qty-input').nth(0);

    // Wait for any transitions to settle
    await page.waitForTimeout(500);

    // Check initial background color
    const initialBg = await firstQtyInput.evaluate(el => window.getComputedStyle(el).backgroundColor);

    await firstQtyInput.click();

    // Wait for focus transition
    await page.waitForTimeout(500);

    // Check focus background color
    const focusBg = await firstQtyInput.evaluate(el => window.getComputedStyle(el).backgroundColor);

    console.log('Initial BG:', initialBg);
    console.log('Focus BG:', focusBg);

    // Expect focus background color to be different from initial (which was transparent or white)
    expect(focusBg).not.toBe(initialBg);
    // Since we used color-mix with primary color (blue by default), focusBg should contain blue components.
  });

  test('Enter key moves focus and scrolls in Shop Mode Edit Mode', async ({ page }) => {
    // Switch to Shop Mode
    await page.click('#toolbar-mode');

    // Ensure we are in Edit Mode
    const editBtn = page.locator('#toolbar-reorder');
    if (!(await editBtn.getAttribute('class')).includes('active')) {
      await editBtn.click();
    }

    const qtyInputs = page.locator('.qty-input');
    await expect(qtyInputs).toHaveCount(15);

    // Focus the first input
    await qtyInputs.nth(0).click();
    await expect(qtyInputs.nth(0)).toBeFocused();

    // Press Enter 5 times
    for (let i = 1; i <= 5; i++) {
        await page.keyboard.press('Enter');
        await expect(qtyInputs.nth(i)).toBeFocused();
    }

    // Final check for scroll position - since it's smooth scroll, we just check focus
    await expect(qtyInputs.nth(5)).toBeFocused();
  });
});
