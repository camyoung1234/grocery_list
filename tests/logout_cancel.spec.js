const { test, expect } = require('@playwright/test');
const { mockFirebase } = require('./mockFirebase');

test.describe('Logout Prompt Cancel', () => {
    test('should allow canceling logout via Cancel button', async ({ page }) => {
        // Start with an authenticated user
        await mockFirebase(page, {
            user: { uid: 'test-user', email: 'test@example.com' }
        });
        await page.goto('http://localhost:3000');

        // Wait for app to load and login wall to disappear
        await expect(page.locator('.app-container')).toBeVisible();
        await expect(page.locator('#sync-modal-overlay')).toBeHidden();

        // Open sync modal
        await page.click('#toolbar-sync');
        const syncModalOverlay = page.locator('#sync-modal-overlay');
        await expect(syncModalOverlay).toBeVisible();

        // Click Cancel button
        await page.click('#sync-cancel-btn');
        await expect(syncModalOverlay).toBeHidden();
    });

    test('should allow canceling logout by clicking outside the modal', async ({ page }) => {
        // Start with an authenticated user
        await mockFirebase(page, {
            user: { uid: 'test-user', email: 'test@example.com' }
        });
        await page.goto('http://localhost:3000');

        // Wait for app to load
        await expect(page.locator('.app-container')).toBeVisible();

        // Open sync modal
        await page.click('#toolbar-sync');
        const syncModalOverlay = page.locator('#sync-modal-overlay');
        await expect(syncModalOverlay).toBeVisible();

        // Click on the overlay (outside the modal)
        // syncModalOverlay is the full-screen div
        await syncModalOverlay.click({ position: { x: 5, y: 5 } });
        await expect(syncModalOverlay).toBeHidden();
    });

    test('should NOT allow closing the modal by clicking outside when logged out', async ({ page }) => {
        // Start WITHOUT an authenticated user
        await mockFirebase(page, { user: null });
        // Ensure we don't auto-bypass the wall in mockFirebase
        await page.addInitScript(() => { localStorage.removeItem('grocery-logged-in'); });

        await page.goto('http://localhost:3000');

        const syncModalOverlay = page.locator('#sync-modal-overlay');
        await expect(syncModalOverlay).toBeVisible();
        await expect(page.locator('.app-container')).toBeHidden();

        // Attempt to click outside the modal
        await syncModalOverlay.click({ position: { x: 5, y: 5 } });

        // Modal should still be visible (login wall is mandatory)
        await expect(syncModalOverlay).toBeVisible();
    });
});
