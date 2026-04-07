const { test: base, expect } = require('@playwright/test');

const test = base.extend({
  page: async ({ page }, use) => {
    // Intercept Firebase modules
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js', route => {
      route.fulfill({ contentType: 'application/javascript', body: 'export const initializeApp = () => ({});' });
    });
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js', route => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          export const getAuth = () => ({ currentUser: { uid: "test-user", email: "test@example.com" } });
          export const onAuthStateChanged = (auth, callback) => {
            callback({ uid: "test-user", email: "test@example.com" });
            return () => {};
          };
          export const signInWithEmailAndPassword = async () => {};
          export const createUserWithEmailAndPassword = async () => {};
          export const signOut = async () => {};
        `
      });
    });
    await page.route('https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js', route => {
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          export const getFirestore = () => ({});
          export const doc = () => ({});
          export const onSnapshot = () => () => {};
          export const setDoc = async () => {};
        `
      });
    });
    await use(page);
  },
});

module.exports = { test, expect };
