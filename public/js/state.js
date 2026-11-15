import { parseVoiceCommand, parseVoiceStream, classifyVoiceMatch } from '../voice.js';

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

/**
 * Return inventory entries filtered by searchQuery, keeping unresolved entries
 * (ambiguous / unmatched) at the top, and sorting the remainder according to
 * `state.settings.inventorySortOrder` ('added' | 'alphabetical' | 'aisle').
 */
export function getSortedInventoryEntries(state, searchQuery = '') {
    const itemsById = new Map(state.items.map(i => [i.id, i]));
    const q = (searchQuery || '').trim().toLowerCase();

    const filtered = q
        ? state.inventoryEntries.filter(entry => {
            const itemName = entry.itemId && itemsById.has(entry.itemId)
                ? itemsById.get(entry.itemId).name.toLowerCase()
                : '';
            return itemName.includes(q) || (entry.rawQuery || '').toLowerCase().includes(q);
        })
        : state.inventoryEntries;

    const unresolved = [];
    const matched = [];
    for (const entry of filtered) {
        if (entry.status !== 'matched') {
            unresolved.push(entry);
        } else {
            matched.push(entry);
        }
    }

    const sortOrder = state.settings?.inventorySortOrder || 'added';
    if (sortOrder === 'alphabetical') {
        matched.sort((a, b) => {
            const nameA = (a.itemId && itemsById.has(a.itemId) ? itemsById.get(a.itemId).name : a.rawQuery) || '';
            const nameB = (b.itemId && itemsById.has(b.itemId) ? itemsById.get(b.itemId).name : b.rawQuery) || '';
            return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
        });
    } else if (sortOrder === 'aisle') {
        const aisleOrderMap = new Map(state.aisles.map((a, idx) => [a.id, idx]));
        const itemOrderMap = new Map(state.items.map((item, idx) => [item.id, idx]));
        matched.sort((a, b) => {
            const itemA = a.itemId ? itemsById.get(a.itemId) : null;
            const itemB = b.itemId ? itemsById.get(b.itemId) : null;
            const aisleIdxA = itemA && aisleOrderMap.has(itemA.aisleId)
                ? aisleOrderMap.get(itemA.aisleId)
                : Number.MAX_SAFE_INTEGER;
            const aisleIdxB = itemB && aisleOrderMap.has(itemB.aisleId)
                ? aisleOrderMap.get(itemB.aisleId)
                : Number.MAX_SAFE_INTEGER;
            if (aisleIdxA !== aisleIdxB) {
                return aisleIdxA - aisleIdxB;
            }
            const itemIdxA = itemA && itemOrderMap.has(itemA.id)
                ? itemOrderMap.get(itemA.id)
                : Number.MAX_SAFE_INTEGER;
            const itemIdxB = itemB && itemOrderMap.has(itemB.id)
                ? itemOrderMap.get(itemB.id)
                : Number.MAX_SAFE_INTEGER;
            return itemIdxA - itemIdxB;
        });
    }

    return [...unresolved, ...matched];
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

export function addItem(state, aisleId, name, wantQty = 1, { allowEmptyName = false } = {}) {
    const clean = (name || '').trim();
    if (!clean && !allowEmptyName) return null;
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

export function reorderAisleItems(state, aisleId, orderedItemIds) {
    const aisleItems = state.items.filter(i => i.aisleId === aisleId);
    if (aisleItems.length <= 1) return false;
    const itemById = new Map(aisleItems.map(i => [i.id, i]));
    const reordered = [];
    const seen = new Set();

    for (const id of orderedItemIds) {
        if (itemById.has(id) && !seen.has(id)) {
            reordered.push(itemById.get(id));
            seen.add(id);
        }
    }
    for (const item of aisleItems) {
        if (!seen.has(item.id)) {
            reordered.push(item);
        }
    }

    const changed = reordered.some((item, idx) => item.id !== aisleItems[idx].id);
    if (!changed) return false;

    let cursor = 0;
    state.items = state.items.map(existing => {
        if (existing.aisleId === aisleId) {
            return reordered[cursor++];
        }
        return existing;
    });
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

export function addInventorySegment(state, rawQueryText, rawCount) {
    const query = (rawQueryText || '').trim();
    if (!query) return null;
    const count = Math.max(0, Number(rawCount) || 0);
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
    return { entry, classification };
}

export function processInventoryCommand(state, rawText) {
    const stream = parseVoiceStream(rawText, { isInterim: false });
    if (stream.segments.length > 0) {
        const added = [];
        for (const seg of stream.segments) {
            const res = addInventorySegment(state, seg.itemQuery, seg.count);
            if (res) added.push(res);
        }
        if (added.length > 0) {
            const last = added[added.length - 1];
            return {
                action: 'added',
                added,
                entry: last.entry,
                classification: last.classification,
                stopRequested: stream.stopRequested
            };
        }
    }

    const parsed = parseVoiceCommand(rawText);
    if (parsed.type === 'empty') {
        return { action: 'empty' };
    }
    if (parsed.type === 'nav') {
        return { action: 'nav', navAction: parsed.action };
    }

    const single = addInventorySegment(state, parsed.itemQuery, parsed.count);
    if (!single) return { action: 'empty' };
    return {
        action: 'added',
        added: [single],
        entry: single.entry,
        classification: single.classification,
        stopRequested: false
    };
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
