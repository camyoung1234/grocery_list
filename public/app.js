document.addEventListener('DOMContentLoaded', async () => {
    // --- State ---
    let appState = {
        lists: [],
        currentListId: null
    };

    let currentMode = 'home'; // 'home' or 'shop'
    let activeReorderId = null;
    let activeTabReorderId = null; // Tracks the ID of the list tab currently showing reorder arrows
    let currentShopFilter = 'unbought'; // 'unbought' or 'all'
    let deleteListMode = false; // Tracks whether we're in list-deletion mode
    let shopSelectionMode = false; // Tracks whether we're selecting items in shop mode
    let selectedShopItems = new Set(); // Tracks currently selected item IDs
    let pendingDeletions = new Map(); // Tracks timeout IDs for items in "Undo" state

    // --- DOM Elements ---
    const groceryList = document.getElementById('grocery-list');
    const modeIndicator = document.getElementById('mode-indicator');
    const appContainer = document.querySelector('.app-container');
    const tabsList = document.getElementById('tabs-list');

    // Modal Elements
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const modalThemeGroup = document.getElementById('modal-theme-group');
    const themeDropdown = document.getElementById('theme-dropdown');
    const themeTrigger = document.getElementById('theme-trigger');
    const themeOptions = document.getElementById('theme-options');
    const currentThemeSwatch = document.getElementById('current-theme-swatch');
    const currentThemeName = document.getElementById('current-theme-name');
    const modalHomeSectionGroup = document.getElementById('modal-home-section-group');
    const modalShopSectionGroup = document.getElementById('modal-shop-section-group');
    const modalHomeSectionSelect = document.getElementById('modal-home-section');
    const modalShopSectionSelect = document.getElementById('modal-shop-section');

    // Import / Export Elements
    const importBtn = document.getElementById('import-btn');
    const exportBtn = document.getElementById('export-btn');
    const importInput = document.getElementById('import-input');

    // Delete Modal Elements
    const deleteModalOverlay = document.getElementById('delete-modal-overlay');
    const deleteMatchName = document.getElementById('delete-match-name');
    const deleteModalTitle = document.getElementById('delete-modal-title');
    const deleteCancelBtn = document.getElementById('delete-cancel-btn');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

    // Section Delete Modal Elements
    const sectionDeleteModalOverlay = document.getElementById('section-delete-modal-overlay');
    const sectionDeleteModalTitle = document.getElementById('section-delete-modal-title');
    const sectionDeleteModalText = document.getElementById('section-delete-modal-text');
    const sectionDeleteOnlyBtn = document.getElementById('section-delete-only-btn');
    const sectionDeleteAllBtn = document.getElementById('section-delete-all-btn');
    const sectionDeleteCancelBtn = document.getElementById('section-delete-cancel-btn');

    // Restore Modal Elements
    const restoreModalOverlay = document.getElementById('restore-modal-overlay');
    const restoreCancelBtn = document.getElementById('restore-cancel-btn');
    const restoreConfirmBtn = document.getElementById('restore-confirm-btn');

    // Modal State
    let currentDeleteCallback = null;
    let currentSectionDeleteOnlyCallback = null;
    let currentSectionDeleteAllCallback = null;

    // --- URL Hash State Sync ---
    async function syncToHash() {
        try {
            const payload = JSON.stringify({
                appState: JSON.parse(localStorage.getItem('grocery-app-state') || 'null'),
                mode: localStorage.getItem('grocery-mode') || 'home'
            });
            const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
            const compressed = await new Response(stream).arrayBuffer();
            const bytes = new Uint8Array(compressed);
            let binary = '';
            for (let i = 0; i < bytes.length; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const hash = btoa(binary);
            history.replaceState(null, '', '#' + hash);
        } catch (e) {
            console.warn('Failed to sync state to URL hash:', e);
        }
    }

    // Restore state from URL hash (if present) before reading localStorage
    async function restoreFromHash() {
        try {
            const hash = window.location.hash.slice(1);
            if (!hash) return;
            const binary = atob(hash);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
            const decompressed = await new Response(stream).text();
            const data = JSON.parse(decompressed);
            if (data && data.appState && data.appState.lists) {
                const currentStoredState = localStorage.getItem('grocery-app-state');
                
                // If hash state matches current state, skip prompt
                if (currentStoredState && JSON.stringify(data.appState) === currentStoredState) {
                    return;
                }

                restoreModalOverlay.classList.add('visible');

                return new Promise((resolve) => {
                    restoreConfirmBtn.onclick = () => {
                        localStorage.setItem('grocery-app-state', JSON.stringify(data.appState));
                        if (data.mode) {
                            localStorage.setItem('grocery-mode', data.mode);
                        }
                        restoreModalOverlay.classList.remove('visible');
                        resolve();
                    };
                    restoreCancelBtn.onclick = () => {
                        restoreModalOverlay.classList.remove('visible');
                        resolve();
                    };
                });
            }
        } catch (e) {
            console.warn('Failed to restore state from URL hash:', e);
        }
    }

    // --- Initialization ---
    async function init() {
        await restoreFromHash();
        
        // Read localStorage after hash restore has had a chance to update it
        const legacyItems = JSON.parse(localStorage.getItem('grocery-items'));
        const storedState = JSON.parse(localStorage.getItem('grocery-app-state'));
        currentMode = localStorage.getItem('grocery-mode') || 'home';

        if (storedState && storedState.lists && storedState.lists.length > 0) {
            appState = storedState;
            // Migration for sections
            appState.lists.forEach(list => {
                if (!list.homeSections) {
                    list.homeSections = [{ id: 'sec-h-def', name: 'Uncategorized' }];
                    list.shopSections = [{ id: 'sec-s-def', name: 'Uncategorized' }];
                    if (list.items) {
                        list.items.forEach(item => {
                            item.homeSectionId = 'sec-h-def';
                            item.shopSectionId = 'sec-s-def';
                        });
                    }
                }
            });
        } else if (legacyItems && Array.isArray(legacyItems)) {
            // Migration: Convert legacy items to new structure
            const defaultListId = Date.now().toString();
            appState.lists = [{
                id: defaultListId,
                name: 'Grocery List',
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: legacyItems.map(item => ({
                    ...item,
                    homeSectionId: 'sec-h-def',
                    shopSectionId: 'sec-s-def'
                }))
            }];
            appState.currentListId = defaultListId;

            // Clean up legacy item logic (optional, we might keep it to avoid data loss if revert?)
            // For now, let's just save the new state and rely on it.
            saveAppState();
        } else {
            // Fresh start
            const defaultListId = Date.now().toString();
            appState.lists = [{
                id: defaultListId,
                name: 'Grocery List',
                theme: 'var(--theme-blue)', // Default Theme
                homeSections: [], // Start with no sections
                shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
                items: []
            }];
            appState.currentListId = defaultListId;
            saveAppState();
        }

        // Ensure currentListId is valid
        if (!appState.lists.find(l => l.id === appState.currentListId)) {
            appState.currentListId = appState.lists[0].id;
        }

        updateModeUI();
        renderTabs();
        renderList();
    }

    // --- Mode Switching ---
    function switchMode(newMode, animate = false) {
        if (newMode === currentMode) return;

        const doSwitch = () => {
            // Auto-update "Have" counts and auto-sort when switching FROM Shop TO Home
            if (currentMode === 'shop' && newMode === 'home') {
                const currentList = getCurrentList();

                // Aggregate logic: Group items by name (text), sum quantities, and mark them as bought
                const itemsMap = new Map();
                currentList.items.forEach(item => {
                    if (item.shopCompleted) {
                        const name = item.text.trim().toLowerCase();
                        if (!itemsMap.has(name)) {
                            itemsMap.set(name, {
                                wantCount: 0,
                                haveCount: 0,
                                ids: []
                            });
                        }
                        const entry = itemsMap.get(name);
                        entry.wantCount += item.wantCount;
                        entry.haveCount += item.haveCount;
                        entry.ids.push(item.id);
                    }
                });

                // Apply aggregation to the original items
                itemsMap.forEach((data, name) => {
                    const firstId = data.ids[0];
                    currentList.items.forEach(item => {
                        if (item.id === firstId) {
                            item.wantCount = data.wantCount;
                            item.haveCount = data.wantCount; // As requested, update to desired quantity
                            item.shopCompleted = false;
                            item.shopCheckOrder = null;
                        } else if (data.ids.includes(item.id)) {
                            // These are the other items sharing the same name that were also checked
                            // They need to be updated to haveCount = wantCount for consistency, 
                            // and then handled, but the user requested setting "all items... their quantities increased"
                            item.haveCount = item.wantCount;
                            item.shopCompleted = false;
                            item.shopCheckOrder = null;
                        }
                    });
                });

                // Auto-sort logic: group checked items by shopSectionId, sort them by shopCheckOrder, and assign them sorted shopIndex values
                const sectionsMap = new Map();
                currentList.items.forEach(item => {
                    if (item.shopCompleted) {
                        if (!sectionsMap.has(item.shopSectionId)) {
                            sectionsMap.set(item.shopSectionId, []);
                        }
                        sectionsMap.get(item.shopSectionId).push(item);
                    }
                });

                sectionsMap.forEach(checkedItems => {
                    // Sort by check order (ascending - older checks first)
                    checkedItems.sort((a, b) => (a.shopCheckOrder || 0) - (b.shopCheckOrder || 0));

                    // Extract their current indices and sort numerically
                    const indices = checkedItems.map(i => i.shopIndex).sort((a, b) => a - b);

                    // Re-assign sorted indices back to the items based on their check order
                    checkedItems.forEach((item, i) => {
                        item.shopIndex = indices[i];
                    });
                });

                saveAppState();
            }

            // Clear shop selection mode on any mode switch
            shopSelectionMode = false;
            selectedShopItems.clear();

            currentMode = newMode;
            saveMode();
            updateModeUI();
            renderList();
        };

        if (!animate) {
            doSwitch();
            return;
        }

        // Slide transition: out → switch → in
        const slideOutClass = newMode === 'shop' ? 'slide-left' : 'slide-right';
        const slideInClass = newMode === 'shop' ? 'slide-in-right' : 'slide-in-left';

        groceryList.classList.add(slideOutClass);
        groceryList.addEventListener('animationend', function onOut() {
            groceryList.removeEventListener('animationend', onOut);
            groceryList.classList.remove(slideOutClass);

            doSwitch();

            groceryList.classList.add(slideInClass);
            groceryList.addEventListener('animationend', function onIn() {
                groceryList.removeEventListener('animationend', onIn);
                groceryList.classList.remove(slideInClass);
            });
        });
    }
...
