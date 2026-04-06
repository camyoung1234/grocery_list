const { test, expect } = require('@playwright/test');

// Helper to bypass login gate in tests
const bypassLoginGate = async (page) => {
    // We can't easily mock Firebase Auth on the client side without more complex setup,
    // so we'll simulate a login by calling the underlying logic or mocking the state.
    // For these tests, we'll just evaluate a script that sets a dummy user and triggers the sync flow.
    await page.evaluate(async () => {
        // Mock a user session and manually trigger the initialization of loadAppState
        // This is a bit hacky but avoids needing a real Firebase project for local tests.
        await window.__MOCK_LOGIN__('test@example.com');
  await expect(page.locator('#sync-modal-overlay')).not.toBeVisible();
  await page.reload();
    });
};

module.exports = { bypassLoginGate };
