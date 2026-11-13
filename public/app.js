import { authService, dataStore } from './js/storage.js';
import {
    getHaveQtyMap,
    getEntryCountMap,
    getShoppingListByAisle,
    getTotalToBuyItemsCount,
    addAisle,
    renameAisle,
    deleteAisle,
    moveAisle,
    toggleAisleCollapsed,
    addItem,
    updateItemName,
    updateItemWantQty,
    deleteItem,
    processInventoryCommand,
    resolveAmbiguousEntry,
    addStoreItemAndResolveEntry,
    updateInventoryEntryCount,
    deleteInventoryEntry,
    clearInventory,
    toggleCartItem,
    clearCartChecks
} from './js/state.js';

let state = dataStore.loadState();
let editingAisleId = null;
let editingItemId = null;
let isListening = false;
let recognition = null;

// DOM Elements
const els = {
    authStatusLabel: document.getElementById('auth-status-label'),
    tabAllBtn: document.getElementById('tab-all-btn'),
    tabShoppingBtn: document.getElementById('tab-shopping-btn'),
    tabInventoryBtn: document.getElementById('tab-inventory-btn'),
    shoppingCountBadge: document.getElementById('shopping-count-badge'),
    inventoryPendingBadge: document.getElementById('inventory-pending-badge'),

    bottomNavBar: document.getElementById('bottom-nav-bar'),
    bottomSearchBar: document.getElementById('bottom-search-bar'),
    searchOpenBtn: document.getElementById('search-open-btn'),
    searchCloseBtn: document.getElementById('search-close-btn'),
    storeSearchInput: document.getElementById('store-search-input'),

    settingsOpenBtn: document.getElementById('settings-open-btn'),
    settingsModal: document.getElementById('settings-modal'),
    settingsCloseBtn: document.getElementById('settings-close-btn'),
    settingShowAllStock: document.getElementById('setting-show-all-stock'),
    settingShowShoppingHw: document.getElementById('setting-show-shopping-hw'),
    settingShowAisleCounts: document.getElementById('setting-show-aisle-counts'),
    settingCompactDensity: document.getElementById('setting-compact-density'),

    storeView: document.getElementById('store-view'),
    inventoryView: document.getElementById('inventory-view'),
    storeViewHeading: document.getElementById('store-view-heading'),

    addAisleOpenBtn: document.getElementById('add-aisle-open-btn'),
    clearChecksBtn: document.getElementById('clear-checks-btn'),
    addAisleForm: document.getElementById('add-aisle-form'),
    newAisleInput: document.getElementById('new-aisle-input'),
    addAisleCancelBtn: document.getElementById('add-aisle-cancel-btn'),
    storeAislesContainer: document.getElementById('store-aisles-container'),

    voiceMicBtn: document.getElementById('voice-mic-btn'),
    voiceMicLabel: document.getElementById('voice-mic-label'),
    inventoryCommandForm: document.getElementById('inventory-command-form'),
    inventoryCommandInput: document.getElementById('inventory-command-input'),
    voiceFeedback: document.getElementById('voice-feedback'),
    inventorySummary: document.getElementById('inventory-summary'),
    clearInventoryBtn: document.getElementById('clear-inventory-btn'),
    inventoryEntriesList: document.getElementById('inventory-entries-list'),

    toastContainer: document.getElementById('toast-container')
};

function commit() {
    dataStore.saveState(state);
    render();
}

function showToast(message, undoCallback = null, durationMs = 4500) {
    // Clear existing toasts so they don't stack excessively on mobile
    els.toastContainer.innerHTML = '';

    const toast = document.createElement('div');
    toast.className = 'toast';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;
    toast.appendChild(textSpan);

    let timer = null;
    if (typeof undoCallback === 'function') {
        const undoBtn = document.createElement('button');
        undoBtn.type = 'button';
        undoBtn.className = 'toast-undo-btn';
        undoBtn.textContent = 'Undo';
        undoBtn.addEventListener('click', () => {
            if (timer) clearTimeout(timer);
            toast.remove();
            undoCallback();
        });
        toast.appendChild(undoBtn);
    }

    els.toastContainer.appendChild(toast);
    timer = setTimeout(() => {
        toast.remove();
    }, undoCallback ? durationMs : 2600);
}

/* --- Auth-Ready Subscription --- */
authService.onAuthStateChanged(user => {
    els.authStatusLabel.textContent = user?.displayName || 'Local Mode';
});

/* --- 3-Way Tab Switching --- */
function setTab(tab) {
    if (tab !== 'inventory' && isListening) {
        stopVoiceListening();
    }
    state.ui.tab = tab;
    commit();
}

