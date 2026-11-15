import {
    auth,
    db,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signOut,
    doc,
    onSnapshot,
    setDoc
} from './firebase.js';

const STORAGE_KEY = 'grocery_app_v2_state';

export function createSeedState() {
    return {
        version: 2,
        updatedAt: 0,
        aisles: [
            { id: 'aisle-produce', name: 'Produce', collapsed: false },
            { id: 'aisle-dairy', name: 'Dairy & Eggs', collapsed: false },
            { id: 'aisle-pantry', name: 'Pantry', collapsed: false },
            { id: 'aisle-household', name: 'Household', collapsed: false }
        ],
        items: [
            { id: 'item-bananas', aisleId: 'aisle-produce', name: 'Bananas', wantQty: 6 },
            { id: 'item-spinach', aisleId: 'aisle-produce', name: 'Baby Spinach', wantQty: 2 },
            { id: 'item-milk', aisleId: 'aisle-dairy', name: 'Whole Milk', wantQty: 2 },
            { id: 'item-eggs', aisleId: 'aisle-dairy', name: 'Eggs', wantQty: 1 },
            { id: 'item-pasta', aisleId: 'aisle-pantry', name: 'Pasta', wantQty: 3 },
            { id: 'item-baby-wipes', aisleId: 'aisle-household', name: 'Baby Wipes', wantQty: 2 },
            { id: 'item-disinfecting-wipes', aisleId: 'aisle-household', name: 'Disinfecting Wipes', wantQty: 1 },
            { id: 'item-paper-towels', aisleId: 'aisle-household', name: 'Paper Towels', wantQty: 2 }
        ],
        inventoryEntries: [],
        cartItemIds: [],
        settings: {
            showAllItemsStockStatus: true,
            showShoppingHaveWant: true,
            showAisleCounts: true,
            compactDensity: false,
            inventorySortOrder: 'added'
        },
        ui: {
            tab: 'all', // 'all' | 'shopping' | 'inventory'
            searchQuery: ''
        }
    };
}

/**
 * One-time migration from v1 `lists` (multiple stores) into a single flattened v2 state.
 * Preserves store aisle order (`shopSections`) and item order (`shopIndex`),
 * and leaves the original v1 document fields completely untouched.
 */
export function migrateLegacyListsToV2(legacyLists, currentSettings = null) {
    const base = createSeedState();
    const aisles = [];
    const aisleByNormName = new Map(); // normName -> aisle
    const items = [];
    const seenItemNames = new Set();

    const ensureAisle = (name, preferredId = null, collapsed = false) => {
        const clean = (name || '').trim() || 'Uncategorized';
        const key = clean.toLowerCase();
        if (aisleByNormName.has(key)) {
            return aisleByNormName.get(key);
        }
        const aisle = {
            id: preferredId || `aisle-${aisles.length + 1}-${key.replace(/[^a-z0-9]+/g, '')}`,
            name: clean,
            collapsed: Boolean(collapsed)
        };
        aisles.push(aisle);
        aisleByNormName.set(key, aisle);
        return aisle;
    };

    for (const list of (legacyLists || [])) {
        if (!list || typeof list !== 'object') continue;
        const sectionMap = new Map(); // oldSectionId -> v2Aisle

        const shopSections = Array.isArray(list.shopSections) ? list.shopSections : [];
        for (const sec of shopSections) {
            if (!sec || !sec.id) continue;
            if (sec.id === 'sec-s-def') continue;
            const mapped = ensureAisle(sec.name, null, sec.collapsed);
            sectionMap.set(sec.id, mapped);
        }

        const listItems = Array.isArray(list.items) ? [...list.items] : [];
        listItems.sort((a, b) => (Number(a?.shopIndex) || 0) - (Number(b?.shopIndex) || 0));

        for (const item of listItems) {
            if (!item || item.pendingDelete) continue;
            const name = (item.text || item.name || '').trim();
            if (!name) continue;

            const itemKey = name.toLowerCase();
            if (seenItemNames.has(itemKey)) continue;
            seenItemNames.add(itemKey);

            let targetAisle = sectionMap.get(item.shopSectionId);
            if (!targetAisle) {
                targetAisle = ensureAisle('Uncategorized');
            }

            items.push({
                id: item.id ? String(item.id) : `item-${items.length + 1}`,
                aisleId: targetAisle.id,
                name,
                wantQty: Math.max(0, Math.round(Number(item.wantCount ?? item.wantQty ?? 1) || 0))
            });
        }
    }

    return {
        version: 2,
        updatedAt: Date.now(),
        aisles: aisles.length > 0 ? aisles : base.aisles,
        items,
        inventoryEntries: [],
        cartItemIds: [],
        settings: currentSettings ? { ...base.settings, ...currentSettings } : base.settings,
        ui: {
            tab: 'all',
            searchQuery: ''
        }
    };
}

export class AuthService {
    constructor() {
        this._user = auth.currentUser || null;
        this._listeners = new Set();

        onAuthStateChanged(auth, user => {
            this._user = user;
            for (const cb of this._listeners) {
                cb(user);
            }
        });
    }

    getCurrentUser() {
        return this._user;
    }

    onAuthStateChanged(callback) {
        this._listeners.add(callback);
        callback(this._user);
        return () => this._listeners.delete(callback);
    }

    async signIn(email, password) {
        const cred = await signInWithEmailAndPassword(auth, email, password);
        return cred.user;
    }

    async createAccount(email, password) {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        return cred.user;
    }

    async signOut() {
        await signOut(auth);
    }
}

