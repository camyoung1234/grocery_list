async function setupFirebaseMock(page, initialRemoteDoc = null) {
    await page.addInitScript((seedDoc) => {
        window.__mockFirestoreDoc = seedDoc ? JSON.parse(JSON.stringify(seedDoc)) : null;
        window.__mockSetDocCalls = [];
        window.__mockAuthUser = { uid: 'test-user', email: 'test@example.com' };
    }, initialRemoteDoc);

    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `export function initializeApp(cfg) { return { cfg }; }`
        });
    });

    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `
                const listeners = new Set();
                const authObj = {
                    get currentUser() { return window.__mockAuthUser; }
                };
                export function getAuth() { return authObj; }
                export function onAuthStateChanged(auth, cb) {
                    listeners.add(cb);
                    setTimeout(() => cb(window.__mockAuthUser), 0);
                    return () => listeners.delete(cb);
                }
                export async function signInWithEmailAndPassword(auth, email) {
                    window.__mockAuthUser = { uid: 'test-user', email };
                    listeners.forEach(cb => cb(window.__mockAuthUser));
                    return { user: window.__mockAuthUser };
                }
                export async function createUserWithEmailAndPassword(auth, email) {
                    window.__mockAuthUser = { uid: 'test-user', email };
                    listeners.forEach(cb => cb(window.__mockAuthUser));
                    return { user: window.__mockAuthUser };
                }
                export async function signOut() {
                    window.__mockAuthUser = null;
                    listeners.forEach(cb => cb(null));
                }
            `
        });
    });

    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js', async route => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `
                export function persistentLocalCache() { return {}; }
                export function persistentMultipleTabManager() { return {}; }
                export function initializeFirestore() { return {}; }
                export function doc(db, col, id) { return { path: col + '/' + id }; }
                export function onSnapshot(docRef, onNext) {
                    setTimeout(() => {
                        const data = window.__mockFirestoreDoc;
                        onNext({
                            exists: () => Boolean(data),
                            data: () => data ? JSON.parse(JSON.stringify(data)) : undefined
                        });
                    }, 0);
                    return () => {};
                }
                export async function setDoc(docRef, data, options) {
                    window.__mockSetDocCalls.push({ data: JSON.parse(JSON.stringify(data)), options: options || null });
                    if (options && options.merge) {
                        window.__mockFirestoreDoc = Object.assign({}, window.__mockFirestoreDoc || {}, data);
                    } else {
                        window.__mockFirestoreDoc = JSON.parse(JSON.stringify(data));
                    }
                }
            `
        });
    });
}

module.exports = { setupFirebaseMock };