els.tabAllBtn.addEventListener('click', () => setTab('all'));
els.tabShoppingBtn.addEventListener('click', () => setTab('shopping'));
els.tabInventoryBtn.addEventListener('click', () => setTab('inventory'));

/* --- Bottom Search Bar --- */
function openSearchBar() {
    els.bottomNavBar.classList.add('hidden');
    els.bottomSearchBar.classList.remove('hidden');
    els.storeSearchInput.focus();
}

function closeSearchBar() {
    els.bottomSearchBar.classList.add('hidden');
    els.bottomNavBar.classList.remove('hidden');
    if (state.ui.searchQuery) {
        state.ui.searchQuery = '';
        els.storeSearchInput.value = '';
        commit();
    }
}

els.searchOpenBtn.addEventListener('click', openSearchBar);
els.searchCloseBtn.addEventListener('click', closeSearchBar);

els.storeSearchInput.addEventListener('input', e => {
    state.ui.searchQuery = e.target.value;
    commit();
});

els.storeSearchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        closeSearchBar();
    }
});

/* --- Settings Modal --- */
els.settingsOpenBtn.addEventListener('click', () => {
    els.settingShowAllStock.checked = state.settings.showAllItemsStockStatus;
    els.settingShowShoppingHw.checked = state.settings.showShoppingHaveWant;
    els.settingShowAisleCounts.checked = state.settings.showAisleCounts;
    els.settingCompactDensity.checked = state.settings.compactDensity;
    els.settingsModal.classList.remove('hidden');
});

els.settingsCloseBtn.addEventListener('click', () => {
    els.settingsModal.classList.add('hidden');
});

els.settingsModal.addEventListener('click', e => {
    if (e.target === els.settingsModal) {
        els.settingsModal.classList.add('hidden');
    }
});

els.settingShowAllStock.addEventListener('change', e => {
    state.settings.showAllItemsStockStatus = e.target.checked;
    commit();
});

els.settingShowShoppingHw.addEventListener('change', e => {
    state.settings.showShoppingHaveWant = e.target.checked;
    commit();
});

els.settingShowAisleCounts.addEventListener('change', e => {
    state.settings.showAisleCounts = e.target.checked;
    commit();
});

els.settingCompactDensity.addEventListener('change', e => {
    state.settings.compactDensity = e.target.checked;
    commit();
});

function attachDoubleTap(el, onDoubleTap) {
    let lastTapAt = 0;
    el.addEventListener('click', () => {
        const now = Date.now();
        if (now - lastTapAt <= 350) {
            lastTapAt = 0;
            onDoubleTap();
        } else {
            lastTapAt = now;
        }
    });
}

/* --- Store Toolbar Actions --- */
els.clearChecksBtn.addEventListener('click', () => {
    if (state.cartItemIds.length === 0) return;
    clearCartChecks(state);
    commit();
    showToast('Cleared shopping list check marks');
});

/* --- Add Aisle --- */
els.addAisleOpenBtn.addEventListener('click', () => {
    els.addAisleForm.classList.remove('hidden');
    els.newAisleInput.focus();
});

els.addAisleCancelBtn.addEventListener('click', () => {
    els.addAisleForm.classList.add('hidden');
    els.newAisleInput.value = '';
});

els.addAisleForm.addEventListener('submit', e => {
    e.preventDefault();
    const name = els.newAisleInput.value.trim();
    if (!name) return;
    addAisle(state, name);
    els.newAisleInput.value = '';
    els.addAisleForm.classList.add('hidden');
    commit();
    showToast(`Added aisle "${name}"`);
});

/* --- Inventory Voice & Command Input --- */
els.inventoryCommandForm.addEventListener('submit', e => {
    e.preventDefault();
    const text = els.inventoryCommandInput.value.trim();
    if (!text) return;
    els.inventoryCommandInput.value = '';
    handleVoiceOrTextCommand(text);
});

els.clearInventoryBtn.addEventListener('click', () => {
    if (state.inventoryEntries.length === 0) return;
    const prevEntries = state.inventoryEntries.map(e => ({ ...e }));
    clearInventory(state);
    els.voiceFeedback.textContent = 'Inventory cleared. Ready for a fresh count.';
    commit();
    showToast('Cleared inventory', () => {
        state.inventoryEntries = prevEntries;
        commit();
    });
});

