import { test, expect } from '@playwright/test';
import { mockFirebase } from './mockFirebase';

test.describe('Focus quantity field behavior', () => {
    test.beforeEach(async ({ page }) => {
        await mockFirebase(page);
        await page.goto('/');
        await page.waitForSelector('.app-container:not(.hidden)');

        // Ensure we are in home mode and not in global edit mode for show-controls testing
        await page.evaluate(() => {
            localStorage.setItem('grocery-mode', 'home');
            localStorage.setItem('grocery-edit-mode', 'false');
            window.location.reload();
        });
        await page.waitForSelector('.app-container:not(.hidden)');

        // Add a section first
        await page.fill('.add-section-input', 'My Section');
        await page.press('.add-section-input', 'Enter');
        await page.waitForSelector('.section-container');
    });

    test('focusing quantity field clears show-controls from another item', async ({ page }) => {
        // Add two items
        await page.fill('.add-item-input', 'Item 1');
        await page.press('.add-item-input', 'Enter');
        await page.fill('.add-item-input', 'Item 2');
        await page.press('.add-item-input', 'Enter');

        const item1 = page.locator('.grocery-item').filter({ hasText: 'Item 1' });
        const item2 = page.locator('.grocery-item').filter({ hasText: 'Item 2' });

        // Single tap Item 1 to show controls
        await item1.click();
        await expect(item1).toHaveClass(/show-controls/);

        // Focus Item 2's quantity field
        const qty2 = item2.locator('.qty-input');
        await qty2.focus();

        // Item 1 should no longer have show-controls
        await expect(item1).not.toHaveClass(/show-controls/);
    });

    test('focusing quantity field clears inline edit from another item', async ({ page }) => {
        // Enable global edit mode to allow double tap to edit
        await page.evaluate(() => {
            localStorage.setItem('grocery-edit-mode', 'true');
            window.location.reload();
        });
        await page.waitForSelector('.app-container:not(.hidden)');

        // Add two items
        await page.fill('.add-item-input', 'Item 1');
        await page.press('.add-item-input', 'Enter');
        await page.fill('.add-item-input', 'Item 2');
        await page.press('.add-item-input', 'Enter');

        const item1 = page.locator('.grocery-item').filter({ hasText: 'Item 1' });
        const item2 = page.locator('.grocery-item').filter({ hasText: 'Item 2' });

        // Double click Item 1 to start inline edit
        await item1.locator('.item-text').dblclick();
        await expect(item1.locator('.inline-edit-input')).toBeVisible();

        // Focus Item 2's quantity field
        const qty2 = item2.locator('.qty-input');
        await qty2.focus();

        // Item 1 should no longer be in edit mode (inline-edit-input should be gone)
        // Note: blurring might trigger a renderList which clears it.
        await expect(item1.locator('.inline-edit-input')).not.toBeAttached();
    });
});
