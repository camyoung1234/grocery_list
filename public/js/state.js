import { parseVoiceCommand, classifyVoiceMatch } from '../voice.js';

export function createId(prefix = 'id') {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
    }
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function titleCase(str) {
    return (str || '')
        .trim()
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w ? w[0].toUpperCase() + w.slice(1) : '')
        .join(' ');
}

/**
 * Sum all matched inventory entries per store item ID.
 * Multiple entries for the same item are summed in the background.
 */
export function getHaveQtyMap(state) {
    const map = Object.create(null);
    for (const entry of state.inventoryEntries) {
        if (entry.status === 'matched' && entry.itemId) {
            const qty = Math.max(0, Number(entry.count) || 0);
            map[entry.itemId] = (map[entry.itemId] || 0) + qty;
        }
    }
    return map;
}

/**
 * Count how many individual inventory entries exist per store item ID.
 */
export function getEntryCountMap(state) {
    const map = Object.create(null);
    for (const entry of state.inventoryEntries) {
        if (entry.status === 'matched' && entry.itemId) {
            map[entry.itemId] = (map[entry.itemId] || 0) + 1;
        }
    }
    return map;
}

/**
 * Build shopping list grouped and sorted by store aisle.
 * Hides items where the user already has enough (haveQty >= wantQty or wantQty <= 0).
 */
export function getShoppingListByAisle(state, searchQuery = '') {
    const haveMap = getHaveQtyMap(state);
    const q = (searchQuery || '').trim().toLowerCase();
    const sections = [];

    for (const aisle of state.aisles) {
        const aisleItems = state.items
            .filter(item => item.aisleId === aisle.id)
            .map(item => {
                const haveQty = haveMap[item.id] || 0;
                const wantQty = Math.max(0, Number(item.wantQty) || 0);
                const toBuy = Math.max(0, wantQty - haveQty);
                return { ...item, haveQty, wantQty, toBuy };
            })
            .filter(item => item.toBuy > 0)
            .filter(item => !q || item.name.toLowerCase().includes(q) || aisle.name.toLowerCase().includes(q));

        if (aisleItems.length > 0) {
            sections.push({ aisle, items: aisleItems });
        }
    }

    return sections;
}

export function getTotalToBuyItemsCount(state) {
    const haveMap = getHaveQtyMap(state);
    let count = 0;
    for (const item of state.items) {
        const haveQty = haveMap[item.id] || 0;
        const wantQty = Math.max(0, Number(item.wantQty) || 0);
        if (wantQty - haveQty > 0) count++;
    }
    return count;
}

/* --- Aisle Mutations --- */

export function addAisle(state, name) {
    const clean = (name || '').trim();
    if (!clean) return null;
    const aisle = { id: createId('aisle'), name: clean, collapsed: false };
    state.aisles.push(aisle);
    return aisle;
}

export function renameAisle(state, aisleId, name) {
    const clean = (name || '').trim();
    if (!clean) return false;
    const aisle = state.aisles.find(a => a.id === aisleId);
    if (!aisle) return false;
    aisle.name = clean;
    return true;
}

export function deleteAisle(state, aisleId) {
    const idx = state.aisles.findIndex(a => a.id === aisleId);
    if (idx === -1) return false;
    const removedIds = new Set(state.items.filter(i => i.aisleId === aisleId).map(i => i.id));
    state.aisles.splice(idx, 1);
    state.items = state.items.filter(i => i.aisleId !== aisleId);
    state.cartItemIds = state.cartItemIds.filter(id => !removedIds.has(id));
    // Unlink any inventory entries pointing to deleted items
    state.inventoryEntries = state.inventoryEntries.map(entry => {
        if (entry.itemId && removedIds.has(entry.itemId)) {
            return { ...entry, itemId: null, status: 'unmatched' };
        }
        return entry;
    });
    return true;
}

export function moveAisle(state, aisleId, direction) {
    const idx = state.aisles.findIndex(a => a.id === aisleId);
    if (idx === -1) return false;
    const target = idx + direction;
    if (target < 0 || target >= state.aisles.length) return false;
    const [aisle] = state.aisles.splice(idx, 1);
    state.aisles.splice(target, 0, aisle);
    return true;
}

export function toggleAisleCollapsed(state, aisleId) {
    const aisle = state.aisles.find(a => a.id === aisleId);
    if (!aisle) return false;
    aisle.collapsed = !aisle.collapsed;
    return true;
}

