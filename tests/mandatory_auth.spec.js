const { test, expect } = require('@playwright/test');

test('mandatory login screen is shown and app is hidden', async ({ page }) => {
    await page.goto('http://localhost:3000');

    // Check if app container is hidden
    const appContainer = page.locator('.app-container');
    await expect(appContainer).toHaveClass(/hidden/);

    // Check if sync modal is visible and shows login
    const syncModal = page.locator('#sync-modal-overlay');
    await expect(syncModal).toHaveClass(/visible/);
    await expect(page.locator('#sync-modal-title')).toHaveText('Sign In to Continue');

    // Check that cancel button is gone
    await expect(page.locator('#sync-cancel-btn')).toHaveCount(0);
});

test('app becomes visible after login', async ({ page }) => {
    // We need to mock Firebase Auth to trigger onAuthStateChanged
    await page.addInitScript(() => {
        window.mockUser = null;
        window.authListeners = [];
    });

    // Intercept Firebase Auth module to provide a mock
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js', async (route) => {
        await route.fulfill({
            contentType: 'application/javascript',
            body: `
                export const getAuth = () => ({ currentUser: window.mockUser });
                export const onAuthStateChanged = (auth, callback) => {
                    window.authListeners.push(callback);
                    callback(window.mockUser);
                    return () => {};
                };
                export const signInWithEmailAndPassword = async () => {};
                export const createUserWithEmailAndPassword = async () => {};
                export const signOut = async () => {};
            `
        });
    });

    await page.goto('http://localhost:3000');

    // App should be hidden initially (mockUser is null)
    await expect(page.locator('.app-container')).toHaveClass(/hidden/);

    // Simulate login
    await page.evaluate(() => {
        window.mockUser = { uid: 'test-user', email: 'test@example.com' };
        window.authListeners.forEach(cb => cb(window.mockUser));
    });

    // App should now be visible
    await expect(page.locator('.app-container')).not.toHaveClass(/hidden/);
    await expect(page.locator('#sync-modal-overlay')).not.toHaveClass(/visible/);
});
