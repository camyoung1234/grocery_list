const { test, expect } = require('@playwright/test');
const { mockFirebase } = require('./mockFirebase');

test.describe('Login Requirement', () => {
    test.beforeEach(async ({ page }) => {
        // Start without an authenticated user
        await mockFirebase(page, { user: null });
        await page.addInitScript(() => { localStorage.setItem('grocery-logged-in', 'true'); });
    await page.goto('http://localhost:3000');
    });

    test('should show login overlay and hide app container initially', async ({ page }) => {
        const loginOverlay = page.locator('#sync-modal-overlay');
        const appContainer = page.locator('.app-container');

        await expect(loginOverlay).toBeVisible();
        await expect(appContainer).toBeHidden();
    });

    test('should allow login with email and password', async ({ page }) => {
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        await page.fill('#sync-email', 'test@example.com');
        await page.fill('#sync-password', 'password123');
        await page.click('#sync-login-btn');

        const appContainer = page.locator('.app-container');
        const loginOverlay = page.locator('#sync-modal-overlay');

        await expect(appContainer).toBeVisible();
        await expect(loginOverlay).toBeHidden();

        // Check if user email is displayed in sync modal
        await page.click('#toolbar-sync');
        await expect(page.locator('#sync-user-email')).toHaveText('test@example.com');
    });

    test('should allow signup with email and password', async ({ page }) => {
        await page.fill('#sync-email', 'newuser@example.com');
        await page.fill('#sync-password', 'newpassword123');
        await page.click('#sync-signup-btn');

        const appContainer = page.locator('.app-container');
        await expect(appContainer).toBeVisible();

        await page.click('#toolbar-sync');
        await expect(page.locator('#sync-user-email')).toHaveText('newuser@example.com');
    });

    test('should require both email and password', async ({ page }) => {
        await page.fill('#sync-email', 'test@example.com');
        await page.click('#sync-login-btn');

        const errorDiv = page.locator('#sync-error');
        await expect(errorDiv).toBeVisible();
        await expect(errorDiv).toHaveText(/Please enter both email and password/);
    });
});
