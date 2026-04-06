const { test, expect } = require('@playwright/test');

test.describe('restoreFromHash', () => {

    const generateHash = async (page, stateToHash, modeToHash) => {
        return await page.evaluate(async ({ stateToHash, modeToHash }) => {
            const payload = JSON.stringify({
                appState: stateToHash,
                mode: modeToHash
            });
            const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
            const compressed = await new Response(stream).arrayBuffer();
            const bytes = new Uint8Array(compressed);
            const chunks = [];
            const CHUNK_SIZE = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE)));
            }
            return btoa(chunks.join(''));
        }, { stateToHash, modeToHash });
    };

    const mockInitialState = {
        lists: [{
            id: 'list-old',
            name: 'Old List',
            theme: 'var(--theme-blue)',
            homeSections: [{ id: 'sec-h-1', name: 'Home Section' }],
            shopSections: [{ id: 'sec-s-1', name: 'Shop Section' }],
            items: []
        }],
        currentListId: 'list-old'
    };

    const mockNewState = {
        lists: [{
            id: 'list-new',
            name: 'Shared List',
            theme: 'var(--theme-green)',
            homeSections: [{ id: 'sec-h-2', name: 'Shared Home' }],
            shopSections: [{ id: 'sec-s-2', name: 'Shared Shop' }],
            items: []
        }],
        currentListId: 'list-new'
    };

    test.beforeEach(async ({ page }) => {
        await page.goto('/');
        await page.evaluate((state) => {
            localStorage.setItem('grocery-app-state', JSON.stringify(state));
            localStorage.setItem('grocery-mode', 'home');
        }, mockInitialState);
    });

    test('Confirm restore overwrites local state', async ({ page }) => {
        const hash = await generateHash(page, mockNewState, 'shop');

        await page.goto(`/#${hash}`);
        await page.reload();

        const modal = page.locator('#restore-modal-overlay');
        await expect(modal).toHaveClass(/visible/);

        await page.click('#restore-confirm-btn');

        await expect(modal).not.toHaveClass(/visible/);

        const storedState = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery-app-state')));
        expect(storedState.currentListId).toBe('list-new');

        const storedMode = await page.evaluate(() => localStorage.getItem('grocery-mode'));
        expect(storedMode).toBe('shop');
    });

    test('Cancel restore leaves local state intact', async ({ page }) => {
        const hash = await generateHash(page, mockNewState, 'shop');

        await page.goto(`/#${hash}`);
        await page.reload();

        const modal = page.locator('#restore-modal-overlay');
        await expect(modal).toHaveClass(/visible/);

        await page.click('#restore-cancel-btn');

        await expect(modal).not.toHaveClass(/visible/);

        const storedState = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery-app-state')));
        expect(storedState.currentListId).toBe('list-old');

        const storedMode = await page.evaluate(() => localStorage.getItem('grocery-mode'));
        expect(storedMode).toBe('home');
    });

    test('Skip prompt if state exactly matches', async ({ page }) => {
        const hash = await generateHash(page, mockInitialState, 'home');

        await page.goto(`/#${hash}`);
        await page.reload();

        const modal = page.locator('#restore-modal-overlay');
        await expect(modal).not.toHaveClass(/visible/);

        const storedState = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery-app-state')));
        expect(storedState.currentListId).toBe('list-old');
    });

    test('Invalid hash does not crash the app and does not show modal', async ({ page }) => {
        await page.goto(`/#invalid-hash-12345`);
        await page.reload();

        const modal = page.locator('#restore-modal-overlay');
        await expect(modal).not.toHaveClass(/visible/);

        const storedState = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery-app-state')));
        expect(storedState.currentListId).toBe('list-old');
    });
});