export class CloudDataStore {
    constructor(storageKey = STORAGE_KEY) {
        this.storageKey = storageKey;
        this._listeners = new Set();
        this._syncListeners = new Set();
        this._uid = null;
        this._unsubscribeDoc = null;
        this._lastLocalUpdatedAt = 0;
        this._syncStatus = 'offline'; // 'offline' | 'syncing' | 'synced' | 'error'
    }

    getSyncStatus() {
        return this._syncStatus;
    }

    onSyncStatusChange(listener) {
        this._syncListeners.add(listener);
        listener(this._syncStatus);
        return () => this._syncListeners.delete(listener);
    }

    _setSyncStatus(status) {
        this._syncStatus = status;
        for (const cb of this._syncListeners) {
            cb(status);
        }
    }

    loadState() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) {
                const seed = createSeedState();
                this._writeLocal(seed);
                return seed;
            }
            return this._normalizeState(JSON.parse(raw));
        } catch (err) {
            console.warn('Failed to load state from localStorage, using seed state:', err);
            const seed = createSeedState();
            this._writeLocal(seed);
            return seed;
        }
    }

    _writeLocal(state) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(state));
        } catch (err) {
            console.error('Failed to write localStorage:', err);
        }
    }

    saveState(state) {
        const now = Date.now();
        state.updatedAt = now;
        this._lastLocalUpdatedAt = now;
        this._writeLocal(state);

        if (this._uid) {
            this._pushToFirestore(this._uid, state);
        }
    }

    async _pushToFirestore(uid, state) {
        this._setSyncStatus('syncing');
        try {
            const docRef = doc(db, 'users', uid);
            // Merge only the `v2` key so all legacy v1 fields (`lists`, etc.) remain 100% intact
            await setDoc(docRef, { v2: state }, { merge: true });
            this._setSyncStatus('synced');
        } catch (err) {
            console.error('Error syncing v2 state to Firestore:', err);
            this._setSyncStatus('error');
        }
    }

    connectUser(uid) {
        this.disconnectUser();
        if (!uid) {
            this._setSyncStatus('offline');
            return;
        }

        this._uid = uid;
        this._setSyncStatus('syncing');
        const docRef = doc(db, 'users', uid);

        this._unsubscribeDoc = onSnapshot(docRef, async docSnap => {
            if (!docSnap.exists()) {
                // Brand new user doc: seed v2 cleanly
                const local = this.loadState();
                await this._pushToFirestore(uid, local);
                return;
            }

            const remote = docSnap.data();

            if (remote && remote.v2 && typeof remote.v2 === 'object') {
                const remoteV2 = this._normalizeState(remote.v2);
                // Skip echoing back our own local write
                if (remoteV2.updatedAt && remoteV2.updatedAt === this._lastLocalUpdatedAt) {
                    this._setSyncStatus('synced');
                    return;
                }
                this._writeLocal(remoteV2);
                this._setSyncStatus('synced');
                for (const listener of this._listeners) {
                    listener(remoteV2);
                }
                return;
            }

            // One-time upgrade copy from legacy v1 `lists` -> `v2`
            if (remote && Array.isArray(remote.lists) && remote.lists.length > 0) {
                const local = this.loadState();
                const migrated = migrateLegacyListsToV2(remote.lists, local.settings);
                this._lastLocalUpdatedAt = migrated.updatedAt;
                this._writeLocal(migrated);
                for (const listener of this._listeners) {
                    listener(migrated);
                }
                await this._pushToFirestore(uid, migrated);
                return;
            }

            // Doc exists without v2 or lists
            const local = this.loadState();
            await this._pushToFirestore(uid, local);
        }, err => {
            console.error('Firestore snapshot error:', err);
            this._setSyncStatus('error');
        });
    }

    disconnectUser() {
        if (this._unsubscribeDoc) {
            this._unsubscribeDoc();
            this._unsubscribeDoc = null;
        }
        this._uid = null;
        this._setSyncStatus('offline');
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    _normalizeState(raw) {
        const seed = createSeedState();
        if (!raw || typeof raw !== 'object') return seed;

        let tab = raw.ui?.tab;
        if (!['all', 'shopping', 'inventory'].includes(tab)) {
            tab = 'all';
        }

        let inventorySortOrder = raw.settings?.inventorySortOrder;
        if (!['added', 'alphabetical', 'aisle'].includes(inventorySortOrder)) {
            inventorySortOrder = 'added';
        }

        return {
            version: 2,
            updatedAt: Number(raw.updatedAt) || 0,
            aisles: Array.isArray(raw.aisles) ? raw.aisles : seed.aisles,
            items: Array.isArray(raw.items) ? raw.items : seed.items,
            inventoryEntries: Array.isArray(raw.inventoryEntries) ? raw.inventoryEntries : [],
            cartItemIds: Array.isArray(raw.cartItemIds) ? raw.cartItemIds : [],
            settings: {
                showAllItemsStockStatus: raw.settings?.showAllItemsStockStatus ?? true,
                showShoppingHaveWant: raw.settings?.showShoppingHaveWant ?? true,
                showAisleCounts: raw.settings?.showAisleCounts ?? true,
                compactDensity: raw.settings?.compactDensity ?? false,
                inventorySortOrder
            },
            ui: {
                tab,
                searchQuery: typeof raw.ui?.searchQuery === 'string' ? raw.ui.searchQuery : ''
            }
        };
    }
}

export const authService = new AuthService();
export const dataStore = new CloudDataStore();
