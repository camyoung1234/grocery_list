const { test, expect } = require('@playwright/test');
const { setupFirebaseMock } = require('./mockFirebase');

test.describe('Grocery List v2 — Bottom Bar, Search Toggle, Undo Delete & Shopping Checkboxes', () => {
    test.beforeEach(async ({ page }) => {
        await setupFirebaseMock(page, null);
        await page.goto('/');
        await page.evaluate(() => localStorage.clear());
        await page.reload();
    });

    test('Bottom bar tab order (Inventory, Shopping, All Items), no shopping count chip, Search bar replacement, Add aisle/item via header button, Undo button without banners, and localStorage persistence', async ({ page }) => {
        // Verify bottom bar with 3-way toggle, search button, undo button, and settings button
        await expect(page.locator('#bottom-nav-bar')).toBeVisible();
        await expect(page.locator('#search-open-btn')).toBeVisible();
        await expect(page.locator('#undo-btn')).toBeVisible();
        await expect(page.locator('#undo-btn')).toBeDisabled();
        await expect(page.locator('#settings-open-btn')).toBeVisible();
        await expect(page.locator('#shopping-count-badge')).toHaveCount(0);

        // Verify viewport meta includes interactive-widget=resizes-content
        const viewportContent = await page.locator('meta[name="viewport"]').getAttribute('content');
        expect(viewportContent).toContain('interactive-widget=resizes-content');

        // Verify bottom tab order is Inventory, Shopping, All Items (with SVG icons), with All Items active by default
        const tabLabels = await page.locator('.segmented-nav .segmented-tab').evaluateAll(
            tabs => tabs.map(t => t.getAttribute('aria-label'))
        );
        expect(tabLabels).toEqual(['Inventory', 'Shopping', 'All Items']);
        await expect(page.locator('.segmented-nav .segmented-tab svg.tab-icon')).toHaveCount(3);
        await expect(page.locator('#tab-all-btn')).toHaveClass(/active/);

        // Verify old inline add-item row at the bottom of aisles is removed
        await expect(page.locator('.aisle-add-form')).toHaveCount(0);

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

        // Add a new aisle and item via the "Add Item" button on the aisle header row
        await page.click('#add-aisle-open-btn');
        await page.fill('#new-aisle-input', 'Bakery');
        await page.click('#add-aisle-form button[type="submit"]');

        const bakeryCard = page.locator('.aisle-card', { hasText: 'Bakery' });
        const addItemBtn = bakeryCard.locator('.aisle-header .aisle-add-item-btn');
        await expect(addItemBtn).toHaveText('Add Item');
        await addItemBtn.click();

        const inlineNameInput = bakeryCard.locator('.item-row .item-name-input');
        await expect(inlineNameInput).toBeFocused();
        await inlineNameInput.fill('Sourdough Bread');
        await inlineNameInput.press('Enter');

        const breadRow = bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' });
        await expect(breadRow.locator('.stepper-input')).toHaveValue('1');
        await breadRow.locator('button[aria-label="Increase Desired quantity for Sourdough Bread"]').click();
        await breadRow.locator('button[aria-label="Increase Desired quantity for Sourdough Bread"]').click();
        await expect(breadRow.locator('.stepper-input')).toHaveValue('3');

        // Decrement Sourdough Bread to 0 -> minus button becomes X, then click X to delete + Undo via #undo-btn (no undo banner)
        const decBtn = breadRow.locator('button[aria-label="Decrease Desired quantity for Sourdough Bread"]');
        await decBtn.click(); // 2
        await decBtn.click(); // 1
        await decBtn.click(); // 0
        await expect(breadRow.locator('.stepper-input')).toHaveValue('0');

        const delAtZeroBtn = breadRow.locator('button[aria-label="Delete Desired quantity for Sourdough Bread"]');
        await expect(delAtZeroBtn).toHaveText('×');
        await delAtZeroBtn.click();

        await expect(bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' })).toHaveCount(0);
        await expect(page.locator('.toast-undo-btn')).toHaveCount(0);
        await expect(page.locator('#undo-btn')).toBeEnabled();
        await page.click('#undo-btn');
        await expect(bakeryCard.locator('.item-row', { hasText: 'Sourdough Bread' })).toBeVisible();

        // Restore desired quantity to 3 and verify localStorage persistence
        await breadRow.locator('.stepper-input').fill('3');
        await breadRow.locator('.stepper-input').dispatchEvent('change');

        // Reload and verify localStorage persistence
        await page.reload();
        const reloadedBread = page.locator('.aisle-card', { hasText: 'Bakery' }).locator('.item-row', { hasText: 'Sourdough Bread' });
        await expect(reloadedBread.locator('.stepper-input')).toHaveValue('3');
    });

    test('All Items: drag-and-drop handle sorts items within a section and persists order', async ({ page }) => {
        const householdCard = page.locator('.aisle-card', { hasText: 'Household' });
        const getItemNames = () => householdCard.locator('.item-row .item-name-btn').allTextContents();

        expect(await getItemNames()).toEqual(['Baby Wipes', 'Disinfecting Wipes', 'Paper Towels']);

        // Drag "Paper Towels" handle up to "Baby Wipes" handle
        const paperTowelsHandle = householdCard.locator('.item-row', { hasText: 'Paper Towels' }).locator('.item-drag-handle');
        const babyWipesHandle = householdCard.locator('.item-row', { hasText: 'Baby Wipes' }).locator('.item-drag-handle');
        await paperTowelsHandle.dragTo(babyWipesHandle);

        expect(await getItemNames()).toEqual(['Paper Towels', 'Baby Wipes', 'Disinfecting Wipes']);

        // Reload and verify order persists in localStorage and in Shopping List
        await page.reload();
        expect(await getItemNames()).toEqual(['Paper Towels', 'Baby Wipes', 'Disinfecting Wipes']);

        await page.click('#tab-shopping-btn');
        const shoppingHousehold = page.locator('.aisle-card', { hasText: 'Household' });
        const shoppingNames = await shoppingHousehold.locator('.shopping-row .shopping-item-name').allTextContents();
        expect(shoppingNames).toEqual(['Paper Towels', 'Baby Wipes', 'Disinfecting Wipes']);
    });

    test('Inventory Mode: expanding bottom bar does NOT focus input, Enter keeps input focused, ambiguous suggestions, add new item, duplicate summing, and Undo X delete', async ({ page }) => {
        await page.click('#tab-inventory-btn');

        // Bottom bar expands to #bottom-inventory-bar and does NOT focus #inventory-command-input
        await expect(page.locator('#bottom-nav-bar')).toBeHidden();
        await expect(page.locator('#bottom-inventory-bar')).toBeVisible();
        const cmdInput = page.locator('#inventory-command-input');
        await expect(cmdInput).not.toBeFocused();

        // 1. Ambiguous match via typing + Enter, and verify input stays focused
        await cmdInput.fill('wipes 3');
        await cmdInput.press('Enter');
        await expect(cmdInput).toHaveValue('');
        await expect(cmdInput).toBeFocused();

        const ambiguousEntry = page.locator('.inv-entry.ambiguous').first();
        await expect(ambiguousEntry).toBeVisible();
        await expect(ambiguousEntry.locator('.suggestion-chip', { hasText: 'Baby Wipes' })).toBeVisible();
        await expect(ambiguousEntry.locator('.suggestion-chip', { hasText: 'Disinfecting Wipes' })).toBeVisible();

        // 2. Non-existent item
        await cmdInput.fill('sparkling water 6');
        await cmdInput.press('Enter');
        await expect(cmdInput).toBeFocused();

        const unmatchedEntry = page.locator('.inv-entry.unmatched').first();
        await unmatchedEntry.locator('.aisle-select').selectOption({ label: 'Pantry' });
        await unmatchedEntry.locator('button', { hasText: '+ Add to Store List' }).click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Sparkling Water' })).toBeVisible();

        // 3. Resolve ambiguous "wipes"
        await ambiguousEntry.locator('.suggestion-chip', { hasText: 'Baby Wipes' }).click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Baby Wipes' })).toBeVisible();

        // 4. Duplicate summing
        await cmdInput.fill('milk 1');
        await cmdInput.press('Enter');
        await cmdInput.fill('milk 2');
        await cmdInput.press('Enter');

        const milkEntries = page.locator('.inv-entry.matched', { hasText: 'Whole Milk' });
        await expect(milkEntries).toHaveCount(2);
        await expect(milkEntries.first()).toContainText('Total: 3');

        // 5. Decrement "milk 1" to 0 -> minus becomes X, click X to delete -> Undo via #undo-btn restores, then delete again
        const milk1Row = milkEntries.last();
        await milk1Row.locator('button[aria-label="Decrease Count for Milk"]').click();
        await expect(milk1Row.locator('.stepper-input')).toHaveValue('0');
        await milk1Row.locator('button[aria-label="Delete Count for Milk"]').click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(1);
        await expect(page.locator('.toast-undo-btn')).toHaveCount(0);

        // Close bottom inventory bar to access #undo-btn, undo, then re-delete
        await page.click('#inventory-close-btn');
        await expect(page.locator('#bottom-nav-bar')).toBeVisible();
        await page.click('#undo-btn');
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(2);

        await milkEntries.last().locator('button[aria-label="Delete Count for Milk"]').click();
        await expect(page.locator('.inv-entry.matched', { hasText: 'Whole Milk' })).toHaveCount(1);

        // Switch to All Items
        await page.click('#tab-all-btn');
        await expect(page.locator('.item-row', { hasText: 'Whole Milk' })).toContainText('Stocked (2/2)');
    });

    test('Shopping List: number inside unchecked box replaced by checkmark when checked, no "Buy" label, Clear Checks', async ({ page }) => {
        await page.click('#tab-inventory-btn');
        const cmdInput = page.locator('#inventory-command-input');
        for (const cmd of ['whole milk 2', 'bananas 2', 'eggs 1']) {
            await cmdInput.fill(cmd);
            await cmdInput.press('Enter');
        }

        await page.click('#inventory-close-btn');
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

    test('Inventory Mode: simulated Web Speech API voice recognition streams items as words arrive ("Raisin bran one maple syrup one")', async ({ page }) => {
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
        await expect(page.locator('#bottom-inventory-bar')).toBeVisible();
        await expect(page.locator('#voice-mic-btn')).toHaveClass(/listening/);

        // 1. User starts saying "Raisin bran" (interim) -> shown in bottom input, not logged yet
        await page.evaluate(() => {
            window.__mockRec.onresult({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'Raisin bran' }], { isFinal: false })
                ]
            });
        });
        await expect(page.locator('#inventory-command-input')).toHaveValue('Raisin bran');
        await expect(page.locator('.inv-entry')).toHaveCount(0);

        // 2. User says "one" -> "Raisin bran one" (still interim!) immediately logs ("Raisin Bran", 1) and clears input
        await page.evaluate(() => {
            window.__mockRec.onresult({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'Raisin bran one' }], { isFinal: false })
                ]
            });
        });
        await expect(page.locator('#inventory-command-input')).toHaveValue('');
        await expect(page.locator('.inv-entry', { hasText: 'Raisin Bran' })).toBeVisible();
        await expect(page.locator('.inv-entry', { hasText: 'Raisin Bran' }).locator('.stepper-input')).toHaveValue('1');

        // 3. User continues speaking in the same stream: "Raisin bran one maple syrup" (interim)
        // "Raisin Bran" is NOT duplicated, and only the unconsumed words "maple syrup" appear in the input box
        await page.evaluate(() => {
            window.__mockRec.onresult({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'Raisin bran one maple syrup' }], { isFinal: false })
                ]
            });
        });
        await expect(page.locator('#inventory-command-input')).toHaveValue('maple syrup');
        await expect(page.locator('.inv-entry')).toHaveCount(1);

        // 4. User says "one" -> "Raisin bran one maple syrup one" (interim, then final)
        // Immediately logs ("Maple Syrup", 1) without duplicating ("Raisin Bran", 1)
        await page.evaluate(() => {
            window.__mockRec.onresult({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'Raisin bran one maple syrup one' }], { isFinal: false })
                ]
            });
        });
        await expect(page.locator('#inventory-command-input')).toHaveValue('');
        await expect(page.locator('.inv-entry')).toHaveCount(2);
        await expect(page.locator('.inv-entry', { hasText: 'Maple Syrup' })).toBeVisible();
        await expect(page.locator('.inv-entry', { hasText: 'Maple Syrup' }).locator('.stepper-input')).toHaveValue('1');

        // 5. Final event for that utterance does not duplicate either item
        await page.evaluate(() => {
            window.__mockRec.onresult({
                resultIndex: 0,
                results: [
                    Object.assign([{ transcript: 'Raisin bran one maple syrup one' }], { isFinal: true })
                ]
            });
        });
        await expect(page.locator('.inv-entry')).toHaveCount(2);
    });

    test('One-time migration from legacy v1 lists flattens multiple stores and preserves original v1 data', async ({ page }) => {
        const legacyDoc = {
            currentListId: 'store-1',
            lists: [
                {
                    id: 'store-1',
                    name: 'Trader Joes',
                    shopSections: [
                        { id: 'sec-s-1', name: 'Produce' },
                        { id: 'sec-s-2', name: 'Dairy' }
                    ],
                    items: [
                        { id: 'i1', text: 'Apples', wantCount: 5, haveCount: 2, shopSectionId: 'sec-s-1', shopIndex: 0 },
                        { id: 'i2', text: 'Milk', wantCount: 2, haveCount: 1, shopSectionId: 'sec-s-2', shopIndex: 1 }
                    ]
                },
                {
                    id: 'store-2',
                    name: 'Costco',
                    shopSections: [
                        { id: 'sec-c-1', name: 'Produce' },
                        { id: 'sec-c-2', name: 'Bulk Paper' }
                    ],
                    items: [
                        { id: 'i3', text: 'Paper Towels', wantCount: 3, haveCount: 0, shopSectionId: 'sec-c-2', shopIndex: 0 },
                        { id: 'i4', text: 'Avocados', wantCount: 4, haveCount: 0, shopSectionId: 'sec-c-1', shopIndex: 1 }
                    ]
                }
            ]
        };

        await setupFirebaseMock(page, legacyDoc);
        await page.goto('/');

        // Flattened into single list: Produce (merged!), Dairy, Bulk Paper
        await expect(page.locator('.aisle-card .aisle-name-btn', { hasText: 'Produce' })).toHaveCount(1);
        await expect(page.locator('.aisle-card .aisle-name-btn', { hasText: 'Dairy' })).toBeVisible();
        await expect(page.locator('.aisle-card .aisle-name-btn', { hasText: 'Bulk Paper' })).toBeVisible();

        const produceCard = page.locator('.aisle-card', { hasText: 'Produce' });
        await expect(produceCard.locator('.item-row', { hasText: 'Apples' })).toBeVisible();
        await expect(produceCard.locator('.item-row', { hasText: 'Avocados' })).toBeVisible();
        await expect(page.locator('.item-row', { hasText: 'Paper Towels' }).locator('.stepper-input')).toHaveValue('3');

        // Verify Firestore setDoc was called with { v2: ... } and { merge: true }, leaving legacy lists intact!
        const docState = await page.evaluate(() => ({
            doc: window.__mockFirestoreDoc,
            calls: window.__mockSetDocCalls
        }));

        expect(docState.calls.length).toBeGreaterThan(0);
        expect(docState.calls[0].options).toEqual({ merge: true });
        expect(Object.keys(docState.calls[0].data)).toEqual(['v2']);
        expect(docState.doc.lists).toHaveLength(2);
        expect(docState.doc.currentListId).toBe('store-1');
    });

    test('Inventory Mode: no number chip on inventory icon, unresolved items stay at top, and 3-way sort setting (added, alphabetical, aisle)', async ({ page }) => {
        // Verify no number chip exists on the inventory tab button
        await expect(page.locator('#inventory-pending-badge')).toHaveCount(0);
        await expect(page.locator('#tab-inventory-btn .nav-badge')).toHaveCount(0);

        await page.click('#tab-inventory-btn');
        const cmdInput = page.locator('#inventory-command-input');

        // Add an ambiguous item ("wipes 2") and an unmatched item ("sparkling water 3")
        await cmdInput.fill('wipes 2');
        await cmdInput.press('Enter');
        await cmdInput.fill('sparkling water 3');
        await cmdInput.press('Enter');

        // Add matched items in an order where 'added', 'alphabetical', and 'aisle' all produce distinct results:
        // 1. Baby Spinach (Produce)
        // 2. Eggs (Dairy & Eggs)
        // 3. Bananas (Produce)
        // 4. Pasta (Pantry)
        for (const cmd of ['baby spinach 1', 'eggs 1', 'bananas 2', 'pasta 1']) {
            await cmdInput.fill(cmd);
            await cmdInput.press('Enter');
        }

        // Still no number chip on inventory icon even with unresolved items
        await expect(page.locator('#tab-inventory-btn .nav-badge')).toHaveCount(0);

        const getEntryTitles = () => page.locator('#inventory-entries-list .inv-entry .inv-entry-title > span:first-child').allTextContents();

        // 1. Default ('added'): unresolved items at top (newest first), followed by matched items in order added (newest first)
        expect(await getEntryTitles()).toEqual([
            '"Sparkling Water"',
            '"Wipes"',
            'Pasta',
            'Bananas',
            'Eggs',
            'Baby Spinach'
        ]);

        // Close inventory bar to access Settings
        await page.click('#inventory-close-btn');
        await page.click('#settings-open-btn');
        await expect(page.locator('#setting-inventory-sort')).toHaveValue('added');

        // 2. Switch to Alphabetical -> unresolved still at top, matched sorted A-Z
        await page.selectOption('#setting-inventory-sort', 'alphabetical');
        await page.click('#settings-close-btn');

        expect(await getEntryTitles()).toEqual([
            '"Sparkling Water"',
            '"Wipes"',
            'Baby Spinach',
            'Bananas',
            'Eggs',
            'Pasta'
        ]);

        // 3. Switch to By aisle -> unresolved still at top, matched sorted by aisle order (Produce: Bananas, Baby Spinach; Dairy & Eggs: Eggs; Pantry: Pasta)
        await page.click('#settings-open-btn');
        await page.selectOption('#setting-inventory-sort', 'aisle');
        await page.click('#settings-close-btn');

        expect(await getEntryTitles()).toEqual([
            '"Sparkling Water"',
            '"Wipes"',
            'Bananas',
            'Baby Spinach',
            'Eggs',
            'Pasta'
        ]);

        // Verify setting persists across reload
        await page.reload();
        await expect(page.locator('#inventory-view')).toBeVisible();
        expect(await getEntryTitles()).toEqual([
            '"Sparkling Water"',
            '"Wipes"',
            'Bananas',
            'Baby Spinach',
            'Eggs',
            'Pasta'
        ]);
    });
});
