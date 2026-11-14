import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js';
import {
    getAuth,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js';
import {
    initializeFirestore,
    persistentLocalCache,
    persistentMultipleTabManager,
    doc,
    onSnapshot,
    setDoc
} from 'https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js';

const firebaseConfig = {
    apiKey: 'AIzaSyA8hTcqZ_I3zIsSC9Vq_XEg6T6KWaUav20',
    authDomain: 'grocery-list-a5729.firebaseapp.com',
    projectId: 'grocery-list-a5729',
    storageBucket: 'grocery-list-a5729.firebasestorage.app',
    messagingSenderId: '114178464356',
    appId: '1:114178464356:web:7511e575c26f7681985d71',
    measurementId: 'G-SGT26GXZT0'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});

export {
    auth,
    db,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    doc,
    onSnapshot,
    setDoc
};