function handleVoiceOrTextCommand(rawText) {
    const result = processInventoryCommand(state, rawText);
    if (result.action === 'empty') return;
    if (result.action === 'nav' && result.navAction === 'stop') {
        stopVoiceListening();
        els.voiceFeedback.textContent = 'Stopped listening.';
        return;
    }

    const { entry, classification } = result;
    if (classification.status === 'matched') {
        els.voiceFeedback.textContent = `Logged "${classification.item.name}" × ${entry.count}`;
    } else if (classification.status === 'ambiguous') {
        els.voiceFeedback.textContent = `Multiple matches for "${entry.rawQuery}" × ${entry.count} — tap the right one below.`;
    } else {
        els.voiceFeedback.textContent = `"${entry.rawQuery}" isn't in your store list yet — add it below.`;
    }

    commit();
}

function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return null;

    const rec = new SpeechRecognition();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = event => {
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript.trim();
            if (event.results[i].isFinal) {
                handleVoiceOrTextCommand(transcript);
            } else {
                interim += (interim ? ' ' : '') + transcript;
            }
        }
        if (interim) {
            els.voiceFeedback.textContent = `Hearing: "${interim}"...`;
        }
    };

    rec.onerror = event => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            stopVoiceListening();
            els.voiceFeedback.textContent = 'Microphone access denied. You can type commands below.';
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
            els.voiceFeedback.textContent = `Voice error (${event.error}). Try again or type below.`;
        }
    };

    rec.onend = () => {
        if (isListening) {
            try {
                rec.start();
            } catch {
                stopVoiceListening();
            }
        }
    };

    return rec;
}

function startVoiceListening() {
    if (!recognition) {
        recognition = initSpeechRecognition();
    }
    if (!recognition) {
        els.voiceFeedback.textContent = 'Voice recognition is not supported in this browser. Type "<item> <count>" below.';
        els.inventoryCommandInput.focus();
        return;
    }

    isListening = true;
    els.voiceMicBtn.classList.add('listening');
    els.voiceMicBtn.setAttribute('aria-pressed', 'true');
    els.voiceMicLabel.textContent = 'Listening...';
    els.voiceFeedback.textContent = 'Listening — say "<item> <count>" (e.g. "wipes 3")...';
    try {
        recognition.start();
    } catch {
        // Already started
    }
}

function stopVoiceListening() {
    isListening = false;
    els.voiceMicBtn.classList.remove('listening');
    els.voiceMicBtn.setAttribute('aria-pressed', 'false');
    els.voiceMicLabel.textContent = 'Speak';
    if (recognition) {
        try {
            recognition.stop();
        } catch {
            // Ignore
        }
    }
}

els.voiceMicBtn.addEventListener('click', () => {
    if (isListening) {
        stopVoiceListening();
        els.voiceFeedback.textContent = 'Paused listening.';
    } else {
        startVoiceListening();
    }
});

/* --- Delete with Undo Helpers --- */
function deleteStoreItemWithUndo(item) {
    const itemIdx = state.items.findIndex(i => i.id === item.id);
    if (itemIdx === -1) return;
    const itemSnapshot = { ...item };
    const wasInCart = state.cartItemIds.includes(item.id);
    const affectedEntries = state.inventoryEntries
        .filter(e => e.itemId === item.id)
        .map(e => ({ id: e.id, status: e.status }));

    deleteItem(state, item.id);
    commit();

    showToast(`Deleted "${item.name}"`, () => {
        if (!state.items.some(i => i.id === itemSnapshot.id)) {
            state.items.splice(Math.min(itemIdx, state.items.length), 0, itemSnapshot);
        }
        if (wasInCart && !state.cartItemIds.includes(itemSnapshot.id)) {
            state.cartItemIds.push(itemSnapshot.id);
        }
        for (const prev of affectedEntries) {
            const entry = state.inventoryEntries.find(e => e.id === prev.id);
            if (entry) {
                entry.itemId = itemSnapshot.id;
                entry.status = prev.status;
            }
        }
        commit();
    });
}

