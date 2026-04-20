import { test, expect } from '@playwright/test';
import { mockFirebase, setMockState } from './mockFirebase';

test.describe('Focus quantity field behavior', () => {
    test.beforeEach(async ({ page }) => {
        await mockFirebase(page);
        await page.goto('/');
        await page.waitForSelector('.app-container:not(.hidden)');
    });

    test('focusing quantity field clears show-controls from another item', async ({ page }) => {
        await setMockState(page, {
            mode: 'home',
            editMode: false,
            lists: [{
                id: 'list-1',
                name: 'Grocery List',
                theme: 'var(--theme-blue)',
                accent: 'var(--theme-amber)',
                homeSections: [{ id: 'sec-1', name: 'Section 1' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [
                    { id: 'item-1', text: 'Item 1', homeSectionId: 'sec-1', shopSectionId: 'sec-s-def', haveCount: 0, wantCount: 1, shopCompleted: false, homeIndex: 0, shopIndex: 0 },
                    { id: 'item-2', text: 'Item 2', homeSectionId: 'sec-1', shopSectionId: 'sec-s-def', haveCount: 0, wantCount: 1, shopCompleted: false, homeIndex: 1, shopIndex: 1 }
                ]
            }]
        });

        const item1 = page.locator('.grocery-item[data-id="item-1"]');
        const item2 = page.locator('.grocery-item[data-id="item-2"]');
        await expect(item1).toBeVisible();

        // Single tap Item 1 to show controls
        await item1.locator('.item-text').click();
        await expect(item1).toHaveClass(/show-controls/);

        // Focus Item 2's quantity field
        const qty2 = item2.locator('.qty-input');
        await qty2.focus();

        // Item 1 should no longer have show-controls
        await expect(item1).not.toHaveClass(/show-controls/);
    });

    test('focusing quantity field clears inline edit from another item', async ({ page }) => {
        await setMockState(page, {
            mode: 'home',
            editMode: true,
            lists: [{
                id: 'list-1',
                name: 'Grocery List',
                theme: 'var(--theme-blue)',
                accent: 'var(--theme-amber)',
                homeSections: [{ id: 'sec-1', name: 'Section 1' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [
                    { id: 'item-1', text: 'Item 1', homeSectionId: 'sec-1', shopSectionId: 'sec-s-def', haveCount: 0, wantCount: 1, shopCompleted: false, homeIndex: 0, shopIndex: 0 },
                    { id: 'item-2', text: 'Item 2', homeSectionId: 'sec-1', shopSectionId: 'sec-s-def', haveCount: 0, wantCount: 1, shopCompleted: false, homeIndex: 1, shopIndex: 1 }
                ]
            }]
        });

        const item1 = page.locator('.grocery-item[data-id="item-1"]');
        const item2 = page.locator('.grocery-item[data-id="item-2"]');
        await expect(item1).toBeVisible();

        // Simulate double tap using two clicks as custom onDoubleTap uses click timing
        await item1.locator('.item-text').click();
        await item1.locator('.item-text').click();

        const inlineInput = item1.locator('.inline-edit-input');
        await expect(inlineInput).toBeVisible();

        // Focus Item 2's quantity field
        const qty2 = item2.locator('.qty-input');
        await qty2.focus();

        // Item 1 should no longer be in edit mode
        await expect(inlineInput).not.toBeAttached();
    });
});
