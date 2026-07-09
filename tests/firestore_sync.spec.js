const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ page }) => {
    // Intercept Firebase App
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js', route => {
        route.fulfill({
            contentType: 'application/javascript',
            body: `
                export function initializeApp() { return {}; }
            `
        });
    });

    // Intercept Firebase Auth
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js', route => {
        route.fulfill({
            contentType: 'application/javascript',
            body: `
                let authStateCallback = null;
                export function getAuth() { return { currentUser: { uid: 'test-user-123' } }; }
                export function onAuthStateChanged(auth, cb) {
                    authStateCallback = cb;
                }
                export function signInWithEmailAndPassword() {}
                export function createUserWithEmailAndPassword() {}
                export function signOut() {}

                window.__mockAuth = {
                    triggerLogin: (user) => {
                        if(authStateCallback) authStateCallback(user);
                    }
                };
            `
        });
    });

    // Intercept Firebase Firestore
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js', route => {
        route.fulfill({
            contentType: 'application/javascript',
            body: `
                let snapshotCallback = null;
                export function getFirestore() { return {}; }
                export function doc(db, collection, id) { return { collection, id }; }
                export function onSnapshot(docRef, cb) {
                    snapshotCallback = cb;
                    return () => {};
                }
                let writtenDocs = [];
                export async function setDoc(docRef, data) {
                    writtenDocs.push({ docRef, data });
                }

                window.__mockFirestore = {
                    triggerSnapshot: (exists, data) => {
                        if(snapshotCallback) {
                            snapshotCallback({
                                exists: () => exists,
                                data: () => data
                            });
                        }
                    },
                    getWrittenDocs: () => writtenDocs,
                    clearWrittenDocs: () => writtenDocs = []
                };
            `
        });
    });
});

test('syncWithFirestore logic: cloud empty -> push local data', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Local List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-1',
                    text: 'Local Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-1',
            updatedAt: 1000
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });

    await page.reload();

    // Wait for the app to initialize to ensure first saveAppState happens if any
    await page.waitForTimeout(500);
    await page.evaluate(() => window.__mockFirestore.clearWrittenDocs());

    await page.evaluate(() => {
        window.__mockAuth.triggerLogin({ uid: 'user123', email: 'test@example.com' });
    });

    await page.evaluate(() => {
        window.__mockFirestore.triggerSnapshot(false, null);
    });

    const docs = await page.evaluate(() => window.__mockFirestore.getWrittenDocs());

    expect(docs.length).toBe(1);
    expect(docs[0].data.lists[0].items[0].text).toBe('Local Item');
});

