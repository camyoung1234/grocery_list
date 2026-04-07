
const { test, expect } = require('@playwright/test');

/**
 * Mock Firebase services for Playwright tests.
 */
async function mockFirebase(page, initialState = null) {
    // Shared state between the test and the browser
    await page.addInitScript((state) => {
        const defaultState = {
            lists: [{
                id: 'list-1',
                name: 'Grocery List',
                theme: 'var(--theme-blue)',
                accent: 'var(--theme-amber)',
                homeSections: [],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: []
            }],
            currentListId: 'list-1',
            mode: 'home',
            editMode: true,
            updatedAt: Date.now() + 10000 // Future dated
        };

        if (state) {
            window.__MOCK_FIREBASE_STATE__ = { ...state };
            if (window.__MOCK_FIREBASE_STATE__.updatedAt === undefined) {
                window.__MOCK_FIREBASE_STATE__.updatedAt = Date.now() + 10000;
            }
        } else {
            window.__MOCK_FIREBASE_STATE__ = defaultState;
        }

        window.__MOCK_USER__ = { uid: 'test-user-id', email: 'test@example.com', isAnonymous: false };
        window.__FIREBASE_SNAPSHOT_CALLBACKS__ = [];
    }, initialState);

    // Mock Firebase App
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js', async (route) => {
        await route.fulfill({
            contentType: 'application/javascript',
            body: `export const initializeApp = () => ({});`
        });
    });

    // Mock Firebase Auth
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js', async (route) => {
        await route.fulfill({
            contentType: 'application/javascript',
            body: `
                export const getAuth = () => ({});
                export const onAuthStateChanged = (auth, callback) => {
                    callback(window.__MOCK_USER__);
                    return () => {};
                };
                export const signInWithEmailAndPassword = async () => ({ user: window.__MOCK_USER__ });
                export const createUserWithEmailAndPassword = async () => ({ user: window.__MOCK_USER__ });
                export const signOut = async () => { window.__MOCK_USER__ = null; };
                export const signInAnonymously = async () => {
                    window.__MOCK_USER__ = { uid: 'anon-user-id', isAnonymous: true };
                    return { user: window.__MOCK_USER__ };
                };
                export const getAuthResponse = () => ({});
            `
        });
    });

    // Mock Firebase Firestore
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js', async (route) => {
        await route.fulfill({
            contentType: 'application/javascript',
            body: `
                export const initializeFirestore = () => ({});
                export const persistentLocalCache = () => ({});
                export const persistentMultipleTabManager = () => ({});
                export const doc = (db, collection, id) => ({ path: collection + '/' + id });
                export const onSnapshot = (docRef, callback) => {
                    const notify = () => {
                        if (window.__MOCK_FIREBASE_STATE__) {
                            callback({
                                exists: () => true,
                                data: () => window.__MOCK_FIREBASE_STATE__
                            });
                        }
                    };
                    window.__FIREBASE_SNAPSHOT_CALLBACKS__.push(notify);
                    notify();
                    return () => {
                        window.__FIREBASE_SNAPSHOT_CALLBACKS__ = window.__FIREBASE_SNAPSHOT_CALLBACKS__.filter(cb => cb !== notify);
                    };
                };
                export const setDoc = async (docRef, data) => {
                    window.__MOCK_FIREBASE_STATE__ = data;
                    window.__FIREBASE_SNAPSHOT_CALLBACKS__.forEach(cb => cb());
                };
            `
        });
    });
}

/**
 * Update the mocked Firestore state within the browser.
 */
async function setMockState(page, newState) {
    await page.evaluate((state) => {
        window.__MOCK_FIREBASE_STATE__ = {
            ...window.__MOCK_FIREBASE_STATE__,
            ...state,
            updatedAt: Date.now() + 20000
        };
        if (window.__FIREBASE_SNAPSHOT_CALLBACKS__) {
            window.__FIREBASE_SNAPSHOT_CALLBACKS__.forEach(cb => cb());
        }
    }, newState);
}

module.exports = { mockFirebase, setMockState };