function deleteAisleWithUndo(aisle) {
    const aisleIdx = state.aisles.findIndex(a => a.id === aisle.id);
    if (aisleIdx === -1) return;
    const aisleSnapshot = { ...aisle };
    const itemsSnapshot = state.items.filter(i => i.aisleId === aisle.id).map(i => ({ ...i }));
    const itemIdSet = new Set(itemsSnapshot.map(i => i.id));
    const cartSnapshot = state.cartItemIds.filter(id => itemIdSet.has(id));
    const affectedEntries = state.inventoryEntries
        .filter(e => e.itemId && itemIdSet.has(e.itemId))
        .map(e => ({ id: e.id, itemId: e.itemId, status: e.status }));

    deleteAisle(state, aisle.id);
    commit();

    showToast(`Deleted aisle "${aisle.name}"`, () => {
        if (!state.aisles.some(a => a.id === aisleSnapshot.id)) {
            state.aisles.splice(Math.min(aisleIdx, state.aisles.length), 0, aisleSnapshot);
        }
        for (const it of itemsSnapshot) {
            if (!state.items.some(i => i.id === it.id)) {
                state.items.push(it);
            }
        }
        for (const id of cartSnapshot) {
            if (!state.cartItemIds.includes(id)) state.cartItemIds.push(id);
        }
        for (const prev of affectedEntries) {
            const entry = state.inventoryEntries.find(e => e.id === prev.id);
            if (entry) {
                entry.itemId = prev.itemId;
                entry.status = prev.status;
            }
        }
        commit();
    });
}

function deleteInventoryEntryWithUndo(entry, label) {
    const idx = state.inventoryEntries.findIndex(e => e.id === entry.id);
    if (idx === -1) return;
    const snapshot = { ...entry, candidateIds: [...(entry.candidateIds || [])] };

    deleteInventoryEntry(state, entry.id);
    commit();

    showToast(`Deleted "${label}"`, () => {
        if (!state.inventoryEntries.some(e => e.id === snapshot.id)) {
            state.inventoryEntries.splice(Math.min(idx, state.inventoryEntries.length), 0, snapshot);
        }
        commit();
    });
}

/* --- Render --- */
function render() {
    document.body.classList.toggle('compact', Boolean(state.settings.compactDensity));

    const tab = state.ui.tab;
    const isAll = tab === 'all';
    const isShopping = tab === 'shopping';
    const isInventory = tab === 'inventory';

    els.tabAllBtn.classList.toggle('active', isAll);
    els.tabAllBtn.setAttribute('aria-pressed', String(isAll));
    els.tabShoppingBtn.classList.toggle('active', isShopping);
    els.tabShoppingBtn.setAttribute('aria-pressed', String(isShopping));
    els.tabInventoryBtn.classList.toggle('active', isInventory);
    els.tabInventoryBtn.setAttribute('aria-pressed', String(isInventory));

    els.storeView.classList.toggle('hidden', isInventory);
    els.inventoryView.classList.toggle('hidden', !isInventory);

    // Pending badge on Inventory tab
    const unresolvedCount = state.inventoryEntries.filter(e => e.status !== 'matched').length;
    els.inventoryPendingBadge.textContent = String(unresolvedCount);
    els.inventoryPendingBadge.classList.toggle('hidden', unresolvedCount === 0);

    // Shopping list badge
    const toBuyCount = getTotalToBuyItemsCount(state);
    els.shoppingCountBadge.textContent = String(toBuyCount);

    if (els.storeSearchInput.value !== state.ui.searchQuery) {
        els.storeSearchInput.value = state.ui.searchQuery;
    }

    if (!isInventory) {
        renderStoreView(isShopping);
    } else {
        renderInventoryMode();
    }
}

function renderStoreView(isShopping) {
    els.storeViewHeading.textContent = isShopping ? 'Shopping List' : 'All Items';
    els.addAisleOpenBtn.classList.toggle('hidden', isShopping);
    els.clearChecksBtn.classList.toggle('hidden', !isShopping);
    els.clearChecksBtn.disabled = state.cartItemIds.length === 0;

    if (isShopping) {
        els.addAisleForm.classList.add('hidden');
        renderShoppingList();
    } else {
        renderAllStoreAisles();
    }
}

