const { mockFirebase, setMockState } = require('./mockFirebase');
const { test, expect } = require('@playwright/test');

test.describe('deleteListWithConfirmation', () => {
    test.beforeEach(async ({ page }) => {
  await mockFirebase(page);
    });

    test('prevents deleting the last list', async ({ page }) => {
        // Seed state with only 1 list
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Only List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: []
            }],
            currentListId: 'list-1'
        };
        await setMockState(page, { ...state, mode: 'home', editMode: true });

        // Listen for the dialog (alert)
        let dialogFired = false;
        let dialogMessage = '';
        page.on('dialog', dialog => {
            dialogFired = true;
            dialogMessage = dialog.message();
            dialog.accept();
        });

        // Trigger rename/edit modal
        await page.evaluate(() => {
            const span = document.getElementById('current-list-name');
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
            span.dispatchEvent(clickEvent);
            setTimeout(() => span.dispatchEvent(clickEvent), 50);
        });

        // Wait for modal to be visible
        const editModal = page.locator('#modal-overlay');
        await expect(editModal).toHaveClass(/visible/);

        // Click the delete button
        await page.click('#modal-delete-btn', { force: true });

        // Verify alert was shown
        expect(dialogFired).toBe(true);
        expect(dialogMessage).toBe("You must have at least one list.");
    });

    test('deletes a list successfully when multiple exist', async ({ page }) => {
        const state = {
            lists: [
                {
                    id: 'list-1',
                    name: 'First List',
                    theme: 'var(--theme-blue)',
                    homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                    shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                    items: []
                },
                {
                    id: 'list-2',
                    name: 'Second List',
                    theme: 'var(--theme-blue)',
                    homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                    shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                    items: []
                }
            ],
            currentListId: 'list-2'
        };
        await setMockState(page, { ...state, mode: 'home', editMode: true });

        // Trigger rename/edit modal for list-2
        await page.evaluate(() => {
            const span = document.getElementById('current-list-name');
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
            span.dispatchEvent(clickEvent);
            setTimeout(() => span.dispatchEvent(clickEvent), 50);
        });

        // Wait for modal to be visible
        const editModal = page.locator('#modal-overlay');
        await expect(editModal).toHaveClass(/visible/);

        // Click the delete button
        await page.click('#modal-delete-btn', { force: true });

        // Verify edit modal is closed and delete confirmation modal is open
        const deleteModal = page.locator('#delete-modal-overlay');
        await expect(deleteModal).toHaveClass(/visible/);

        // Click confirm
        await page.click('#delete-confirm-btn', { force: true });

        // Verify delete modal is closed
        await expect(deleteModal).not.toHaveClass(/visible/);

        // Verify state is updated
        const finalState = await page.evaluate(() => window.__MOCK_FIREBASE_STATE__);
        expect(finalState.lists.length).toBe(1);
        expect(finalState.lists[0].id).toBe('list-1');
        expect(finalState.currentListId).toBe('list-1');

        // Verify UI is updated to show 'First List'
        const currentListName = page.locator('#current-list-name');
        await expect(currentListName).toHaveText('First List');
    });
});
