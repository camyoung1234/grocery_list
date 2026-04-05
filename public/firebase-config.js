// Firebase Configuration for Grocery List Backup
// Import this script in index.html before app.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyA8hTcqZ_I3zIsSC9Vq_XEg6T6KWaUav20",
  authDomain: "grocery-list-a5729.firebaseapp.com",
  projectId: "grocery-list-a5729",
  storageBucket: "grocery-list-a5729.firebasestorage.app",
  messagingSenderId: "114178464356",
  appId: "1:114178464356:web:7511e575c26f7681985d71",
  measurementId: "G-SGT26GXZT0"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const analytics = getAnalytics(firebaseApp);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

// Authentication state
let currentUserId = null;
let unsubscribeAuth = null;
let unsubscribeFirestore = null;

// Initialize anonymous authentication
function initAuth() {
  return new Promise((resolve, reject) => {
    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUserId = user.uid;
        console.log('🔥 Firebase: Authenticated as', user.uid);
        resolve(user);
      } else {
        // Sign in anonymously
        try {
          const userCredential = await signInAnonymously(auth);
          currentUserId = userCredential.user.uid;
          console.log('🔥 Firebase: Anonymous sign-in successful', userCredential.user.uid);
          resolve(userCredential.user);
        } catch (error) {
          console.error('🔥 Firebase: Anonymous sign-in failed', error);
          reject(error);
        }
      }
    });
  });
}

// Save app state to Firestore
async function saveToFirestore(appState) {
  if (!currentUserId) {
    console.warn('🔥 Firebase: Not authenticated, cannot save');
    return;
  }

  try {
    const userDocRef = doc(db, 'users', currentUserId);
    const groceryListsRef = collection(userDocRef, 'groceryLists');
    
    // Save each list
    const savePromises = appState.lists.map(async (list) => {
      const listDocRef = doc(groceryListsRef, list.id);
      await setDoc(listDocRef, {
        ...list,
        updatedAt: serverTimestamp()
      }, { merge: true });
    });

    await Promise.all(savePromises);
    console.log('🔥 Firebase: State saved successfully');
  } catch (error) {
    console.error('🔥 Firebase: Save failed', error);
  }
}

// Load app state from Firestore
async function loadFromFirestore() {
  if (!currentUserId) {
    console.warn('🔥 Firebase: Not authenticated, cannot load');
    return null;
  }

  try {
    const userDocRef = doc(db, 'users', currentUserId);
    const groceryListsRef = collection(userDocRef, 'groceryLists');
    
    const lists = [];
    const snapshot = await getDoc(userDocRef);
    
    // Note: This is a simplified load - in production you'd query the collection
    console.log('🔥 Firebase: Load attempted');
    return lists;
  } catch (error) {
    console.error('🔥 Firebase: Load failed', error);
    return null;
  }
}

// Setup real-time sync
function setupRealtimeSync(onUpdate) {
  if (!currentUserId) {
    console.warn('🔥 Firebase: Not authenticated, cannot setup sync');
    return;
  }

  const userDocRef = doc(db, 'users', currentUserId);
  const groceryListsRef = collection(userDocRef, 'groceryLists');

  unsubscribeFirestore = onSnapshot(groceryListsRef, (snapshot) => {
    const lists = [];
    snapshot.forEach((doc) => {
      lists.push({ id: doc.id, ...doc.data() });
    });
    console.log('🔥 Firebase: Real-time sync update', lists.length, 'lists');
    if (onUpdate) {
      onUpdate(lists);
    }
  });
}

// Cleanup
function cleanup() {
  if (unsubscribeAuth) unsubscribeAuth();
  if (unsubscribeFirestore) unsubscribeFirestore();
}

// Export for use in app.js
window.firebaseBackup = {
  init: initAuth,
  save: saveToFirestore,
  load: loadFromFirestore,
  sync: setupRealtimeSync,
  cleanup: cleanup,
  getDb: () => db,
  getAuth: () => auth
};

console.log('✅ Firebase Backup Module Loaded');