function renderAllStoreAisles() {
    const container = els.storeAislesContainer;
    container.innerHTML = '';

    const haveMap = getHaveQtyMap(state);
    const showStockStatus = state.settings.showAllItemsStockStatus;
    const q = (state.ui.searchQuery || '').trim().toLowerCase();

    if (state.aisles.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            <div class="empty-state-title">No store aisles yet</div>
            <div>Tap <strong>+ Aisle</strong> above to create your first section (e.g. Produce, Dairy).</div>
        `;
        container.appendChild(empty);
        return;
    }

    let renderedCount = 0;

    state.aisles.forEach((aisle, aisleIndex) => {
        const aisleItems = state.items.filter(i => i.aisleId === aisle.id);
        const filteredItems = q
            ? aisleItems.filter(i => i.name.toLowerCase().includes(q) || aisle.name.toLowerCase().includes(q))
            : aisleItems;

        if (q && filteredItems.length === 0 && !aisle.name.toLowerCase().includes(q)) {
            return;
        }

        renderedCount++;
        const card = document.createElement('section');
        card.className = `aisle-card${aisle.collapsed ? ' collapsed' : ''}`;
        card.dataset.aisleId = aisle.id;

        // Aisle Header
        const header = document.createElement('div');
        header.className = 'aisle-header';

        const titleGroup = document.createElement('div');
        titleGroup.className = 'aisle-title-group';

        const collapseBtn = document.createElement('button');
        collapseBtn.type = 'button';
        collapseBtn.className = 'aisle-collapse-btn';
        collapseBtn.setAttribute('aria-label', aisle.collapsed ? `Expand ${aisle.name}` : `Collapse ${aisle.name}`);
        collapseBtn.textContent = aisle.collapsed ? '▸' : '▾';
        collapseBtn.addEventListener('click', () => {
            toggleAisleCollapsed(state, aisle.id);
            commit();
        });
        titleGroup.appendChild(collapseBtn);

        if (editingAisleId === aisle.id) {
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'aisle-name-input';
            nameInput.value = aisle.name;
            nameInput.setAttribute('aria-label', 'Edit aisle name');
            const saveName = () => {
                renameAisle(state, aisle.id, nameInput.value);
                editingAisleId = null;
                commit();
            };
            nameInput.addEventListener('keydown', e => {
                if (e.key === 'Enter') { e.preventDefault(); saveName(); }
                if (e.key === 'Escape') { editingAisleId = null; render(); }
            });
            nameInput.addEventListener('blur', saveName);
            titleGroup.appendChild(nameInput);
            setTimeout(() => nameInput.focus(), 0);
        } else {
            const nameBtn = document.createElement('button');
            nameBtn.type = 'button';
            nameBtn.className = 'aisle-name-btn';
            nameBtn.textContent = aisle.name;
            nameBtn.title = 'Double-tap to rename aisle';
            attachDoubleTap(nameBtn, () => {
                editingAisleId = aisle.id;
                render();
            });
            titleGroup.appendChild(nameBtn);
        }

        if (state.settings.showAisleCounts) {
            const countBadge = document.createElement('span');
            countBadge.className = 'aisle-count';
            countBadge.textContent = String(aisleItems.length);
            titleGroup.appendChild(countBadge);
        }

        const actions = document.createElement('div');
        actions.className = 'aisle-actions';

        const upBtn = document.createElement('button');
        upBtn.type = 'button';
        upBtn.className = 'icon-btn';
        upBtn.textContent = '↑';
        upBtn.title = 'Move aisle up';
        upBtn.disabled = aisleIndex === 0;
        upBtn.addEventListener('click', () => {
            moveAisle(state, aisle.id, -1);
            commit();
        });

        const downBtn = document.createElement('button');
        downBtn.type = 'button';
        downBtn.className = 'icon-btn';
        downBtn.textContent = '↓';
        downBtn.title = 'Move aisle down';
        downBtn.disabled = aisleIndex === state.aisles.length - 1;
        downBtn.addEventListener('click', () => {
            moveAisle(state, aisle.id, 1);
            commit();
        });

        const delAisleBtn = document.createElement('button');
        delAisleBtn.type = 'button';
        delAisleBtn.className = 'icon-btn danger';
        delAisleBtn.textContent = '×';
        delAisleBtn.title = `Delete ${aisle.name}`;
        delAisleBtn.setAttribute('aria-label', `Delete aisle ${aisle.name}`);
        delAisleBtn.addEventListener('click', () => {
            deleteAisleWithUndo(aisle);
        });

        actions.append(upBtn, downBtn, delAisleBtn);
        header.append(titleGroup, actions);
        card.appendChild(header);

        if (!aisle.collapsed) {
            const list = document.createElement('ul');
            list.className = 'aisle-items';

            filteredItems.forEach(item => {
                const li = document.createElement('li');
                li.className = 'item-row';
                li.dataset.itemId = item.id;

                const main = document.createElement('div');
                main.className = 'item-main';

                if (editingItemId === item.id) {
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'item-name-input';
                    input.value = item.name;
                    const saveItemName = () => {
                        updateItemName(state, item.id, input.value);
                        editingItemId = null;
                        commit();
                    };
                    input.addEventListener('keydown', e => {
                        if (e.key === 'Enter') { e.preventDefault(); saveItemName(); }
                        if (e.key === 'Escape') { editingItemId = null; render(); }
                    });
                    input.addEventListener('blur', saveItemName);
                    main.appendChild(input);
                    setTimeout(() => input.focus(), 0);
                } else {
                    const nameBtn = document.createElement('button');
                    nameBtn.type = 'button';
                    nameBtn.className = 'item-name-btn';
                    nameBtn.textContent = item.name;
                    nameBtn.title = 'Double-tap to edit item name';
                    attachDoubleTap(nameBtn, () => {
                        editingItemId = item.id;
                        render();
                    });
                    main.appendChild(nameBtn);
                }

                if (showStockStatus) {
                    const haveQty = haveMap[item.id] || 0;
                    const needQty = Math.max(0, item.wantQty - haveQty);
                    const meta = document.createElement('div');
                    meta.className = 'item-meta';

                    const pill = document.createElement('span');
                    if (item.wantQty === 0) {
                        pill.className = 'stock-pill';
                        pill.textContent = `Have ${haveQty}`;
                    } else if (needQty === 0) {
                        pill.className = 'stock-pill stocked';
                        pill.textContent = `Stocked (${haveQty}/${item.wantQty})`;
                    } else {
                        pill.className = 'stock-pill need';
                        pill.textContent = `Have ${haveQty} · Need ${needQty}`;
                    }
                    meta.appendChild(pill);
                    main.appendChild(meta);
                }

                const controls = document.createElement('div');
                controls.className = 'item-controls';

                const stepper = createQtyStepper(item.wantQty, `Desired quantity for ${item.name}`, nextQty => {
                    updateItemWantQty(state, item.id, nextQty);
                    commit();
                });

                const delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'icon-btn danger';
                delBtn.textContent = '×';
                delBtn.title = `Delete ${item.name}`;
                delBtn.setAttribute('aria-label', `Delete ${item.name}`);
                delBtn.addEventListener('click', () => {
                    deleteStoreItemWithUndo(item);
                });

                controls.append(stepper, delBtn);
                li.append(main, controls);
                list.appendChild(li);
            });

            card.appendChild(list);

            // Inline Add Item Form
            const addForm = document.createElement('form');
            addForm.className = 'aisle-add-form';

            const itemInput = document.createElement('input');
            itemInput.type = 'text';
            itemInput.className = 'aisle-add-input';
            itemInput.placeholder = `+ Add item to ${aisle.name}...`;
            itemInput.setAttribute('aria-label', `Add item to ${aisle.name}`);

            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.min = '0';
            qtyInput.value = '1';
            qtyInput.className = 'aisle-add-qty';
            qtyInput.title = 'Desired quantity';
            qtyInput.setAttribute('aria-label', `Desired quantity for new item in ${aisle.name}`);

            const addBtn = document.createElement('button');
            addBtn.type = 'submit';
            addBtn.className = 'btn-primary-sm';
            addBtn.textContent = 'Add';

            addForm.addEventListener('submit', e => {
                e.preventDefault();
                const name = itemInput.value.trim();
                if (!name) return;
                const qty = Math.max(0, parseInt(qtyInput.value, 10) || 1);
                addItem(state, aisle.id, name, qty);
                commit();
            });

            addForm.append(itemInput, qtyInput, addBtn);
            card.appendChild(addForm);
        }

        container.appendChild(card);
    });

    if (renderedCount === 0 && q) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `<div class="empty-state-title">No matching items</div><div>Try a different search term.</div>`;
        container.appendChild(empty);
    }
}

function renderShoppingList() {
    const container = els.storeAislesContainer;
    container.innerHTML = '';

    const sections = getShoppingListByAisle(state, state.ui.searchQuery);
    const showHaveWant = state.settings.showShoppingHaveWant;

    if (sections.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = state.ui.searchQuery
            ? `<div class="empty-state-title">No matching items to buy</div><div>Try clearing your search filter.</div>`
            : `<div class="empty-state-title">You're all stocked up!</div><div>Every item in your store list already has enough at home.</div>`;
        container.appendChild(empty);
        return;
    }

    const cartSet = new Set(state.cartItemIds);
    sections.forEach(({ aisle, items }) => {
        const card = document.createElement('section');
        card.className = 'aisle-card';
        card.dataset.aisleId = aisle.id;

        const header = document.createElement('div');
        header.className = 'aisle-header';
        const titleGroup = document.createElement('div');
        titleGroup.className = 'aisle-title-group';
        const title = document.createElement('span');
        title.className = 'aisle-name-btn';
        title.textContent = aisle.name;
        titleGroup.appendChild(title);
        if (state.settings.showAisleCounts) {
            const count = document.createElement('span');
            count.className = 'aisle-count';
            count.textContent = String(items.length);
            titleGroup.appendChild(count);
        }
        header.appendChild(titleGroup);
        card.appendChild(header);

        const list = document.createElement('ul');
        list.className = 'aisle-items';

        items.forEach(item => {
            const inCart = cartSet.has(item.id);
            const li = document.createElement('li');
            li.className = `shopping-row${inCart ? ' in-cart' : ''}`;
            li.dataset.itemId = item.id;
            li.addEventListener('click', () => {
                toggleCartItem(state, item.id);
                commit();
            });

            const left = document.createElement('div');
            left.className = 'shopping-left';

            const check = document.createElement('span');
            check.className = 'cart-check';
            check.setAttribute('aria-label', inCart ? `${item.name} checked` : `Buy ${item.toBuy} ${item.name}`);
            check.textContent = inCart ? '✓' : String(item.toBuy);

            const textWrap = document.createElement('div');
            const nameEl = document.createElement('div');
            nameEl.className = 'shopping-item-name';
            nameEl.textContent = item.name;
            textWrap.appendChild(nameEl);

            if (showHaveWant) {
                const subEl = document.createElement('div');
                subEl.className = 'shopping-item-sub';
                subEl.textContent = `Have ${item.haveQty} · Want ${item.wantQty}`;
                textWrap.appendChild(subEl);
            }

            left.append(check, textWrap);
            li.appendChild(left);
            list.appendChild(li);
        });

        card.appendChild(list);
        container.appendChild(card);
    });
}

