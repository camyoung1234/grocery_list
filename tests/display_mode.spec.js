const { test, expect } = require('@playwright/test');
const { mockFirebase } = require('./mockFirebase');

test.describe('Display Mode Toggle', () => {
    test.beforeEach(async ({ page }) => {
        await mockFirebase(page);
        await page.goto('http://localhost:3000');

        // Manual login steps to ensure app is visible
        await page.fill('#sync-email', 'test@example.com');
        await page.fill('#sync-password', 'password123');
        await page.click('#sync-login-btn');

        await page.waitForSelector('.app-container:not(.hidden)', { timeout: 10000 });
    });

    test('should default to Auto mode', async ({ page }) => {
        // Double tap current list name to edit
        await page.dblclick('#current-list-name');

        await expect(page.locator('#current-display-name')).toHaveText('Auto');

        // Verify no override class on root
        const hasDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
        const hasLightMode = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
        expect(hasDarkMode).toBe(false);
        expect(hasLightMode).toBe(false);
    });

    test('should apply and persist Dark mode', async ({ page }) => {
        await page.dblclick('#current-list-name');

        // Open display mode dropdown
        await page.click('#display-trigger');
        // Select Dark
        await page.click('#display-options .theme-option[data-value="dark"]');

        await expect(page.locator('#current-display-name')).toHaveText('Dark');

        // Verify dark-mode class is applied (live preview)
        let hasDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
        expect(hasDarkMode).toBe(true);

        // Save
        await page.click('#modal-save-btn');

        // Verify class remains after modal close
        hasDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
        expect(hasDarkMode).toBe(true);

        // Reload and verify persistence
        await page.reload();
        // Login again after reload
        await page.fill('#sync-email', 'test@example.com');
        await page.fill('#sync-password', 'password123');
        await page.click('#sync-login-btn');
        await page.waitForSelector('.app-container:not(.hidden)');

        hasDarkMode = await page.evaluate(() => document.documentElement.classList.contains('dark-mode'));
        expect(hasDarkMode).toBe(true);
    });

    test('should apply and persist Light mode', async ({ page }) => {
        // Force system dark mode
        await page.emulateMedia({ colorScheme: 'dark' });

        await page.dblclick('#current-list-name');
        await page.click('#display-trigger');
        await page.click('#display-options .theme-option[data-value="light"]');

        await expect(page.locator('#current-display-name')).toHaveText('Light');

        // Verify light-mode class is applied
        let hasLightMode = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
        expect(hasLightMode).toBe(true);

        await page.click('#modal-save-btn');

        hasLightMode = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
        expect(hasLightMode).toBe(true);

        await page.reload();
        await page.fill('#sync-email', 'test@example.com');
        await page.fill('#sync-password', 'password123');
        await page.click('#sync-login-btn');
        await page.waitForSelector('.app-container:not(.hidden)');

        hasLightMode = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
        expect(hasLightMode).toBe(true);
    });

    test('should handle different modes per list', async ({ page }) => {
        // List 1 (default) set to Dark
        await page.dblclick('#current-list-name');
        await page.click('#display-trigger');
        await page.click('#display-options .theme-option[data-value="dark"]');
        await page.click('#modal-save-btn');

        // Create List 2 set to Light
        await page.click('#toolbar-lists');
        await page.click('.create-list-text');
        await page.fill('#modal-input', 'Light List');
        await page.click('#display-trigger');
        await page.click('#display-options .theme-option[data-value="light"]');
        await page.click('#modal-save-btn');

        // Currently on Light List
        expect(await page.evaluate(() => document.documentElement.classList.contains('light-mode'))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark-mode'))).toBe(false);

        // Switch back to default list
        await page.click('#toolbar-lists');
        // Find the other list in the menu (it should be there)
        await page.click('.lists-menu .menu-item:has(span:not(.create-list-text))');

        // Should be dark now
        expect(await page.evaluate(() => document.documentElement.classList.contains('dark-mode'))).toBe(true);
        expect(await page.evaluate(() => document.documentElement.classList.contains('light-mode'))).toBe(false);
    });
});
