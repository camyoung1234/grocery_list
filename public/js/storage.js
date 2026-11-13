/**
 * Persistence and Auth-ready abstraction layer.
 * Currently backed by localStorage so the existing Firebase database remains untouched.
 * Designed so Firebase Auth + Firestore can be plugged in later without changing UI/state logic.
 */

const STORAGE_KEY = 'grocery_app_v2_state';

export function createSeedState() {
    return {
        version: 2,
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
        ui: {
            mode: 'store',       // 'store' | 'inventory'
            storeView: 'all',    // 'all' | 'shopping'
            searchQuery: ''
        }
    };
}

/**
 * Auth abstraction (no-op local guest session for now).
 * Future Firebase Auth integration will implement these same methods.
 */
export class AuthService {
    constructor() {
        this._user = {
            uid: 'local-guest',
            displayName: 'Local Mode',
            isAnonymous: true
        };
        this._listeners = new Set();
    }

    getCurrentUser() {
        return this._user;
    }

    onAuthStateChanged(callback) {
        this._listeners.add(callback);
        callback(this._user);
        return () => this._listeners.delete(callback);
    }

    async signIn() {
        // Placeholder for future Firebase Auth sign-in
        return this._user;
    }

    async signOut() {
        // Placeholder for future Firebase Auth sign-out
        return null;
    }
}

/**
 * DataStore abstraction backed by localStorage.
 * Future Firestore integration will implement the same load/save/subscribe contract.
 */
export class LocalDataStore {
    constructor(storageKey = STORAGE_KEY) {
        this.storageKey = storageKey;
        this._listeners = new Set();
    }

    loadState() {
        try {
            const raw = localStorage.getItem(this.storageKey);
            if (!raw) {
                const seed = createSeedState();
                this.saveState(seed);
                return seed;
            }
            const parsed = JSON.parse(raw);
            return this._normalizeState(parsed);
        } catch (err) {
            console.warn('Failed to load state from localStorage, using seed state:', err);
            const seed = createSeedState();
            this.saveState(seed);
            return seed;
        }
    }

    saveState(state) {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(state));
            for (const listener of this._listeners) {
                listener(state);
            }
        } catch (err) {
            console.error('Failed to save state to localStorage:', err);
        }
    }

    subscribe(listener) {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    resetState() {
        const seed = createSeedState();
        this.saveState(seed);
        return seed;
    }

    _normalizeState(raw) {
        const seed = createSeedState();
        if (!raw || typeof raw !== 'object') return seed;
        return {
            version: 2,
            aisles: Array.isArray(raw.aisles) ? raw.aisles : seed.aisles,
            items: Array.isArray(raw.items) ? raw.items : seed.items,
            inventoryEntries: Array.isArray(raw.inventoryEntries) ? raw.inventoryEntries : [],
            cartItemIds: Array.isArray(raw.cartItemIds) ? raw.cartItemIds : [],
            ui: {
                mode: raw.ui?.mode === 'inventory' ? 'inventory' : 'store',
                storeView: raw.ui?.storeView === 'shopping' ? 'shopping' : 'all',
                searchQuery: typeof raw.ui?.searchQuery === 'string' ? raw.ui.searchQuery : ''
            }
        };
    }
}

export const authService = new AuthService();
export const dataStore = new LocalDataStore();