function renderInventoryMode() {
    const entries = state.inventoryEntries;
    const haveMap = getHaveQtyMap(state);
    const entryCountMap = getEntryCountMap(state);
    const itemsById = new Map(state.items.map(i => [i.id, i]));
    const aislesById = new Map(state.aisles.map(a => [a.id, a]));
    const q = (state.ui.searchQuery || '').trim().toLowerCase();

    const filteredEntries = q
        ? entries.filter(entry => {
            const itemName = entry.itemId && itemsById.has(entry.itemId)
                ? itemsById.get(entry.itemId).name.toLowerCase()
                : '';
            return itemName.includes(q) || (entry.rawQuery || '').toLowerCase().includes(q);
        })
        : entries;

    const uniqueCount = Object.keys(haveMap).length;
    els.inventorySummary.textContent = `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'} · ${uniqueCount} item${uniqueCount === 1 ? '' : 's'} counted`;
    els.clearInventoryBtn.classList.toggle('hidden', entries.length === 0);

    const list = els.inventoryEntriesList;
    list.innerHTML = '';

    if (entries.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `
            <div class="empty-state-title">No inventory counted yet</div>
            <div>Tap <strong>Speak</strong> or type <code>&lt;item&gt; &lt;count&gt;</code> above (for example, <em>"wipes 3"</em>).</div>
        `;
        list.appendChild(empty);
        return;
    }

    if (filteredEntries.length === 0 && q) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.innerHTML = `<div class="empty-state-title">No matching entries</div><div>Try a different search term.</div>`;
        list.appendChild(empty);
        return;
    }

    filteredEntries.forEach(entry => {
        const li = document.createElement('li');
        li.className = `inv-entry ${entry.status}`;
        li.dataset.entryId = entry.id;

        const top = document.createElement('div');
        top.className = 'inv-entry-top';

        const info = document.createElement('div');
        info.className = 'inv-entry-info';

        const title = document.createElement('div');
        title.className = 'inv-entry-title';

        let displayLabel = entry.rawQuery;

        if (entry.status === 'matched' && entry.itemId && itemsById.has(entry.itemId)) {
            const storeItem = itemsById.get(entry.itemId);
            const aisle = aislesById.get(storeItem.aisleId);
            displayLabel = storeItem.name;

            const nameSpan = document.createElement('span');
            nameSpan.textContent = storeItem.name;
            title.appendChild(nameSpan);

            if (aisle) {
                const aisleTag = document.createElement('span');
                aisleTag.className = 'inv-aisle-tag';
                aisleTag.textContent = aisle.name;
                title.appendChild(aisleTag);
            }

            if ((entryCountMap[storeItem.id] || 0) > 1) {
                const totalTag = document.createElement('span');
                totalTag.className = 'inv-total-tag';
                totalTag.textContent = `Total: ${haveMap[storeItem.id] || 0}`;
                title.appendChild(totalTag);
            }
        } else {
            const rawSpan = document.createElement('span');
            rawSpan.textContent = `"${entry.rawQuery}"`;
            title.appendChild(rawSpan);
        }

        info.appendChild(title);

        const controls = document.createElement('div');
        controls.className = 'inv-entry-controls';

        const stepper = createQtyStepper(entry.count, `Count for ${entry.rawQuery}`, nextCount => {
            updateInventoryEntryCount(state, entry.id, nextCount);
            commit();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'inv-delete-btn';
        deleteBtn.textContent = '×';
        deleteBtn.title = 'Delete entry';
        deleteBtn.setAttribute('aria-label', `Delete ${entry.rawQuery}`);
        deleteBtn.addEventListener('click', () => {
            deleteInventoryEntryWithUndo(entry, displayLabel);
        });

        controls.append(stepper, deleteBtn);
        top.append(info, controls);
        li.appendChild(top);

        // Ambiguous resolution UI
        if (entry.status === 'ambiguous') {
            const resolveBox = document.createElement('div');
            resolveBox.className = 'inv-resolve-box';

            const label = document.createElement('div');
            label.className = 'inv-resolve-label';
            label.textContent = 'Multiple possible matches — tap which one you meant:';
            resolveBox.appendChild(label);

            const chips = document.createElement('div');
            chips.className = 'suggestion-chips';

            entry.candidateIds.forEach(cid => {
                const candidate = itemsById.get(cid);
                if (!candidate) return;
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'suggestion-chip';
                chip.textContent = candidate.name;
                chip.addEventListener('click', () => {
                    resolveAmbiguousEntry(state, entry.id, candidate.id);
                    commit();
                    showToast(`Matched to "${candidate.name}"`);
                });
                chips.appendChild(chip);
            });

            const newChip = document.createElement('button');
            newChip.type = 'button';
            newChip.className = 'suggestion-chip create-new';
            newChip.textContent = `+ Add "${entry.rawQuery}" as new item`;
            newChip.addEventListener('click', () => {
                entry.status = 'unmatched';
                entry.candidateIds = [];
                commit();
            });
            chips.appendChild(newChip);

            resolveBox.appendChild(chips);
            li.appendChild(resolveBox);
        }

        // Unmatched -> Add to store list at the same time
        if (entry.status === 'unmatched') {
            const resolveBox = document.createElement('div');
            resolveBox.className = 'inv-resolve-box';

            const label = document.createElement('div');
            label.className = 'inv-resolve-label';
            label.textContent = 'Not in store list yet — add it and update inventory:';
            resolveBox.appendChild(label);

            const row = document.createElement('div');
            row.className = 'unmatched-add-row';

            const select = document.createElement('select');
            select.className = 'aisle-select';
            select.setAttribute('aria-label', `Select aisle for ${entry.rawQuery}`);
            if (state.aisles.length === 0) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = 'General (new aisle)';
                select.appendChild(opt);
            } else {
                state.aisles.forEach(a => {
                    const opt = document.createElement('option');
                    opt.value = a.id;
                    opt.textContent = a.name;
                    select.appendChild(opt);
                });
            }

            const addStoreBtn = document.createElement('button');
            addStoreBtn.type = 'button';
            addStoreBtn.className = 'btn-primary-sm';
            addStoreBtn.textContent = '+ Add to Store List';
            addStoreBtn.addEventListener('click', () => {
                const created = addStoreItemAndResolveEntry(state, entry.id, entry.rawQuery, select.value);
                commit();
                if (created) {
                    showToast(`Added "${created.name}" to store & updated inventory`);
                }
            });

            row.append(select, addStoreBtn);
            resolveBox.appendChild(row);
            li.appendChild(resolveBox);
        }

        list.appendChild(li);
    });
}

function createQtyStepper(value, ariaLabel, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'qty-stepper';

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.className = 'stepper-btn';
    decBtn.textContent = '−';
    decBtn.setAttribute('aria-label', `Decrease ${ariaLabel}`);
    decBtn.addEventListener('click', () => {
        onChange(Math.max(0, (Number(value) || 0) - 1));
    });

    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.className = 'stepper-input';
    input.value = String(value);
    input.setAttribute('aria-label', ariaLabel);
    input.addEventListener('change', () => {
        const parsed = parseInt(input.value, 10);
        onChange(Number.isNaN(parsed) ? 0 : Math.max(0, parsed));
    });

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.className = 'stepper-btn';
    incBtn.textContent = '+';
    incBtn.setAttribute('aria-label', `Increase ${ariaLabel}`);
    incBtn.addEventListener('click', () => {
        onChange(Math.max(0, (Number(value) || 0) + 1));
    });

    wrap.append(decBtn, input, incBtn);
    return wrap;
}

// Initial render
render();
