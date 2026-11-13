const { test, expect } = require('@playwright/test');

test.describe('Grocery List v2 — Bottom Bar, Search Toggle, Undo Delete & Shopping Checkboxes', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('Bottom bar, Search bar replacement, Add aisle/item, Undo item delete, and localStorage persistence', async ({ page }) => {
        // Verify bottom bar with 3-way toggle, search button, and settings button
        await expect(page.locator('#bottom-nav-bar')).toBeVisible();
        await expect(page.locator('#search-open-btn')).toBeVisible();
        await expect(page.locator('#settings-open-btn')).toBeVisible();

        // Click Search button -> replaces bottom nav bar with search input
        await page.click('#search-open-btn');
        await expect(page.locator('#bottom-nav-bar')).toBeHidden();
        await expect(page.locator('#bottom-search-bar')).toBeVisible();

        await page.fill('#store-search-input', 'Bananas');
        await expect(page.locator('.item-row', { hasText: 'Bananas' })).toBeVisible();
        await expect(page.locator('.item-row', { hasText: 'Whole Milk' })).toHaveCount(0);

        // Close search -> restores bottom nav bar and clears filter
        await page.click('#search-close-btn');
        await expect(page.locator('#bottom-search-bar')).toBeHidden();
        await expect(page.locator('#bottom-nav-bar')).toBeVisible();
        await expect(page.locator('.item-row', { hasText: 'Whole Milk' })).toBeVisible();

        // Add a new aisle and item
        await page.click('#add-aisle-open-btn');
        await page.fill('#new-aisle-input', 'Bakery');
        await page.click('#add-aisle-form button[type="submit"]');

        const bakeryCard = page.locator('.aisle-card', { hasText: 'Bakery' });
        await bakeryCard.locator('.aisle-add-input').fill('Sourdough Bread');
        await bakeryCard.locator('.aisle-add-qty').fill('2');
        await bakeryCard.locator('.aisle-add-form button[type="submit"]').click();

        const breadRow = bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' });
        await breadRow.locator('button[aria-label="Increase Desired quantity for Sourdough Bread"]').click();
        await expect(breadRow.locator('.stepper-input')).toHaveValue('3');

        // Delete Sourdough Bread -> Undo toast appears and restores it
        await breadRow.locator('button[aria-label="Delete Sourdough Bread"]').click();
        await expect(bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' })).toHaveCount(0);
        await expect(page.locator('.toast-undo-btn')).toBeVisible();
        await page.click('.toast-undo-btn');
        await expect(bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' })).toBeVisible();

        // Reload and verify localStorage persistence
        await page.reload();
        const reloadedBread = page.locator('.aisle-card', { hasText: 'Bakery' }).locator('.item-row', { hasText: 'Sourdough Bread' });
        await expect(reloadedBread.locator('.stepper-input')).toHaveValue('3');
    });

    test('Inventory Mode: voice/text <item> <count>, ambiguous suggestions, add new item, duplicate summing, and Undo X delete', async ({ page }) => {
        await page.click('#tab-inventory-btn');

        // 1. Ambiguous match
        await page.fill('#inventory-command-input', 'wipes 3');
        await page.click('#inventory-command-submit');

        const ambiguousEntry = page.locator('.inv-entry.ambiguous').first();
        await expect(ambiguousEntry).toBeVisible();
        await expect(ambiguousEntry.locator('.suggestion-chip', { hasText: 'Baby Wipes' })).toBeVisible();
        await expect(ambiguousEntry.locator('.suggestion-chip', { hasText: 'Disinfecting Wipes' })).toBeVisible();

        // 2. Non-existent item
        await page.fill('#inventory-command-input', 'sparkling water 6');
        await page.click('#inventory-command-submit');

        const unmatchedEntry = page.locator('.inv-entry.unmatched').first();
        await unmatchedEntry.locator('.aisle-select').selectOption({ label: 'Pantry' });
        await unmatchedEntry.locator('button', { hasText: '+ Add to Store List' }).click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Sparkling Water' })).toBeVisible();

        // 3. Resolve ambiguous "wipes"
        await ambiguousEntry.locator('.suggestion-chip', { hasText: 'Baby Wipes' }).click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Baby Wipes' })).toBeVisible();

        // 4. Duplicate summing
        await page.fill('#inventory-command-input', 'milk 1');
        await page.click('#inventory-command-submit');
        await page.fill('#inventory-command-input', 'milk 2');
        await page.click('#inventory-command-submit');

        const milkEntries = page.locator('.inv-entry.matched', { hasText: 'Whole Milk' });
        await expect(milkEntries).toHaveCount(2);
        await expect(milkEntries.first()).toContainText('Total: 3');

        // 5. Delete "milk 1" with X -> Undo restores, then delete again
        await milkEntries.last().locator('.inv-delete-btn').click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(1);
        await page.click('.toast-undo-btn');
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(2);

        await milkEntries.last().locator('.inv-delete-btn').click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(1);

        // Verify in All Items
        await page.click('#tab-all-btn');
        await expect(page.locator('.item-row', { hasText: 'Whole Milk' })).toContainText('Stocked (2/2)');
    });

    test('Shopping List: number inside unchecked box replaced by checkmark when checked, no "Buy" label, Clear Checks', async ({ page }) => {
        await page.click('#tab-inventory-btn');
        for (const cmd of ['whole milk 2', 'bananas 2', 'eggs 1']) {
            await page.fill('#inventory-command-input', cmd);
            await page.click('#inventory-command-submit');
        }

        await page.click('#tab-shopping-btn');

        // Whole Milk and Eggs hidden
        await expect(page.locator('.shopping-row', { hasText: 'Whole Milk' })).toHaveCount(0);
        await expect(page.locator('.shopping-row', { hasText: 'Eggs' })).toHaveCount(0);

        // Bananas should show "4" inside .cart-check (and no "Buy" text)
        const bananasRow = page.locator('.shopping-row', { hasText: 'Bananas' });
        await expect(bananasRow).not.toContainText('Buy');
        await expect(bananasRow.locator('.cart-check')).toHaveText('4');

        // Check Bananas -> "4" is replaced by "✓"
        await bananasRow.click();
        await expect(bananasRow).toHaveClass(/in-cart/);
        await expect(bananasRow.locator('.cart-check')).toHaveText('✓');

        // Clear Checks -> restores "4"
        await page.click('#clear-checks-btn');
        await expect(bananasRow).not.toHaveClass(/in-cart/);
        await expect(bananasRow.locator('.cart-check')).toHaveText('4');
    });

    test('Double-tap required to edit aisle and item names', async ({ page }) => {
        const produceHeader = page.locator('.aisle-card', { hasText: 'Produce' }).locator('.aisle-name-btn');
        // Single tap should NOT open edit input
        await produceHeader.click();
        await expect(page.locator('.aisle-name-input')).toHaveCount(0);

        // Double tap SHOULD open edit input
        await produceHeader.dblclick();
        await expect(page.locator('.aisle-name-input')).toBeVisible();
        await page.locator('.aisle-name-input').fill('Fresh Produce');
        await page.locator('.aisle-name-input').press('Enter');
        await expect(page.locator('.aisle-card .aisle-name-btn', { hasText: 'Fresh Produce' })).toBeVisible();

        const bananasBtn = page.locator('.item-row .item-name-btn', { hasText: 'Bananas' });
        await bananasBtn.click();
        await expect(page.locator('.item-name-input')).toHaveCount(0);

        await bananasBtn.dblclick();
        await expect(page.locator('.item-name-input')).toBeVisible();
        await page.locator('.item-name-input').fill('Organic Bananas');
        await page.locator('.item-name-input').press('Enter');
        await expect(page.locator('.item-row .item-name-btn', { hasText: 'Organic Bananas' })).toBeVisible();
    });

    test('Settings Modal: toggles hide/show Stocked/Have/Need, Have/Want, aisle counts, and compact density', async ({ page }) => {
        await expect(page.locator('.item-row .stock-pill').first()).toBeVisible();
        await expect(page.locator('.aisle-count').first()).toBeVisible();
        await expect(page.locator('body')).not.toHaveClass(/compact/);

        await page.click('#settings-open-btn');
        await page.click('label[for="setting-show-all-stock"]');
        await page.click('label[for="setting-show-shopping-hw"]');
        await page.click('label[for="setting-show-aisle-counts"]');
        await page.click('label[for="setting-compact-density"]');
        await page.click('#settings-close-btn');

        await expect(page.locator('.item-row .stock-pill')).toHaveCount(0);
        await expect(page.locator('.aisle-count')).toHaveCount(0);
        await expect(page.locator('body')).toHaveClass(/compact/);

        await page.click('#tab-shopping-btn');
        await expect(page.locator('.shopping-row .shopping-item-sub')).toHaveCount(0);
        await expect(page.locator('.aisle-count')).toHaveCount(0);
    });

    test('Inventory Mode: simulated Web Speech API voice recognition works end-to-end', async ({ page }) => {
        await page.addInitScript(() => {
            window.SpeechRecognition = class MockSpeechRecognition {
                start() {
                    window.__mockRec = this;
                }
                stop() {}
            };
        });
        await page.goto('/');
        await page.click('#tab-inventory-btn');
        await page.click('#voice-mic-btn');
        await expect(page.locator('#voice-mic-btn')).toHaveClass(/listening/);

        await page.evaluate(() => {
            window.__mockRec.onresult({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'bananas 3' }], { isFinal: true })
                ]
            });
        });

        await expect(page.locator('.inv-entry.matched', { hasText: 'Bananas' })).toBeVisible();
        await expect(page.locator('.inv-entry.matched .stepper-input')).toHaveValue('3');
    });
});