/* --- Store Item Mutations --- */

export function addItem(state, aisleId, name, wantQty = 1) {
    const clean = (name || '').trim();
    if (!clean) return null;
    let targetAisleId = aisleId;
    if (!state.aisles.some(a => a.id === targetAisleId)) {
        if (state.aisles.length === 0) {
            const created = addAisle(state, 'General');
            targetAisleId = created.id;
        } else {
            targetAisleId = state.aisles[0].id;
        }
    }
    const item = {
        id: createId('item'),
        aisleId: targetAisleId,
        name: clean,
        wantQty: Math.max(0, Number(wantQty) || 0)
    };
    state.items.push(item);
    return item;
}

export function updateItemName(state, itemId, name) {
    const clean = (name || '').trim();
    if (!clean) return false;
    const item = state.items.find(i => i.id === itemId);
    if (!item) return false;
    item.name = clean;
    return true;
}

export function updateItemWantQty(state, itemId, wantQty) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return false;
    item.wantQty = Math.max(0, Math.round(Number(wantQty) || 0));
    return true;
}

export function moveItemToAisle(state, itemId, targetAisleId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item || !state.aisles.some(a => a.id === targetAisleId)) return false;
    item.aisleId = targetAisleId;
    return true;
}

export function deleteItem(state, itemId) {
    const idx = state.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;
    state.items.splice(idx, 1);
    state.cartItemIds = state.cartItemIds.filter(id => id !== itemId);
    state.inventoryEntries = state.inventoryEntries.map(entry => {
        if (entry.itemId === itemId) {
            return { ...entry, itemId: null, status: 'unmatched' };
        }
        return entry;
    });
    return true;
}

/* --- Inventory & Voice Mutations --- */

export function processInventoryCommand(state, rawText) {
    const parsed = parseVoiceCommand(rawText);
    if (parsed.type === 'empty') {
        return { action: 'empty' };
    }
    if (parsed.type === 'nav') {
        return { action: 'nav', navAction: parsed.action };
    }

    const query = parsed.itemQuery || '';
    const count = Math.max(0, Number(parsed.count) || 0);
    const classification = classifyVoiceMatch(query, state.items);

    const entry = {
        id: createId('inv'),
        rawQuery: titleCase(query),
        count,
        status: classification.status,
        itemId: classification.status === 'matched' ? classification.item.id : null,
        candidateIds: classification.status === 'ambiguous'
            ? classification.candidates.map(c => c.id)
            : [],
        createdAt: Date.now()
    };

    // Prepend so the newest spoken/typed entry appears at the top of the inventory list
    state.inventoryEntries.unshift(entry);
    return { action: 'added', entry, classification };
}

export function resolveAmbiguousEntry(state, entryId, itemId) {
    const entry = state.inventoryEntries.find(e => e.id === entryId);
    const item = state.items.find(i => i.id === itemId);
    if (!entry || !item) return false;
    entry.status = 'matched';
    entry.itemId = item.id;
    entry.candidateIds = [];
    return true;
}

export function addStoreItemAndResolveEntry(state, entryId, itemName, aisleId) {
    const entry = state.inventoryEntries.find(e => e.id === entryId);
    if (!entry) return null;
    const cleanName = (itemName || entry.rawQuery || '').trim();
    if (!cleanName) return null;

    const newItem = addItem(state, aisleId, cleanName, Math.max(1, entry.count || 1));
    if (!newItem) return null;

    entry.status = 'matched';
    entry.itemId = newItem.id;
    entry.candidateIds = [];
    return newItem;
}

export function updateInventoryEntryCount(state, entryId, count) {
    const entry = state.inventoryEntries.find(e => e.id === entryId);
    if (!entry) return false;
    entry.count = Math.max(0, Math.round(Number(count) || 0));
    return true;
}

export function deleteInventoryEntry(state, entryId) {
    const idx = state.inventoryEntries.findIndex(e => e.id === entryId);
    if (idx === -1) return false;
    state.inventoryEntries.splice(idx, 1);
    return true;
}

export function clearInventory(state) {
    state.inventoryEntries = [];
}

/* --- Shopping Cart Trip Helpers --- */

export function toggleCartItem(state, itemId) {
    const idx = state.cartItemIds.indexOf(itemId);
    if (idx === -1) {
        state.cartItemIds.push(itemId);
    } else {
        state.cartItemIds.splice(idx, 1);
    }
}

export function clearCartChecks(state) {
    state.cartItemIds = [];
}
