const { test, expect } = require('./test-utils');

test.describe('deleteListWithConfirmation', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto('http://localhost:3000');
    });

    test('prevents deleting the last list', async ({ page }) => {
        // Seed state with only 1 list
        await page.evaluate(() => localStorage.clear());
        await page.evaluate(() => {
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
            localStorage.setItem('grocery-app-state', JSON.stringify(state));
            localStorage.setItem('grocery-edit-mode', 'true');
        });
        await page.reload();

        // Listen for the dialog (alert)
        let dialogFired = false;
        let dialogMessage = '';
        page.on('dialog', dialog => {
            dialogFired = true;
            dialogMessage = dialog.message();
            dialog.accept();
        });

        // Use standard Playwright click - since #current-list-name dblclick doesn't work,
        // Let's use the menu item long press as alternative or directly evaluate the function
        // if UI interaction is too flaky. But UI is better.
        // Trigger rename
        await page.evaluate(() => {
            const span = document.getElementById('current-list-name');
            const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
            span.dispatchEvent(clickEvent);
            setTimeout(() => span.dispatchEvent(clickEvent), 50);
        });

        // Wait for modal to be visible
        const modal = page.locator('#modal-overlay');
        await expect(modal).toHaveClass(/visible/);

        // Click the delete button
        await page.click('#modal-delete-btn', { force: true });

        // Verify alert was shown
        expect(dialogFired).toBe(true);
        expect(dialogMessage).toBe('You must have at least one list.');

        // Verify state is unchanged
        const stateStr = await page.evaluate(() => localStorage.getItem('grocery-app-state'));
        const state = JSON.parse(stateStr);
        expect(state.lists.length).toBe(1);
    });

    test('deletes list with confirmation when multiple lists exist', async ({ page }) => {
        // Seed state with 2 lists
        await page.evaluate(() => localStorage.clear());
        await page.evaluate(() => {
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
            localStorage.setItem('grocery-app-state', JSON.stringify(state));
            localStorage.setItem('grocery-edit-mode', 'true');
        });
        await page.reload();

        // Trigger rename
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
        const stateStr = await page.evaluate(() => localStorage.getItem('grocery-app-state'));
        const state = JSON.parse(stateStr);
        expect(state.lists.length).toBe(1);
        expect(state.lists[0].id).toBe('list-1');
        expect(state.currentListId).toBe('list-1');

        // Verify UI is updated to show 'First List'
        const currentListName = page.locator('#current-list-name');
        await expect(currentListName).toHaveText('First List');
    });
});
