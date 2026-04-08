const { test, expect } = require('@playwright/test');
const { mockFirebase } = require('./mockFirebase');

test.describe('Login Requirement', () => {
    test.beforeEach(async ({ page }) => {
        // Start without an authenticated user by passing it in the state object
        await mockFirebase(page, { user: null });
        await page.goto('http://localhost:3000');
    });

    test('should show login overlay and hide app container initially', async ({ page }) => {
        const loginOverlay = page.locator('#sync-modal-overlay');
        const appContainer = page.locator('.app-container');

        await expect(loginOverlay).toBeVisible();
        await expect(appContainer).toBeHidden();
    });

    test('should show success message when sign-in link is sent', async ({ page }) => {
        await page.fill('#sync-email', 'test@example.com');
        await page.click('#sync-send-link-btn');

        const successMessage = page.locator('#sync-message');
        await expect(successMessage).toBeVisible();
        await expect(successMessage).toHaveText(/Sign-in link sent/);

        // Verify email was stored in localStorage
        const storedEmail = await page.evaluate(() => localStorage.getItem('emailForSignIn'));
        expect(storedEmail).toBe('test@example.com');
    });

    test('should become accessible after successful email link sign-in', async ({ page }) => {
        // Set email in localStorage as if a link was just sent
        await page.evaluate(() => {
            localStorage.setItem('emailForSignIn', 'test@example.com');
        });

        // Navigate to the app with the mock "apiKey" to trigger isSignInWithEmailLink
        await page.goto('http://localhost:3000/#apiKey=test');

        const appContainer = page.locator('.app-container');
        const loginOverlay = page.locator('#sync-modal-overlay');

        await expect(appContainer).toBeVisible();
        await expect(loginOverlay).toBeHidden();

        const userEmail = page.locator('#sync-user-email');
        // We need to open the sync modal to see the user email
        await page.click('#toolbar-sync');
        await expect(userEmail).toHaveText('test@example.com');
    });

    test('should prompt for email if localStorage is missing during link sign-in', async ({ page }) => {
        // Set up prompt mock
        await page.evaluate(() => {
            window.prompt = () => 'manual@example.com';
        });

        // Navigate to the app with the mock "apiKey"
        await page.goto('http://localhost:3000/#apiKey=test');

        const appContainer = page.locator('.app-container');
        await expect(appContainer).toBeVisible();

        await page.click('#toolbar-sync');
        const userEmail = page.locator('#sync-user-email');
        await expect(userEmail).toHaveText('manual@example.com');
    });
});
