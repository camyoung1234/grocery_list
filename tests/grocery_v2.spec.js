const { test, expect } = require('@playwright/test');

test.describe('Grocery List v2 — Store, Voice Inventory & Shopping List', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('Store Mode: add aisle, add item to aisle, edit desired quantity, and persist in localStorage', async ({ page }) => {
        await expect(page.locator('#auth-status-label')).toHaveText('Local Mode');

        // Add a new aisle
        await page.click('#add-aisle-open-btn');
        await page.fill('#new-aisle-input', 'Bakery');
        await page.click('#add-aisle-form button[type="submit"]');

        const bakeryCard = page.locator('.aisle-card', { hasText: 'Bakery' });
        await expect(bakeryCard).toBeVisible();

        // Add an item into Bakery aisle
        await bakeryCard.locator('.aisle-add-input').fill('Sourdough Bread');
        await bakeryCard.locator('.aisle-add-qty').fill('2');
        await bakeryCard.locator('.aisle-add-form button[type="submit"]').click();

        const breadRow = bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' });
        await expect(breadRow).toBeVisible();
        await expect(breadRow.locator('.stepper-input')).toHaveValue('2');

        // Edit desired quantity via + button and direct input
        await breadRow.locator('button[aria-label="Increase Desired quantity for Sourdough Bread"]').click();
        await expect(breadRow.locator('.stepper-input')).toHaveValue('3');

        await breadRow.locator('.stepper-input').fill('4');
        await breadRow.locator('.stepper-input').dispatchEvent('change');
        await expect(breadRow.locator('.stepper-input')).toHaveValue('4');

        // Reload and verify localStorage persistence
        await page.reload();
        const reloadedBread = page.locator('.aisle-card', { hasText: 'Bakery' }).locator('.item-row', { hasText: 'Sourdough Bread' });
        await expect(reloadedBread.locator('.stepper-input')).toHaveValue('4');
    });

    test('Inventory Mode: voice/text <item> <count>, ambiguous suggestions, add new item, duplicate summing, and X delete', async ({ page }) => {
        await page.click('#mode-inventory-btn');

        // 1. Ambiguous match: "wipes 3" matches both "Baby Wipes" and "Disinfecting Wipes"
        await page.fill('#inventory-command-input', 'wipes 3');
        await page.click('#inventory-command-submit');

        const ambiguousEntry = page.locator('.inv-entry.ambiguous').first();
        await expect(ambiguousEntry).toBeVisible();
        await expect(ambiguousEntry).toContainText('Multiple possible matches');
        await expect(ambiguousEntry.locator('.suggestion-chip', { hasText: 'Baby Wipes' })).toBeVisible();
        await expect(ambiguousEntry.locator('.suggestion-chip', { hasText: 'Disinfecting Wipes' })).toBeVisible();

        // 2. Non-existent item: "sparkling water 6" -> option to add to store list at same time
        await page.fill('#inventory-command-input', 'sparkling water 6');
        await page.click('#inventory-command-submit');

        const unmatchedEntry = page.locator('.inv-entry.unmatched').first();
        await expect(unmatchedEntry).toBeVisible();
        await expect(unmatchedEntry).toContainText('Not in store list yet');
        await unmatchedEntry.locator('.aisle-select').selectOption({ label: 'Pantry' });
        await unmatchedEntry.locator('button', { hasText: '+ Add to Store List' }).click();

        // Should now be matched and added to Pantry
        await expect(page.locator('.inv-entry.matched', { hasText: 'Sparkling Water' })).toBeVisible();

        // 3. Resolve the ambiguous "wipes" entry later by tapping "Baby Wipes"
        await ambiguousEntry.locator('.suggestion-chip', { hasText: 'Baby Wipes' }).click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Baby Wipes' })).toBeVisible();

        // 4. Add same item multiple times ("milk 1" and "milk 2") -> individual line items, summed in background
        await page.fill('#inventory-command-input', 'milk 1');
        await page.click('#inventory-command-submit');
        await page.fill('#inventory-command-input', 'milk 2');
        await page.click('#inventory-command-submit');

        const milkEntries = page.locator('.inv-entry.matched', { hasText: 'Whole Milk' });
        await expect(milkEntries).toHaveCount(2);
        await expect(milkEntries.first()).toContainText('Total: 3');

        // 5. Delete the "milk 1" entry (last/oldest) with its X button -> sum updates from 3 to 2
        await milkEntries.last().locator('.inv-delete-btn').click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(1);

        // Verify in Store Mode that Whole Milk shows Have 2 (Want 2 -> Stocked!)
        await page.click('#mode-store-btn');
        const milkRow = page.locator('.item-row', { hasText: 'Whole Milk' });
        await expect(milkRow).toContainText('Stocked (2/2)');
        const sparklingRow = page.locator('.aisle-card', { hasText: 'Pantry' }).locator('.item-row', { hasText: 'Sparkling Water' });
        await expect(sparklingRow).toBeVisible();
    });

    test('Store Mode Shopping List: hides stocked items, shows how many to buy, sorted by aisle', async ({ page }) => {
        // Seed inventory: Whole Milk = 2 (want 2 -> stocked), Bananas = 2 (want 6 -> buy 4), Eggs = 1 (want 1 -> stocked)
        await page.click('#mode-inventory-btn');
        for (const cmd of ['whole milk 2', 'bananas 2', 'eggs 1']) {
            await page.fill('#inventory-command-input', cmd);
            await page.click('#inventory-command-submit');
        }

        await page.click('#mode-store-btn');
        await page.click('#view-shopping-btn');

        // Whole Milk and Eggs should be hidden
        await expect(page.locator('.shopping-row', { hasText: 'Whole Milk' })).toHaveCount(0);
        await expect(page.locator('.shopping-row', { hasText: 'Eggs' })).toHaveCount(0);

        // Dairy & Eggs aisle had only Milk & Eggs, so the entire aisle card should be hidden
        await expect(page.locator('.aisle-card', { hasText: 'Dairy & Eggs' })).toHaveCount(0);

        // Bananas should show "Buy 4" under Produce
        const produceCard = page.locator('.aisle-card', { hasText: 'Produce' });
        await expect(produceCard).toBeVisible();
        const bananasRow = produceCard.locator('.shopping-row', { hasText: 'Bananas' });
        await expect(bananasRow.locator('.buy-badge')).toHaveText('Buy 4');

        // Verify aisle order: Produce comes before Pantry, Pantry before Household
        const aisleTitles = await page.locator('#store-aisles-container .aisle-card .aisle-name-btn').allTextContents();
        expect(aisleTitles).toEqual(['Produce', 'Pantry', 'Household']);

        // Check off Bananas in cart and finish trip -> updates inventory
        await bananasRow.click();
        await expect(page.locator('#cart-bar-count')).toHaveText('1 in cart');
        await page.click('#cart-commit-btn');

        // Bananas is now stocked and disappears from Shopping List!
        await expect(page.locator('.shopping-row', { hasText: 'Bananas' })).toHaveCount(0);
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
        await page.click('#mode-inventory-btn');
        await page.click('#voice-mic-btn');
        await expect(page.locator('#voice-mic-btn')).toHaveClass(/listening/);

        // Simulate speech result event
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