test('syncWithFirestore logic: cloud has data, local has data -> conflict modal', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Local List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-1',
                    text: 'Local Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-1',
            updatedAt: 1000
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });

    await page.reload();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
        window.__mockAuth.triggerLogin({ uid: 'user123', email: 'test@example.com' });
    });

    await page.evaluate(() => {
        const cloudState = {
            lists: [{
                id: 'list-2',
                name: 'Cloud List',
                theme: 'var(--theme-blue)',
                homeSections: [],
                shopSections: [],
                items: [{
                    id: 'item-2',
                    text: 'Cloud Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-2',
            updatedAt: 2000
        };
        window.__mockFirestore.triggerSnapshot(true, cloudState);
    });

    const conflictModal = page.locator('#conflict-modal-overlay');
    await expect(conflictModal).toHaveClass(/visible/);

    const localSummary = await page.locator('#local-summary').innerHTML();
    expect(localSummary).toContain('Local List');

    const cloudSummary = await page.locator('#cloud-summary').innerHTML();
    expect(cloudSummary).toContain('Cloud List');
});

test('syncWithFirestore logic: conflict modal -> keep local -> pushes to cloud', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Local List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-1',
                    text: 'Local Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-1',
            updatedAt: 1000
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });

    await page.reload();
    await page.waitForTimeout(500);

    // Clear any preliminary saves
    await page.evaluate(() => window.__mockFirestore.clearWrittenDocs());

    await page.evaluate(() => {
        window.__mockAuth.triggerLogin({ uid: 'user123', email: 'test@example.com' });
    });

    await page.evaluate(() => {
        const cloudState = {
            lists: [{
                id: 'list-2',
                name: 'Cloud List',
                theme: 'var(--theme-blue)',
                homeSections: [],
                shopSections: [],
                items: [{
                    id: 'item-2',
                    text: 'Cloud Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-2',
            updatedAt: 2000
        };
        window.__mockFirestore.triggerSnapshot(true, cloudState);
    });

    const conflictModal = page.locator('#conflict-modal-overlay');
    await expect(conflictModal).toHaveClass(/visible/);

    // Click keep local
    await page.click('#keep-local-btn');
    await expect(conflictModal).not.toHaveClass(/visible/);

    // Verify written docs contain the local state
    const docs = await page.evaluate(() => window.__mockFirestore.getWrittenDocs());
    expect(docs.length).toBe(1);
    expect(docs[0].data.lists[0].name).toBe('Local List');
});

test('syncWithFirestore logic: conflict modal -> keep cloud -> overwrites local', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Local List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-1',
                    text: 'Local Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-1',
            updatedAt: 1000
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });

    await page.reload();
    await page.waitForTimeout(500);

    await page.evaluate(() => {
        window.__mockAuth.triggerLogin({ uid: 'user123', email: 'test@example.com' });
    });

    await page.evaluate(() => {
        const cloudState = {
            lists: [{
                id: 'list-2',
                name: 'Cloud List',
                theme: 'var(--theme-blue)',
                homeSections: [],
                shopSections: [],
                items: [{
                    id: 'item-2',
                    text: 'Cloud Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-2',
            updatedAt: 2000
        };
        window.__mockFirestore.triggerSnapshot(true, cloudState);
    });

    const conflictModal = page.locator('#conflict-modal-overlay');
    await expect(conflictModal).toHaveClass(/visible/);

    // Click keep cloud
    await page.click('#keep-cloud-btn');
    await expect(conflictModal).not.toHaveClass(/visible/);

    // Wait for the state to be saved
    await page.waitForFunction(() => {
        const state = JSON.parse(localStorage.getItem('grocery-app-state') || '{}');
        return state.lists && state.lists[0] && state.lists[0].name === 'Cloud List';
    }, { timeout: 2000 });

    // Verify UI reflects the cloud state (we check list name span since the current item might be unrendered or transitioning)
    const listNameSpan = await page.locator('#current-list-name').textContent();
    expect(listNameSpan).toBe('Cloud List');

    // Verify localStorage reflects cloud state
    const savedStateStr = await page.evaluate(() => localStorage.getItem('grocery-app-state'));
    const savedState = JSON.parse(savedStateStr);
    expect(savedState.lists[0].name).toBe('Cloud List');
    expect(savedState.lists[0].items[0].text).toBe('Cloud Item');
});

test('syncWithFirestore logic: cloud updates -> overwrites local state', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.evaluate(() => {
        const state = {
            lists: [{
                id: 'list-1',
                name: 'Local List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: []
            }],
            currentListId: 'list-1',
            updatedAt: 1000
        };
        localStorage.setItem('grocery-app-state', JSON.stringify(state));
    });
    await page.reload();

    await page.waitForTimeout(500);

    await page.evaluate(() => {
        window.__mockAuth.triggerLogin({ uid: 'user123', email: 'test@example.com' });
    });

    // Wait a moment for app to react
    await page.waitForTimeout(100);

    // Fire empty snapshot to make firstSync = false
    await page.evaluate(() => {
        window.__mockFirestore.triggerSnapshot(false, null);
    });

    // Wait a moment for app to react
    await page.waitForTimeout(100);

    // Ensure we start from a clean state of written docs
    await page.evaluate(() => window.__mockFirestore.clearWrittenDocs());

    // Fire new cloud state snapshot
    await page.evaluate(() => {
        const cloudState = {
            lists: [{
                id: 'list-cloud',
                name: 'Cloud Updated List',
                theme: 'var(--theme-blue)',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: [{
                    id: 'item-3',
                    text: 'New Cloud Item',
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def',
                    homeIndex: 0,
                    shopIndex: 0,
                    haveCount: 0,
                    wantCount: 1,
                    shopCompleted: false
                }]
            }],
            currentListId: 'list-cloud',
            // Use a very high number to bypass any local changes overwriting the test timestamp
            updatedAt: Date.now() + 10000
        };
        window.__mockFirestore.triggerSnapshot(true, cloudState);
    });

    // Check local storage instead since appState is not globally exposed
    const finalState = await page.evaluate(() => JSON.parse(localStorage.getItem('grocery-app-state') || '{}'));

    // Wait for the UI to update
    await page.waitForSelector('.item-text', { timeout: 2000 });

    const itemText = await page.locator('.item-text').first().textContent();
    expect(itemText).toBe('New Cloud Item');

    const savedStateStr = await page.evaluate(() => localStorage.getItem('grocery-app-state'));
    const savedState = JSON.parse(savedStateStr);
    expect(savedState.lists[0].items[0].text).toBe('New Cloud Item');

    const docs = await page.evaluate(() => window.__mockFirestore.getWrittenDocs());
    // The second snapshot update should not trigger setDoc.
    expect(docs.length).toBe(0);
});
