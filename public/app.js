document.addEventListener('DOMContentLoaded', async () => {
    // --- State ---
    let appState = {
        lists: [],
        currentListId: null
    };

    let currentMode = 'home'; // 'home' or 'shop'
    let editMode = true;
    let listsMenuOpen = false;
    let draggedElement = null;
    let dragType = null;
    let touchGhost = null;
    let placeholder = document.createElement('li');
    placeholder.className = 'drag-placeholder';
    let dragOffset = { x: 0, y: 0 };
    let isDragStarted = false;
    let dragUpdateFrame = null;
    let lastDragPos = { x: 0, y: 0 };
    let scrollAnimationFrame = null;
    let scrollSpeed = 0;
    let relevantSiblings = []; // Performance: cache relevant elements for FLIP
    let isSectionRestoration = false; // Flag to trigger drop animations
    let currentShopFilter = 'unbought'; // 'unbought' or 'all'
    let shopSelectionMode = false; // Tracks whether we're selecting items in shop mode
    let selectedShopItems = new Set(); // Tracks currently selected item IDs
    let newlyDeletedIds = new Set(); // Tracks items that just entered undo state to trigger animation
    let pendingDeletions = new Map(); // Tracks timeout IDs for items in "Undo" state
    let committingControllers = new Map(); // name -> AbortController
    let committingProgress = new Map(); // id -> progress (1.0 to 0.0)
    const shopDefId = 'sec-s-def'; // Default Uncategorized ID for Shop Mode
    let selectionRenderTimeout = null;

    // --- DOM Elements ---
    const groceryList = document.getElementById('grocery-list');
    const appContainer = document.querySelector('.app-container');
    const listsMenu = document.getElementById('lists-menu');

    // --- Intersection Observer for Performance ---
    const viewportObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
            } else {
                entry.target.classList.remove('in-view');
            }
        });
    }, {
        root: null, // use viewport
        rootMargin: '100px', // start animating slightly before they enter
        threshold: 0
    });

    // --- Delegation Handlers ---
    groceryList.addEventListener('click', (e) => {
        const target = e.target;

        // Item Delete
        const deleteBtn = target.closest('.item-delete-btn');
        if (deleteBtn) {
            e.stopPropagation();
            const li = deleteBtn.closest('.grocery-item');
            if (li) deleteItem(li.dataset.id);
            return;
        }

        // Section Delete
        const secDeleteBtn = target.closest('.section-delete-btn');
        if (secDeleteBtn) {
            e.stopPropagation();
            const container = secDeleteBtn.closest('.section-container');
            const title = container.querySelector('.section-title').textContent;
            showSectionDeleteModal(container.dataset.id, title, currentMode === 'home');
            return;
        }

        // Undo Delete
        const undoBtn = target.closest('.undo-btn-inline');
        if (undoBtn) {
            e.stopPropagation();
            const li = undoBtn.closest('.grocery-item');
            if (li) undoDeleteItem(li.dataset.id);
            return;
        }

        // Move Here (Shop Selection Mode)
        const moveHereBtn = target.closest('.move-here-btn');
        if (moveHereBtn) {
            e.stopPropagation();
            const container = moveHereBtn.closest('.section-container');
            if (selectedShopItems.size > 0 && container) {
                const currentList = getCurrentList();
                currentList.items.forEach(item => {
                    if (selectedShopItems.has(item.id)) {
                        item.shopSectionId = container.dataset.id;
                    }
                });
                saveAppState();
                shopSelectionMode = false;
                selectedShopItems.clear();
                renderList();
            }
            return;
        }

        // Add Item Plus Icon
        const addItemPlus = target.closest('.add-item-row .add-row-plus');
        if (addItemPlus) {
            const row = addItemPlus.closest('.add-item-row');
            row.querySelector('.add-item-input').focus();
            return;
        }

        // Add Section Plus Icon
        const addSecPlus = target.closest('.add-section-row .add-row-plus');
        if (addSecPlus) {
            const row = addSecPlus.closest('.add-section-row');
            row.querySelector('.add-section-input').focus();
            return;
        }

        // Shop Chip Toggle / Selection
        const shopChip = target.closest('.shop-chip');
        if (shopChip && !target.closest('.drag-handle') && !target.closest('.quantity-controls') && !target.closest('.item-delete-btn')) {
            const id = shopChip.dataset.id;
            const item = getCurrentList().items.find(i => i.id === id);
            if (!item) return;

            if (shopSelectionMode || editMode) {
                // Selection Mode
                const wasSelected = selectedShopItems.has(id);
                if (wasSelected) {
                    selectedShopItems.delete(id);
                    if (selectedShopItems.size === 0) {
                        shopSelectionMode = false;
                    }
                } else {
                    shopSelectionMode = true;
                    selectedShopItems.add(id);
                }

                // Manual DOM updates to trigger CSS transitions immediately
                shopChip.classList.toggle('selected', !wasSelected);
                groceryList.classList.toggle('shop-selection-mode', shopSelectionMode);

                // Update neighbors for rounded corners (sel-top/sel-bottom)
                const neighbors = [shopChip, shopChip.previousElementSibling, shopChip.nextElementSibling];
                neighbors.forEach(el => {
                    if (el && el.classList.contains('shop-chip')) {
                        const elId = el.dataset.id;
                        const isElSelected = selectedShopItems.has(elId);

                        const prev = el.previousElementSibling;
                        const next = el.nextElementSibling;
                        const isPrevSelected = prev && prev.classList.contains('shop-chip') && selectedShopItems.has(prev.dataset.id);
                        const isNextSelected = next && next.classList.contains('shop-chip') && selectedShopItems.has(next.dataset.id);

                        el.classList.toggle('sel-top', isElSelected && isPrevSelected);
                        el.classList.toggle('sel-bottom', isElSelected && isNextSelected);
                    }
                });

                // Defer renderList to allow transitions to complete
                if (selectionRenderTimeout) clearTimeout(selectionRenderTimeout);
                selectionRenderTimeout = setTimeout(() => {
                    renderList();
                    selectionRenderTimeout = null;
                }, 300);
            } else {
                // Regular Shop Mode: toggle completion
                toggleShopCompleted(id);
            }
            return;
        }
    });

    groceryList.addEventListener('submit', (e) => {
        const target = e.target;

        // Add Item Form
        if (target.closest('.add-item-row form')) {
            e.preventDefault();
            const row = target.closest('.add-item-row');
            const input = row.querySelector('.add-item-input');
            addItemToSection(row.dataset.sectionId, input.value, currentMode === 'home');
            return;
        }

        // Add Section Form
        if (target.closest('.add-section-row form')) {
            e.preventDefault();
            const input = target.querySelector('.add-section-input');
            const val = input.value.trim();
            if (val) {
                addSection(val, currentMode === 'home');
                input.value = '';
            }
            return;
        }
    });

    // Double tap delegation for item and section titles
    onDoubleTap(groceryList, (e) => {
        if (!editMode) return;
        const target = e.target;

        // Item Title Double Tap
        if (target.classList.contains('item-text') && currentMode === 'home') {
            e.stopPropagation();
            const li = target.closest('.grocery-item');
            const id = li.dataset.id;
            const item = getCurrentList().items.find(i => i.id === id);
            if (item) {
                startInlineItemEdit(item, li.querySelector('.item-info'), target);
            }
            return;
        }

        // Section Title Double Tap
        if (target.classList.contains('section-title')) {
            e.stopPropagation();
            const container = target.closest('.section-container');
            const section = getCurrentList().homeSections.find(s => s.id === container.dataset.id) ||
                            getCurrentList().shopSections.find(s => s.id === container.dataset.id);

            if (section && (currentMode === 'home' || section.id !== shopDefId)) {
                const header = target.closest('.section-header');
                const input = document.createElement('input');
                input.type = 'text';
                input.value = section.name;
                input.className = 'inline-section-input';
                applyManualSelection(input);

                const saveSectionName = () => {
                    const newName = input.value.trim();
                    if (newName && newName !== section.name) {
                        section.name = newName;
                        saveAppState();
                    }
                    renderList();
                };

                input.addEventListener('blur', saveSectionName);
                input.addEventListener('keydown', (ke) => {
                    if (ke.key === 'Enter') {
                        input.blur();
                    } else if (ke.key === 'Escape') {
                        renderList();
                    }
                });

                header.replaceChild(input, target);
                input.focus();
            }
            return;
        }
    });

    // Drag start delegation
    groceryList.addEventListener('dragstart', (e) => {
        const target = e.target;
        const handle = target.closest('.drag-handle');
        if (!handle) return;

        const li = handle.closest('li.grocery-item, li.section-container');
        if (!li) return;

        const type = li.classList.contains('section-container') ? 'section' : 'item';
        handleDragStart(e, li, type);
    });

    groceryList.addEventListener('touchstart', (e) => {
        const target = e.target;
        const handle = target.closest('.drag-handle');
        if (!handle) return;

        const li = handle.closest('li.grocery-item, li.section-container');
        if (!li) return;

        const type = li.classList.contains('section-container') ? 'section' : 'item';
        handleTouchStart(e, li, type);
    }, { passive: false });

    // Toolbar Elements
    const toolbarListsBtn = document.getElementById('toolbar-lists');
    const currentListSwatch = document.getElementById('current-list-swatch');
    const toolbarModeBtn = document.getElementById('toolbar-mode');
    const toolbarReorderBtn = document.getElementById('toolbar-reorder');
    const toolbarShareBtn = document.getElementById('toolbar-share');
    const currentListNameSpan = document.getElementById('current-list-name');

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

    // --- Helpers ---
    const applyManualSelection = (input) => {
        input.addEventListener('click', (e) => {
            e.stopPropagation();
            if (document.activeElement !== input) {
                input.focus();
            }
        });
        input.addEventListener('focus', () => {
            input.setSelectionRange(0, input.value.length);
        });
    };

    applyManualSelection(modalInput);

    const escapeHTML = (str) => {
        if (typeof str !== 'string') return str;
        return str.replace(/[&<>"']/g, (m) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m]);
    };

    // Modal State
    let currentDeleteCallback = null;
    let currentSectionDeleteOnlyCallback = null;
    let currentSectionDeleteAllCallback = null;

    // --- URL Hash State Sync ---
    async function generateHash() {
        try {
            const payload = JSON.stringify({
                appState: JSON.parse(localStorage.getItem('grocery-app-state') || 'null'),
                mode: localStorage.getItem('grocery-mode') || 'home'
            });
            const stream = new Blob([payload]).stream().pipeThrough(new CompressionStream('gzip'));
            const compressed = await new Response(stream).arrayBuffer();
            const bytes = new Uint8Array(compressed);

            // Optimized conversion to binary string using chunks to avoid stack overflow
            let binary = '';
            const CHUNK_SIZE = 0x8000;
            for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE));
            }

            return btoa(binary);
        } catch (e) {
            console.warn('Failed to generate state URL hash:', e);
            return '';
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

        const storedEditMode = localStorage.getItem('grocery-edit-mode');
        editMode = storedEditMode !== null ? JSON.parse(storedEditMode) : true;

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

        // --- Shared Want Sync Migration ---
        if (!appState.sharedWantSynced) {
            appState.lists.forEach(list => {
                const maxWants = new Map();
                list.items.forEach(item => {
                    const name = item.text.trim();
                    const currentMax = maxWants.get(name) || 0;
                    if (item.wantCount > currentMax) {
                        maxWants.set(name, item.wantCount);
                    }
                });
                list.items.forEach(item => {
                    const name = item.text.trim();
                    if (maxWants.has(name)) {
                        item.wantCount = maxWants.get(name);
                    }
                });
            });
            appState.sharedWantSynced = true;
            saveAppState();
        }

        updateModeUI();
        renderListsMenu();
        renderList();
    }

    // --- Mode Switching ---
    function switchMode(newMode, animate = false) {
        if (newMode === currentMode) return;

        const doSwitch = () => {
            // Auto-update "Have" counts and auto-sort when switching FROM Shop TO Home
            if (currentMode === 'shop' && newMode === 'home') {
                const currentList = getCurrentList();

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

                currentList.items.forEach(item => {
                    if (item.shopCompleted) {
                        item.haveCount = item.wantCount;
                        item.shopCompleted = false;
                        item.shopCheckOrder = null;
                    }
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

        // Mode fade transition: out → scroll & switch → in
        const fadeOutClass = 'mode-fade-out';
        const fadeInClass = 'mode-fade-in';

        groceryList.classList.add(fadeOutClass);
        groceryList.addEventListener('animationend', function onOut() {
            groceryList.removeEventListener('animationend', onOut);
            groceryList.classList.remove(fadeOutClass);

            // Scroll to top when current content is faded out
            window.scrollTo(0, 0);
            if (appContainer) appContainer.scrollTop = 0;

            doSwitch();

            groceryList.classList.add(fadeInClass);
            groceryList.addEventListener('animationend', function onIn() {
                groceryList.removeEventListener('animationend', onIn);
                groceryList.classList.remove(fadeInClass);
            }, { once: true });
        }, { once: true });
    }

    // --- Toolbar Interactions ---
    if (toolbarListsBtn) {
        toolbarListsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleListsMenu();
        });

        onLongPress(toolbarListsBtn, (e) => {
            e.stopPropagation();
            renameList(appState.currentListId);
        }, 300, { allowOnButtons: true });

        if (currentListNameSpan) {
            onDoubleTap(currentListNameSpan, (e) => {
                if (!editMode) return;
                e.stopPropagation();
                renameList(appState.currentListId);
            });
        }
    }

    if (toolbarModeBtn) {
        toolbarModeBtn.addEventListener('click', () => {
            const newMode = currentMode === 'home' ? 'shop' : 'home';
            switchMode(newMode, true);
        });
    }

    if (toolbarReorderBtn) {
        toolbarReorderBtn.addEventListener('click', () => {
            // Find the row currently at the top of the viewport
            let topRow = null;
            let topOffset = 0;

            // Optimization: Only scan visible rows to find topRow
            const visibleRows = Array.from(document.querySelectorAll('.grocery-item.in-view, .section-header.in-view'));
            for (const row of visibleRows) {
                const rect = row.getBoundingClientRect();
                if (rect.bottom > 0) {
                    topRow = row;
                    topOffset = rect.top;
                    break;
                }
            }

            editMode = !editMode;
            saveMode();
            updateModeUI();

            // Maintain scroll position for the top row
            if (topRow) {
                const newRect = topRow.getBoundingClientRect();
                const scrollDelta = newRect.top - topOffset;
                window.scrollBy(0, scrollDelta);
                if (appContainer) appContainer.scrollBy(0, scrollDelta);
            }
        });
    }

    if (toolbarShareBtn) {
        toolbarShareBtn.addEventListener('click', async () => {
            try {
                const hash = await generateHash();
                const shareUrl = window.location.origin + window.location.pathname + '#' + hash;
                await navigator.clipboard.writeText(shareUrl);
                const icon = toolbarShareBtn.querySelector('i');
                const originalClass = icon.className;
                icon.className = 'fas fa-check';
                setTimeout(() => {
                    icon.className = originalClass;
                }, 2000);
            } catch (err) {
                console.error('Failed to copy: ', err);
            }
        });
    }

    // --- Import / Export Logic ---
    if (exportBtn) exportBtn.addEventListener('click', () => {
        const dataStr = JSON.stringify(appState, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        // Use full date and time, replacing colons to ensure valid filenames on all OS
        a.download = `${new Date().toISOString().split('.')[0].replace(/:/g, '-')}.json`;
        document.body.appendChild(a);
        a.click();

        // Cleanup
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    if (importBtn) importBtn.addEventListener('click', () => {
        importInput.click();
    });

    importInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const importedData = JSON.parse(e.target.result);

                // Very basic validation to ensure it looks like our appState
                if (importedData && Array.isArray(importedData.lists)) {
                    appState = importedData;
                    // Ensure currentListId is valid
                    if (!appState.lists.find(l => l.id === appState.currentListId)) {
                        appState.currentListId = appState.lists[0] ? appState.lists[0].id : null;
                    }
                    saveAppState();
                    renderListsMenu();
                    updateModeUI();
                    renderList();
                } else {
                    alert("Invalid backup file format.");
                }
            } catch (error) {
                console.error("Error importing data:", error);
                alert("Failed to parse backup file. Please ensure it is a valid JSON file.");
            }
            // Reset the input so the same file can be selected again if needed
            importInput.value = '';
        };
        reader.readAsText(file);
    });

    // --- Custom Theme Dropdown Logic ---
    const themes = [
        { name: 'Red', value: 'var(--theme-red)' },
        { name: 'Pink', value: 'var(--theme-pink)' },
        { name: 'Purple', value: 'var(--theme-purple)' },
        { name: 'Deep Purple', value: 'var(--theme-deep-purple)' },
        { name: 'Indigo', value: 'var(--theme-indigo)' },
        { name: 'Blue', value: 'var(--theme-blue)' },
        { name: 'Light Blue', value: 'var(--theme-light-blue)' },
        { name: 'Cyan', value: 'var(--theme-cyan)' },
        { name: 'Teal', value: 'var(--theme-teal)' },
        { name: 'Green', value: 'var(--theme-green)' },
        { name: 'Light Green', value: 'var(--theme-light-green)' },
        { name: 'Lime', value: 'var(--theme-lime)' },
        { name: 'Yellow', value: 'var(--theme-yellow)' },
        { name: 'Amber', value: 'var(--theme-amber)' },
        { name: 'Orange', value: 'var(--theme-orange)' },
        { name: 'Deep Orange', value: 'var(--theme-deep-orange)' },
        { name: 'Brown', value: 'var(--theme-brown)' },
        { name: 'Grey', value: 'var(--theme-grey)' },
        { name: 'Blue Grey', value: 'var(--theme-blue-grey)' }
    ];

    let selectedThemeValue = 'var(--theme-blue)';

    function initThemeDropdown() {
        themeOptions.innerHTML = '';
        themes.forEach(theme => {
            const option = document.createElement('div');
            option.className = 'theme-option';
            option.dataset.value = theme.value;
            option.innerHTML = `
                <div class="option-swatch" style="background: ${theme.value}"></div>
                <span>${theme.name}</span>
            `;
            option.addEventListener('click', () => {
                selectTheme(theme.value);
                themeDropdown.classList.remove('open');
            });
            themeOptions.appendChild(option);
        });
    }

    function selectTheme(value) {
        const theme = themes.find(t => t.value === value) || themes[5]; // Default to blue
        selectedThemeValue = theme.value;
        currentThemeSwatch.style.background = theme.value;
        currentThemeName.textContent = theme.name;

        // Update selected class in options
        document.querySelectorAll('.theme-option').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === value);
        });

        // Trigger live preview
        document.documentElement.style.setProperty('--primary-color', theme.value);
    }

    themeTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        themeDropdown.classList.toggle('open');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (!themeDropdown.contains(e.target)) {
            themeDropdown.classList.remove('open');
        }
    });

    initThemeDropdown();


    let currentModalCallback = null;
    let currentDeleteActionCallback = null;

    function showModal(title, initialValue, showTheme, initialTheme, callback, deleteCallback) {
        modalTitle.textContent = title;
        modalInput.value = initialValue || '';

        if (showTheme) {
            modalThemeGroup.classList.remove('hidden');
            selectTheme(initialTheme || 'var(--theme-blue)');
        } else {
            modalThemeGroup.classList.add('hidden');
        }

        if (deleteCallback) {
            modalDeleteBtn.style.display = 'block';
            currentDeleteActionCallback = deleteCallback;
        } else {
            modalDeleteBtn.style.display = 'none';
            currentDeleteActionCallback = null;
        }

        modalHomeSectionGroup.classList.add('hidden');
        modalShopSectionGroup.classList.add('hidden');

        currentModalCallback = callback;
        modalOverlay.classList.add('visible');

    }

    function hideModal() {
        modalOverlay.classList.remove('visible');
        themeDropdown.classList.remove('open');
        currentModalCallback = null;
        currentDeleteActionCallback = null;
        updateModeUI(); // Restore original theme
    }

    modalCancelBtn.addEventListener('click', hideModal);

    modalDeleteBtn.addEventListener('click', () => {
        if (currentDeleteActionCallback) {
            currentDeleteActionCallback();
        }
        hideModal();
    });

    modalSaveBtn.addEventListener('click', () => {
        const val = modalInput.value.trim();
        const theme = !modalThemeGroup.classList.contains('hidden') ? selectedThemeValue : null;
        if (currentModalCallback) {
            currentModalCallback(val, theme);
        }
        hideModal();
    });

    // Save when clicking outside the modal
    modalOverlay.addEventListener('mousedown', (e) => {
        // Only trigger if clicking exactly on the overlay (not its children)
        if (e.target === modalOverlay) {
            const val = modalInput.value.trim();
            const theme = !modalThemeGroup.classList.contains('hidden') ? selectedThemeValue : null;
            if (currentModalCallback) {
                currentModalCallback(val, theme);
            }
            hideModal();
        }
    });

    modalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            const val = modalInput.value.trim();
            const theme = !modalThemeGroup.classList.contains('hidden') ? selectedThemeValue : null;
            if (currentModalCallback) {
                currentModalCallback(val, theme);
            }
            hideModal();
        }
    });


    // --- Delete Modal Logic ---
    function showDeleteModal(title, matchName, callback) {
        currentDeleteCallback = callback;
        deleteModalTitle.textContent = title;
        deleteMatchName.textContent = matchName;

        deleteModalOverlay.classList.add('visible');
    }

    function hideDeleteModal() {
        deleteModalOverlay.classList.remove('visible');
        currentDeleteCallback = null;
    }

    deleteConfirmBtn.addEventListener('click', () => {
        if (currentDeleteCallback) {
            currentDeleteCallback();
        }
        hideDeleteModal();
    });

    deleteCancelBtn.addEventListener('click', hideDeleteModal);

    // --- Section Delete Modal Logic ---
    function showSectionDeleteModal(sectionId, sectionName, isHome) {
        const currentList = getCurrentList();
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const itemsInSection = currentList.items.filter(i => i[sectionIdKey] === sectionId).length;

        sectionDeleteModalTitle.textContent = `Delete ${sectionName}?`;
        sectionDeleteModalText.textContent = `This section contains ${itemsInSection} item${itemsInSection === 1 ? '' : 's'}. What would you like to do?`;

        currentSectionDeleteOnlyCallback = () => deleteSection(sectionId, false, isHome);
        currentSectionDeleteAllCallback = () => deleteSection(sectionId, true, isHome);

        sectionDeleteModalOverlay.classList.add('visible');
    }

    function hideSectionDeleteModal() {
        sectionDeleteModalOverlay.classList.remove('visible');
        currentSectionDeleteOnlyCallback = null;
        currentSectionDeleteAllCallback = null;
    }

    function deleteSection(sectionId, deleteAllItems, isHome) {
        const currentList = getCurrentList();
        const sectionsKey = isHome ? 'homeSections' : 'shopSections';
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const indexKey = isHome ? 'homeIndex' : 'shopIndex';

        if (deleteAllItems) {
            currentList.items = currentList.items.filter(i => i[sectionIdKey] !== sectionId);
        } else {
            const fallbackSection = getOrCreateUncategorizedSection(isHome);
            currentList.items.forEach(i => {
                if (i[sectionIdKey] === sectionId) {
                    i[sectionIdKey] = fallbackSection.id;
                }
            });
            // Re-index target section
            const targetItems = currentList.items.filter(i => i[sectionIdKey] === fallbackSection.id);
            targetItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));
            targetItems.forEach((item, idx) => { item[indexKey] = idx; });
        }

        currentList[sectionsKey] = currentList[sectionsKey].filter(s => s.id !== sectionId);

        saveAppState();
        renderList();
        hideSectionDeleteModal();
    }

    sectionDeleteOnlyBtn.addEventListener('click', () => {
        if (currentSectionDeleteOnlyCallback) currentSectionDeleteOnlyCallback();
    });
    sectionDeleteAllBtn.addEventListener('click', () => {
        if (currentSectionDeleteAllCallback) currentSectionDeleteAllCallback();
    });
    sectionDeleteCancelBtn.addEventListener('click', hideSectionDeleteModal);
    sectionDeleteModalOverlay.addEventListener('mousedown', (e) => {
        if (e.target === sectionDeleteModalOverlay) hideSectionDeleteModal();
    });


    // --- Helper ---
    function onDoubleTap(element, callback) {
        let lastTapTime = 0;
        let lastTapElementId = null;

        element.addEventListener('click', (e) => {
            const target = e.target;
            // Identify the relevant element (item or section)
            const row = target.closest('.grocery-item, .section-header');
            const elementId = row ? (row.dataset.id || row.querySelector('[data-id]')?.dataset.id) : null;

            const currentTime = Date.now();
            const timeDiff = currentTime - lastTapTime;

            if (timeDiff < 400 && timeDiff > 0 && elementId === lastTapElementId) {
                e.preventDefault();
                callback(e);
                lastTapTime = 0; // reset
                lastTapElementId = null;
            } else {
                lastTapTime = currentTime;
                lastTapElementId = elementId;
            }
        });

        // Prevent native dblclick to avoid duplicate triggers if browser fires it natively
        element.addEventListener('dblclick', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    }

    function onLongPress(element, callback, duration = 300, options = {}) {
        let pressTimer;
        let isPressing = false;
        let startX, startY;

        const startPress = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            if (!options.allowOnButtons && (e.target.closest('button') || e.target.closest('input'))) return;

            isPressing = true;
            if (e.type === 'mousedown') {
                startX = e.clientX;
                startY = e.clientY;
            } else if (e.touches && e.touches.length > 0) {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }

            pressTimer = setTimeout(() => {
                if (isPressing) {
                    isPressing = false;
                    callback(e);
                }
            }, duration);
        };

        const cancelPress = () => {
            isPressing = false;
            clearTimeout(pressTimer);
        };

        const checkScrollCancel = (e) => {
            if (!isPressing) return;
            if (e.touches && e.touches.length > 0) {
                const curX = e.touches[0].clientX;
                const curY = e.touches[0].clientY;
                if (Math.abs(curX - startX) + Math.abs(curY - startY) > 10) cancelPress();
            } else if (e.type === 'mousemove') {
                if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > 10) cancelPress();
            }
        };

        element.addEventListener('mousedown', startPress);
        element.addEventListener('touchstart', startPress, { passive: true });
        element.addEventListener('mouseup', cancelPress);
        element.addEventListener('mouseleave', cancelPress);
        element.addEventListener('mousemove', checkScrollCancel, { passive: true });
        element.addEventListener('touchend', cancelPress);
        element.addEventListener('touchmove', checkScrollCancel, { passive: true });
    }

    function getCurrentList() {
        return appState.lists.find(l => l.id === appState.currentListId);
    }

    // --- List Management ---
    function addNewList(name, theme) {
        const newList = {
            id: Date.now().toString(),
            name: name,
            theme: theme || 'var(--theme-blue)',
            homeSections: [], // Start with no sections in Home Mode
            shopSections: [{ id: 'sec-s-def', name: 'Uncategorized' }],
            items: []
        };
        appState.lists.push(newList);
        appState.currentListId = newList.id;
        saveAppState();
        renderListsMenu();
        updateModeUI(); // Update theme color
        renderList();
    }

    function switchList(id) {
        if (appState.currentListId === id) return; // Fix double tap bug by preventing instantly unmounting the target 

        appState.currentListId = id;
        saveAppState();
        renderListsMenu();
        updateModeUI(); // Apply the theme of the new list
        renderList();
    }

    function renameList(id) {
        const list = appState.lists.find(l => l.id === id);
        if (!list) return;

        showModal('Edit List', list.name, true, list.theme, (newName, newTheme) => {
            if (newName) {
                list.name = newName;
                if (newTheme) list.theme = newTheme;
                saveAppState();
                renderListsMenu();
                updateModeUI(); // Re-apply theme if current list changed
            }
        }, () => deleteListWithConfirmation(id, list.name));
    }

    function startInlineItemEdit(item, info, nameSpan, onSave) {
        // Turn into text input
        const container = document.createElement('div');
        container.className = 'dynamic-edit-container item-edit-container';

        const mirror = document.createElement('span');
        mirror.className = 'inline-mirror-span item-mirror';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = item.text;
        input.size = 1;
        input.className = 'inline-edit-input';
        applyManualSelection(input);

        const syncMirror = () => {
            mirror.textContent = input.value || ' ';
        };
        input.addEventListener('input', syncMirror);
        syncMirror(); // Initial sync

        const saveName = () => {
            const newName = input.value.trim();
            if (newName && newName !== item.text) {
                if (onSave) {
                    onSave(newName);
                } else {
                    const currentList = getCurrentList();
                    const existing = currentList.items.find(i => i.text.trim() === newName && i.id !== item.id);
                    if (existing) {
                        item.wantCount = existing.wantCount;
                    }
                    item.text = newName;
                    saveAppState();
                }
            }
            renderList();
        };

        input.addEventListener('blur', saveName);
        input.addEventListener('keydown', (ke) => {
            if (ke.key === 'Enter') {
                input.blur();
            } else if (ke.key === 'Escape') {
                renderList();
            }
        });

        container.appendChild(mirror);
        container.appendChild(input);
        info.replaceChild(container, nameSpan);
        input.focus();
    }

    function renameItem(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        modalHomeSectionSelect.innerHTML = '';
        currentList.homeSections.forEach(sec => {
            const opt = document.createElement('option');
            opt.value = sec.id;
            opt.textContent = sec.name;
            modalHomeSectionSelect.appendChild(opt);
        });
        modalHomeSectionSelect.value = item.homeSectionId;

        modalShopSectionSelect.innerHTML = '';
        currentList.shopSections.forEach(sec => {
            const opt = document.createElement('option');
            opt.value = sec.id;
            opt.textContent = sec.name;
            modalShopSectionSelect.appendChild(opt);
        });
        modalShopSectionSelect.value = item.shopSectionId;

        showModal('Edit Item', item.text, false, null, (newName) => {
            if (newName && newName.trim() !== '') {
                const trimmedNewName = newName.trim();
                const existing = currentList.items.find(i => i.text.trim() === trimmedNewName && i.id !== item.id);
                if (existing) {
                    item.wantCount = existing.wantCount;
                }
                item.text = trimmedNewName;
                item.homeSectionId = modalHomeSectionSelect.value;
                item.shopSectionId = modalShopSectionSelect.value;
                saveAppState();
                renderList();
            }
        }, () => deleteItem(id));

        modalHomeSectionGroup.classList.remove('hidden');
        modalShopSectionGroup.classList.remove('hidden');
    }

    function addSection(name, isHome) {
        const currentList = getCurrentList();
        const trimmedName = name.trim();
        if (!trimmedName) return;

        const sectionArray = isHome ? currentList.homeSections : currentList.shopSections;

        const newSection = {
            id: 'sec-' + Date.now().toString(),
            name: trimmedName
        };

        sectionArray.push(newSection);

        saveAppState();
        renderList();
    }

    function deleteListWithConfirmation(id, name) {
        if (appState.lists.length <= 1) {
            alert("You must have at least one list.");
            return;
        }

        showDeleteModal('Delete List?', name, () => {
            appState.lists = appState.lists.filter(l => l.id !== id);
            if (appState.currentListId === id) {
                appState.currentListId = appState.lists[0].id;
            }
            saveAppState();
            renderListsMenu();
            updateModeUI();
            renderList();
        });
    }


    function getOrCreateUncategorizedSection(isHome) {
        const currentList = getCurrentList();
        const sectionArray = isHome ? currentList.homeSections : currentList.shopSections;
        const defId = isHome ? 'sec-h-def' : 'sec-s-def';
        let uncategorized = sectionArray.find(s => s.id === defId);
        if (!uncategorized) {
            uncategorized = {
                id: defId,
                name: 'Uncategorized'
            };
            sectionArray.unshift(uncategorized);
        }
        return uncategorized;
    }

    // --- Core Functions ---

    function addItemToSection(sectionId, textValue, isHome) {
        const text = textValue ? textValue.trim() : '';
        if (!text) return;

        const currentList = getCurrentList();

        let targetSectionId = sectionId;

        // Ensure the item has a section in both modes.
        // If the target mode (Home or Shop) has no sections, create "Uncategorized" as a fallback.
        if (isHome && currentList.homeSections.length === 0) {
            const uncategorized = getOrCreateUncategorizedSection(true);
            targetSectionId = uncategorized.id;
        } else if (!isHome && currentList.homeSections.length === 0) {
            // Adding in Shop mode, but Home mode has no sections. 
            // Create "Uncategorized" in Home so the item is visible there.
            getOrCreateUncategorizedSection(true);
        }

        const existing = currentList.items.find(i => i.text.trim() === text);

        const newItem = {
            id: Date.now().toString(),
            text: text,
            homeSectionId: isHome ? targetSectionId : currentList.homeSections[0].id,
            shopSectionId: !isHome ? targetSectionId : 'sec-s-def',
            homeIndex: currentList.items.length,
            shopIndex: currentList.items.length,
            haveCount: 0,
            wantCount: existing ? existing.wantCount : 1,
            shopCompleted: false
        };

        currentList.items.push(newItem);
        saveAppState();
        renderList();

        const newInlineInput = document.querySelector(`.section-items-list[data-section-id="${sectionId}"] .inline-item-input`);
        if (newInlineInput) newInlineInput.focus();
    }

    function createSparks(x, y) {
        const count = 8;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color');

        for (let i = 0; i < count; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark-particle';
            spark.style.backgroundColor = color;
            spark.style.left = x + 'px';
            spark.style.top = y + 'px';
            
            document.body.appendChild(spark);
            
            const angle = (i / count) * Math.PI * 2;
            const velocity = 30 + Math.random() * 40;
            const destinationX = Math.cos(angle) * velocity;
            const destinationY = Math.sin(angle) * velocity;

            spark.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${destinationX}px), calc(-50% + ${destinationY}px)) scale(0)`, opacity: 0 }
            ], {
                duration: 600,
                easing: 'cubic-bezier(0, .9, .57, 1)',
                fill: 'forwards'
            }).onfinish = () => spark.remove();
        }
    }

    function createFuseSparks(x, y) {
        const count = 2;
        const color = getComputedStyle(document.documentElement).getPropertyValue('--primary-color');

        for (let i = 0; i < count; i++) {
            const spark = document.createElement('div');
            spark.className = 'spark-particle fuse-spark-particle';
            spark.style.backgroundColor = color;
            spark.style.left = x + 'px';
            spark.style.top = y + 'px';

            document.body.appendChild(spark);

            const angle = Math.random() * Math.PI * 2;
            const velocity = 5 + Math.random() * 15;
            const destinationX = Math.cos(angle) * velocity;
            const destinationY = Math.sin(angle) * velocity;

            spark.animate([
                { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
                { transform: `translate(calc(-50% + ${destinationX}px), calc(-50% + ${destinationY}px)) scale(0)`, opacity: 0 }
            ], {
                duration: 400,
                easing: 'ease-out',
                fill: 'forwards'
            }).onfinish = () => spark.remove();
        }
    }

    let animatingItems = new Map(); // id -> 'completing' | 'undoing'
    async function toggleShopCompleted(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        const sameNameItems = currentList.items.filter(i => i.text === item.text);
        if (sameNameItems.some(i => animatingItems.has(i.id))) return;

        const newState = !item.shopCompleted;

        try {
            if (!newState) {
                // Cancel any pending commit
                if (committingControllers.has(item.text)) {
                    committingControllers.get(item.text).abort();
                    committingControllers.delete(item.text);
                    sameNameItems.forEach(i => {
                        committingProgress.delete(i.id);
                        const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                        if (el) {
                            el.classList.remove('is-committing');
                            el.style.setProperty('--commit-progress', 1);
                        }
                    });
                }
            }

            sameNameItems.forEach(i => animatingItems.set(i.id, newState ? 'completing' : 'undoing'));

            sameNameItems.forEach(i => {
                const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                if (el) {
                    if (newState) {
                        el.classList.add('is-completing');
                    } else {
                        el.classList.remove('completed', 'is-committing');
                        el.classList.add('is-undoing');
                    }
                }
            });

            if (newState) {
                // Pre-set progress to 1 for fading mask
                sameNameItems.forEach(i => {
                    const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                    if (el) el.style.setProperty('--commit-progress', 1);
                });

                // Completion sequence
                // Both animations start immediately:
                // 1. Circle fills (check icon appears) takes 0.3s
                // 2. Strike-through takes 0.4s
                // Total duration: 0.4s
                await new Promise(r => setTimeout(r, 300));

                // Trigger sparks after circle fill
                sameNameItems.forEach(i => {
                    const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                    if (el) {
                        const circle = el.querySelector('.shop-qty-circle');
                        if (circle) {
                            const rect = circle.getBoundingClientRect();
                            createSparks(rect.left + rect.width / 2, rect.top + rect.height / 2);
                        }
                    }
                });

                // Wait for strike-through to complete (0.1s more)
                await new Promise(r => setTimeout(r, 100));

                sameNameItems.forEach(i => {
                    i.shopCompleted = true;
                    i.shopCheckOrder = Date.now();

                    // Manually update classes to maintain state without renderList()
                    const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                    if (el) {
                        el.classList.remove('is-completing');
                        el.classList.add('completed');
                        // Ensure it's not hidden as zero-qty since it's now completed
                        el.classList.remove('zero-qty-item');
                    }
                });

                // Start commit animation
                const controller = new AbortController();
                const signal = controller.signal;
                committingControllers.set(item.text, controller);

                const duration = 4000;
                let startTime = null;

                // Pre-set progress so renderList (if called) knows we are committing
                sameNameItems.forEach(i => committingProgress.set(i.id, 1.0));

                const runCommit = async () => {
                    return new Promise((resolve) => {
                        const frame = (now) => {
                            if (signal.aborted) {
                                resolve(false);
                                return;
                            }
                            if (!startTime) startTime = now;

                            const elapsed = now - startTime;
                            const progress = Math.max(0, 1 - (elapsed / duration));

                            sameNameItems.forEach(i => committingProgress.set(i.id, progress));

                            const currentRows = sameNameItems.map(i => document.querySelector(`.grocery-item[data-id="${i.id}"]`)).filter(Boolean);
                            currentRows.forEach(row => {
                                row.classList.add('is-committing');
                                row.style.setProperty('--commit-progress', progress);

                                // Fuse sparks at tip
                                const textSpan = row.querySelector('.item-text');
                                if (textSpan) {
                                    const rect = textSpan.getBoundingClientRect();
                                    const tipX = rect.left + rect.width * progress;
                                    const tipY = rect.top + rect.height / 2;
                                    createFuseSparks(tipX, tipY);
                                }
                            });

                            if (progress > 0) {
                                requestAnimationFrame(frame);
                            } else {
                                resolve(true);
                            }
                        };
                        requestAnimationFrame(frame);
                    });
                };

                runCommit().then(async (completed) => {
                    if (completed) {
                        committingControllers.delete(item.text);

                        const groupRows = sameNameItems.map(i => document.querySelector(`.grocery-item[data-id="${i.id}"]`)).filter(Boolean);
                        groupRows.forEach(row => {
                            row.classList.add('is-committed');
                            row.classList.remove('is-committing');
                            row.style.setProperty('--commit-progress', 0);

                            const circle = row.querySelector('.shop-qty-circle');
                            if (circle) {
                                const rect = circle.getBoundingClientRect();
                                createSparks(rect.left + rect.width / 2, rect.top + rect.height / 2);
                            }
                        });

                        await new Promise(r => setTimeout(r, 800));
                        groupRows.forEach(row => row.classList.add('collapsing'));
                        await new Promise(r => setTimeout(r, 300));

                        // Cleanup progress map after collapse starts
                        sameNameItems.forEach(i => committingProgress.delete(i.id));

                        const currentList = getCurrentList();
                        sameNameItems.forEach((i, idx) => {
                            const actualItem = currentList.items.find(it => it.id === i.id);
                            if (actualItem) {
                                if (idx === 0) {
                                    actualItem.haveCount = actualItem.wantCount;
                                } else {
                                    actualItem.haveCount = 0;
                                }
                                actualItem.shopCompleted = false;
                            }
                        });

                        saveAppState();
                        renderList();
                    }
                });

            } else {
                // Undo sequence
                await new Promise(r => setTimeout(r, 300));

                sameNameItems.forEach(i => {
                    i.shopCompleted = false;
                    i.shopCheckOrder = null;

                    // Manually update classes
                    const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                    if (el) {
                        el.classList.remove('is-undoing');
                        // If it becomes zero-qty again, hide it
                        const toBuy = Math.max(0, i.wantCount - i.haveCount);
                        if (toBuy <= 0 && !editMode) {
                            el.classList.add('zero-qty-item');
                        }
                    }
                });

                // Check if sections should be hidden manually
                const sectionIds = new Set(sameNameItems.map(i => i.shopSectionId));
                sectionIds.forEach(sectionId => {
                    const sectionLi = document.querySelector(`.section-container[data-id="${sectionId}"]`);
                    if (sectionLi) {
                        // In shop mode, we group by name, so we need to check group visibility
                        // But for a quick manual fix, we can just check if there are any chips without .zero-qty-item
                        const visibleItems = sectionLi.querySelectorAll('.grocery-item:not(.zero-qty-item)');
                        if (visibleItems.length === 0) {
                            sectionLi.classList.add('zero-qty-section');
                        } else {
                            sectionLi.classList.remove('zero-qty-section');
                        }
                    }
                });
            }
        } finally {
            sameNameItems.forEach(i => animatingItems.delete(i.id));
        }

        saveAppState();

        // Only re-render if no other items are currently animating to prevent jump
        if (animatingItems.size === 0) {
            renderList();
        }
    }

    function deleteItem(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        // Mark as pending delete
        item.pendingDelete = true;
        newlyDeletedIds.add(id);

        // Save state immediately - items with pendingDelete will be filtered out during save
        saveAppState();

        // Clear any existing timer just in case
        if (pendingDeletions.has(id)) {
            clearTimeout(pendingDeletions.get(id));
        }

        // Set timer for final removal
        const timerId = setTimeout(() => {
            finalizeDeleteItem(id);
        }, 5000);

        pendingDeletions.set(id, timerId);

        renderList();
    }

    function undoDeleteItem(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        if (pendingDeletions.has(id)) {
            clearTimeout(pendingDeletions.get(id));
            pendingDeletions.delete(id);
        }

        item.pendingDelete = false;
        saveAppState();
        renderList();
    }

    function finalizeDeleteItem(id) {
        const row = document.querySelector(`.grocery-item[data-id="${id}"]`);
        if (row) {
            row.classList.add('collapsing');
            setTimeout(() => {
                actuallyRemoveItem(id);
            }, 300);
        } else {
            actuallyRemoveItem(id);
        }
    }

    function actuallyRemoveItem(id) {
        const currentList = getCurrentList();
        if (!currentList) return;
        currentList.items = currentList.items.filter(i => i.id !== id);
        pendingDeletions.delete(id);
        saveAppState();
        renderList();
    }

    function setHave(id, value) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (item) {
            item.haveCount = Math.max(0, parseInt(value) || 0);
            saveAppState();
            // Optimization: Update only the relevant input if possible
            const stepper = document.querySelector(`.grocery-item[data-id="${id}"] .have-stepper`);
            if (stepper) {
                const input = stepper.querySelector('.qty-input');
                if (input) {
                    input.value = item.haveCount;
                    input.classList.remove('pop-animate');
                    void input.offsetWidth;
                    input.classList.add('pop-animate');
                    return;
                }
            }
            renderList();
        }
    }

    function setWant(id, value) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (item) {
            const newWant = Math.max(0, parseInt(value) || 0);
            const sameNameItems = currentList.items.filter(i => i.text.trim() === item.text.trim());
            sameNameItems.forEach(i => i.wantCount = newWant);
            saveAppState();

            sameNameItems.forEach(i => {
                const stepper = document.querySelector(`.grocery-item[data-id="${i.id}"] .want-stepper`);
                if (stepper) {
                    const input = stepper.querySelector('.qty-input');
                    if (input) {
                        input.value = i.wantCount;
                        input.classList.remove('pop-animate');
                        void input.offsetWidth;
                        input.classList.add('pop-animate');
                    }
                }
                const circle = document.querySelector(`.grocery-item[data-id="${i.id}"] .shop-qty-circle`);
                if (circle) {
                    const qtyNum = circle.querySelector('.qty-number');
                    if (qtyNum) {
                        const toBuy = Math.max(0, i.wantCount - i.haveCount);
                        qtyNum.textContent = toBuy;
                    }
                }
            });

            return;
        }
    }

    function updateModeUI() {
        const currentList = getCurrentList();
        const themeColor = currentList && currentList.theme ? currentList.theme : 'var(--theme-blue)';
        document.documentElement.style.setProperty('--primary-color', themeColor);

        // Update list picker name and swatch
        if (currentList) {
            if (currentListNameSpan) currentListNameSpan.textContent = currentList.name;
            if (currentListSwatch) currentListSwatch.style.background = currentList.theme || 'var(--theme-blue)';
        }

        // Update toolbar mode CTA
        if (toolbarModeBtn) {
            toolbarModeBtn.classList.toggle('active', currentMode === 'shop');
            toolbarModeBtn.title = currentMode === 'shop' ? 'Switch to Home Mode' : 'Switch to Store Mode';
        }

        if (toolbarReorderBtn) {
            toolbarReorderBtn.classList.toggle('active', editMode);
            toolbarReorderBtn.title = editMode ? 'Exit Edit Mode' : 'Enter Edit Mode';
        }

        // Update zero-qty visibility classes
        const isHome = currentMode === 'home';
        const hideZeroQty = !isHome && !editMode;
        if (appContainer) {
            appContainer.classList.toggle('hide-zero-qty', hideZeroQty);
            appContainer.classList.toggle('hide-drag-handles', !editMode);
            appContainer.classList.toggle('home-mode', isHome);
            appContainer.classList.toggle('shop-mode', !isHome);
        }
    }

    function saveAppState() {
        // Clone appState for saving, filtering out items that are currently pending deletion
        const stateToSave = JSON.parse(JSON.stringify(appState));
        stateToSave.lists.forEach(list => {
            list.items = list.items.filter(item => !item.pendingDelete);
        });
        localStorage.setItem('grocery-app-state', JSON.stringify(stateToSave));
    }

    function saveMode() {
        localStorage.setItem('grocery-mode', currentMode);
        localStorage.setItem('grocery-edit-mode', JSON.stringify(editMode));
    }

    function renderListsMenu() {
        if (!listsMenu) return;
        listsMenu.innerHTML = '';

        const addBtn = document.createElement('div');
        addBtn.className = 'menu-item';
        addBtn.innerHTML = '<i class="fas fa-plus" style="width: 12px; text-align: center;"></i> <span>Create New List</span>';
        addBtn.addEventListener('click', () => {
            showModal('Create New List', 'New List', true, 'var(--theme-blue)', (name, theme) => {
                if (name) addNewList(name, theme);
            });
            toggleListsMenu(false);
        });
        listsMenu.appendChild(addBtn);

        const otherLists = appState.lists.filter(l => l.id !== appState.currentListId);

        if (otherLists.length > 0) {
            const divider = document.createElement('div');
            divider.className = 'menu-divider';
            listsMenu.appendChild(divider);

            otherLists.forEach((list) => {
                const item = document.createElement('div');
                item.className = 'menu-item';

                const swatch = document.createElement('div');
                swatch.className = 'list-swatch';
                swatch.style.background = list.theme || 'var(--theme-blue)';

                const text = document.createElement('span');
                text.textContent = list.name;

                item.appendChild(swatch);
                item.appendChild(text);

                item.addEventListener('click', () => {
                    switchList(list.id);
                    toggleListsMenu(false);
                });

                onLongPress(item, (e) => {
                    e.stopPropagation();
                    renameList(list.id);
                });

                onDoubleTap(text, (e) => {
                    if (!editMode) return;
                    e.stopPropagation();
                    renameList(list.id);
                });

                listsMenu.appendChild(item);
            });
        }
    }

    function toggleListsMenu(force) {
        listsMenuOpen = force !== undefined ? force : !listsMenuOpen;
        if (listsMenu) {
            listsMenu.classList.toggle('open', listsMenuOpen);
        }
        if (toolbarListsBtn) {
            toolbarListsBtn.classList.toggle('open', listsMenuOpen);
        }
    }
    function createDragHandle() {
        const handle = document.createElement('div');
        handle.className = 'drag-handle';
        handle.innerHTML = '<i class="fas fa-grip-vertical"></i>';
        handle.draggable = true;
        return handle;
    }

    function createLeftAction(children = []) {
        const leftAction = document.createElement('div');
        leftAction.className = 'left-action';
        if (Array.isArray(children)) {
            children.forEach(child => leftAction.appendChild(child));
        } else if (children) {
            leftAction.appendChild(children);
        }
        return leftAction;
    }

    function renderList() {
        const fragment = document.createDocumentFragment();
        const currentList = getCurrentList();
        if (!currentList) {
            groceryList.innerHTML = '';
            return;
        }

        const isHome = currentMode === 'home';
        const sectionsKey = isHome ? 'homeSections' : 'shopSections';
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const indexKey = isHome ? 'homeIndex' : 'shopIndex';

        const sections = currentList[sectionsKey] || [];

        // Toggle global reorder/selection classes
        if (!isHome && shopSelectionMode) {
            groceryList.classList.add('shop-selection-mode');
        } else {
            groceryList.classList.remove('shop-selection-mode');
        }


        // Pre-group items for shop mode
        const groupedMap = new Map();
        const nameToSection = new Map();
        if (!isHome) {
            currentList.items.forEach(item => {
                const name = item.text.trim();
                if (!groupedMap.has(name)) {
                    groupedMap.set(name, {
                        id: item.id,
                        text: name,
                        wantCount: 0,
                        haveCount: 0,
                        shopCompleted: true,
                        shopSectionId: item.shopSectionId,
                        shopIndex: item.shopIndex,
                        allIds: []
                    });
                    nameToSection.set(name, item.shopSectionId);
                }
                const group = groupedMap.get(name);
                group.wantCount = item.wantCount;
                group.haveCount += item.haveCount;
                group.allIds.push(item.id);
                if (!item.shopCompleted) group.shopCompleted = false;
            });
        }

        sections.forEach((section) => {
            // items for this section 
            let sectionItems;
            if (isHome) {
                sectionItems = currentList.items.filter(i => i[sectionIdKey] === section.id);
            } else {
                // Filter groups for this section
                sectionItems = [];
                groupedMap.forEach(group => {
                    if (nameToSection.get(group.text) === section.id) {
                        sectionItems.push(group);
                    }
                });

                // Add pending delete items for this section (should not be grouped)
                currentList.items.forEach(item => {
                    if (item.pendingDelete && item.shopSectionId === section.id) {
                        sectionItems.push(item);
                    }
                });
            }


            const sectionLi = document.createElement('li');
            sectionLi.className = 'section-container';
            sectionLi.dataset.id = section.id;
            sectionLi.dataset.type = 'section';

            if (!isHome) {
                const hasVisibleItems = sectionItems.some(item => {
                    const toBuy = item.wantCount - item.haveCount;
                    return toBuy > 0 || item.shopCompleted || item.pendingDelete;
                });
                sectionLi.classList.toggle('zero-qty-section', !hasVisibleItems);
            }

            // Section Header
            const header = document.createElement('div');
            header.className = 'section-header';

            const canRename = isHome || section.id !== shopDefId;
            const dragHandleHTML = canRename
                ? `<div class="left-action"><div class="drag-handle section-drag-handle" draggable="true"><i class="fas fa-grip-vertical"></i></div></div>`
                : `<div class="left-action"><div class="drag-handle section-drag-handle disabled" draggable="false"><i class="fas fa-grip-vertical"></i></div></div>`;

            const sectionDeleteHTML = canRename
                ? `<button class="section-delete-btn"><i class="fas fa-times"></i></button>`
                : '';

            const moveHereHTML = !isHome
                ? `<button class="move-here-btn"><i class="fas fa-level-down-alt"></i></button>`
                : '';

            header.innerHTML = `
                ${dragHandleHTML}
                <h3 class="section-title" data-id="${section.id}">${escapeHTML(section.name)}</h3>
                <div class="section-actions">
                    ${sectionDeleteHTML}
                    ${moveHereHTML}
                </div>
            `;

            sectionLi.appendChild(header);

            // Nested UL for items
            const itemsUl = document.createElement('ul');
            itemsUl.className = 'section-items-list';
            itemsUl.dataset.sectionId = section.id;
            itemsUl.dataset.type = 'item-placeholder'; // Allow empty UL to receive drops

            sectionItems.sort((a, b) => a[indexKey] - b[indexKey]);

            if (!isHome) {
                itemsUl.classList.add('shop-mode');
            }


            sectionItems.forEach((item, idx) => {
                const li = document.createElement('li');
                const isAnimating = animatingItems.get(item.id);
                const isCompleted = item.shopCompleted && isAnimating !== 'undoing';
                li.className = `grocery-item ${isHome ? '' : 'shop-chip'} ${isCompleted && !isHome ? 'completed' : ''}`;
                if (isAnimating === 'completing') li.classList.add('is-completing');
                if (isAnimating === 'undoing') li.classList.add('is-undoing');

                if (committingProgress.has(item.id)) {
                    li.classList.add('is-committing');
                    li.style.setProperty('--commit-progress', committingProgress.get(item.id));
                }

                if (!isHome && !item.pendingDelete) {
                    const isSelected = selectedShopItems.has(item.id);
                    if (isSelected) {
                        li.classList.add('selected');
                        const prevItem = sectionItems[idx - 1];
                        const nextItem = sectionItems[idx + 1];
                        if (prevItem && selectedShopItems.has(prevItem.id)) li.classList.add('sel-top');
                        if (nextItem && selectedShopItems.has(nextItem.id)) li.classList.add('sel-bottom');
                    }
                }

                if (isSectionRestoration) li.classList.add('restoring-item');
                li.dataset.id = item.id;
                li.dataset.type = 'item';
                li.dataset.sectionId = section.id;

                if (item.pendingDelete) {
                    li.classList.add('undo-row');
                    if (newlyDeletedIds.has(item.id)) {
                        li.classList.add('undo-row-animate');
                    }

                    if (isHome) {
                        const prevItem = sectionItems[idx - 1];
                        const nextItem = sectionItems[idx + 1];
                        if (prevItem && prevItem.pendingDelete) li.classList.add('sel-top');
                        if (nextItem && nextItem.pendingDelete) li.classList.add('sel-bottom');
                    }

                    li.dataset.id = item.id;
                    li.dataset.type = 'item';
                    li.dataset.sectionId = section.id;

                    li.innerHTML = `
                        <div class="left-action"></div>
                        <div class="item-info">
                            <span class="item-text">${escapeHTML(item.text)}</span>
                        </div>
                        <button class="undo-btn-inline">Undo</button>
                    `;

                    itemsUl.appendChild(li);
                    return;
                }

                if (!isHome) {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);
                    const isZeroQty = toBuy <= 0 && !item.shopCompleted && !item.pendingDelete;
                    li.classList.toggle('zero-qty-item', isZeroQty);
                }


                li.dataset.id = item.id;
                li.dataset.type = 'item';
                li.dataset.sectionId = section.id;

                if (isHome) {
                    li.innerHTML = `
                        <div class="left-action">
                            <div class="drag-handle" draggable="true">
                                <i class="fas fa-grip-vertical"></i>
                            </div>
                        </div>
                        <div class="item-info">
                            <span class="item-text">${escapeHTML(item.text)}</span>
                        </div>
                        <div class="quantity-controls"></div>
                        <button class="item-delete-btn"><i class="fas fa-times"></i></button>
                    `;

                    const controls = li.querySelector('.quantity-controls');
                    controls.appendChild(createQtyStepper(item, 'have'));
                } else {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);
                    li.innerHTML = `
                        <div class="left-action">
                            <div class="drag-handle" draggable="true">
                                <i class="fas fa-grip-vertical"></i>
                            </div>
                            <div class="shop-qty-circle">
                                <span class="qty-number">${toBuy}</span>
                                <i class="fas fa-check check-icon"></i>
                            </div>
                        </div>
                        <div class="item-info">
                            <span class="item-text">${escapeHTML(item.text)}</span>
                        </div>
                        <div class="quantity-controls"></div>
                    `;

                    li.querySelector('.quantity-controls').appendChild(createQtyStepper(item, 'want'));
                }

                itemsUl.appendChild(li);
            });


            // Add "Add item" row for this section
            if (isHome) {
                const addRow = document.createElement('li');
                addRow.className = 'grocery-item add-item-row';
                if (isSectionRestoration) addRow.classList.add('restoring-item');
                addRow.dataset.type = 'item-placeholder';
                addRow.dataset.sectionId = section.id;

                addRow.innerHTML = `
                    <div class="left-action">
                        <div class="drag-handle add-row-plus">
                            <i class="fas fa-plus"></i>
                        </div>
                    </div>
                    <div class="item-info">
                        <form class="input-group inline-input-group">
                            <input type="text" class="inline-item-input add-item-input" placeholder="Add item">
                        </form>
                    </div>
                `;

                itemsUl.appendChild(addRow);
            }
            sectionLi.appendChild(itemsUl);

            fragment.appendChild(sectionLi);
        });


        // Add "Add a section..." element at the bottom
        const addSecRow = document.createElement('li');
        addSecRow.className = 'grocery-item add-section-row';

        addSecRow.dataset.type = 'section-placeholder';

        addSecRow.innerHTML = `
            <div class="left-action">
                <div class="drag-handle add-row-plus">
                    <i class="fas fa-plus"></i>
                </div>
            </div>
            <div class="item-info">
                <form class="input-group inline-input-group">
                    <input type="text" placeholder="Add section" class="inline-item-input add-section-input">
                </form>
            </div>
        `;

        fragment.appendChild(addSecRow);

        groceryList.innerHTML = '';
        groceryList.appendChild(fragment);

        // Update intersection observer
        viewportObserver.disconnect();
        const rows = groceryList.querySelectorAll('.grocery-item, .section-container, .section-header');
        rows.forEach(row => viewportObserver.observe(row));

        // Apply manual selection to dynamically added inputs
        groceryList.querySelectorAll('.add-item-input, .add-section-input').forEach(applyManualSelection);

        newlyDeletedIds.clear();
    }

    function createQtyStepper(item, type) {
        const group = document.createElement('div');
        group.className = `qty-stepper ${type}-stepper`;

        const input = document.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.className = 'qty-input';
        input.value = type === 'have' ? item.haveCount : item.wantCount;

        group.appendChild(input);
        applyManualSelection(input);
        input.addEventListener('contextmenu', (e) => e.preventDefault());

        input.addEventListener('input', () => {
            if (type === 'have') {
                setHave(item.id, input.value);
            } else {
                setWant(item.id, input.value);
            }
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                // Find next visible qty-input
                const allInputs = Array.from(document.querySelectorAll('.qty-input'));
                const visibleInputs = allInputs.filter(inp => {
                    const style = window.getComputedStyle(inp.parentElement);
                    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
                });
                const idx = visibleInputs.indexOf(input);
                if (idx !== -1 && idx < visibleInputs.length - 1) {
                    visibleInputs[idx + 1].focus();
                } else {
                    input.blur();
                }
            }
        });

        return group;
    }

    // Close menus on outside click
    document.addEventListener('click', (e) => {
        if (listsMenuOpen && !listsMenu.contains(e.target) && !toolbarListsBtn.contains(e.target)) {
            toggleListsMenu(false);
        }
    });

    function flattenList() {
        const sections = Array.from(groceryList.querySelectorAll('.section-container'));
        sections.forEach(section => {
            const header = section.querySelector('.section-header');
            const list = section.querySelector('.section-items-list');
            const items = Array.from(list.querySelectorAll('.grocery-item, .add-item-row, .drag-placeholder'));
            
            // Mark items with their parent section ID for restoration
            if (header) {
                header.dataset.originalSectionId = section.dataset.id;
                groceryList.appendChild(header);
            }
            
            items.forEach(item => {
                item.dataset.originalSectionId = section.dataset.id;
                item.classList.add('flattened-indent');
                groceryList.appendChild(item);
            });
            
            section.style.display = 'none';
        });
        groceryList.appendChild(document.querySelector('.add-section-row'));
    }

    function restoreList() {
        const elements = Array.from(groceryList.children);
        const sections = Array.from(groceryList.querySelectorAll('.section-container'));
        const sectionMap = new Map();
        
        sections.forEach(s => {
            sectionMap.set(s.dataset.id, s);
            const list = s.querySelector('.section-items-list');
            list.innerHTML = ''; // Clear for rebuild
            s.style.display = '';
        });

        let currentSectionId = null;
        elements.forEach(el => {
            el.classList.remove('flattened-indent');
            if (el.classList.contains('section-header')) {
                currentSectionId = el.dataset.originalSectionId;
            } else if (el.classList.contains('grocery-item') || el.classList.contains('add-item-row') || el === placeholder) {
                const targetId = el.dataset.originalSectionId || currentSectionId;
                const section = sectionMap.get(targetId);
                if (section) {
                    section.querySelector('.section-items-list').appendChild(el);
                }
            } else if (el.classList.contains('add-section-row')) {
                groceryList.appendChild(el); // Stays at bottom
            }
        });
        
        // Re-append sections in their current order (if they moved)
        sections.forEach(s => groceryList.appendChild(s));
    }

    function handleDragStart(e, element, type) {
        if (!editMode) {
            e.preventDefault();
            return;
        }
        if (currentMode !== 'home' && type === 'section' && element.dataset.id === shopDefId) {
            e.preventDefault();
            return;
        }
        draggedElement = element;
        dragType = type;

        if (e.dataTransfer) {
            e.dataTransfer.setData('text/plain', element.dataset.id || '');
            e.dataTransfer.effectAllowed = 'move';

            // Hide native ghost so we can use our manual one
            const emptyImg = new Image();
            emptyImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
            e.dataTransfer.setDragImage(emptyImg, 0, 0);
        }

        const startY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

        // Capture initial positions for FLIP animation (headers)
        let headerInitialTops = new Map();
        if (type === 'section') {
            document.querySelectorAll('.section-header').forEach(h => {
                headerInitialTops.set(h, h.getBoundingClientRect().top);
            });
        }

        // For mouse events, create the ghost immediately
        if (e.type === 'dragstart') {
            createDragVisual(e, element, type);
        }

        const startDragging = () => {
            if (draggedElement !== element) return;
            
            isDragStarted = true;
            groceryList.classList.add('no-transition');
            document.body.style.overflow = 'hidden';

            // Initialize placeholder at starting position to prevent layout shift
            const phHeight = type === 'section' ? 50 : element.offsetHeight;
            placeholder.style.height = phHeight + 'px';
            element.before(placeholder);

            if (type === 'item') {
                flattenList();
                placeholder.classList.add('flattened-indent');
            }

            if (type === 'section') {
                document.querySelectorAll('.section-items-list').forEach(el => {
                    el.innerHTML = '';
                    el.classList.add('collapsed');
                });
                document.querySelectorAll('.add-item-row').forEach(el => {
                    el.classList.add('collapsed');
                });
            }

            // Performance: cache relevant siblings once at drag start
            relevantSiblings = Array.from(groceryList.children).filter(el => 
                el.nodeType === 1 && 
                !el.classList.contains('collapsed') && 
                el !== draggedElement && 
                el !== placeholder
            );

            element.classList.add('dragging');
            element.classList.add('collapsed');
            element.style.pointerEvents = 'none'; // Prevent interfering with target detection

            if (type === 'section') {
                // Align the placeholder with the finger
                groceryList.style.paddingTop = '60vh';
                groceryList.style.paddingBottom = '60vh';
                
                // Use the placeholder as the anchor for alignment
                const phRect = placeholder.getBoundingClientRect();
                const desiredPhTop = startY - dragOffset.y;
                window.scrollBy(0, phRect.top - desiredPhTop);

                // FLIP Animation for headers
                document.querySelectorAll('.section-header').forEach(h => {
                    if (headerInitialTops.has(h)) {
                        const newTop = h.getBoundingClientRect().top;
                        const oldTop = headerInitialTops.get(h);
                        const delta = oldTop - newTop;
                        if (delta !== 0) {
                            h.animate([
                                { transform: `translateY(${delta}px)` },
                                { transform: 'translateY(0)' }
                            ], {
                                duration: 400,
                                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                            });
                        }
                    }
                });
            }
        };

        if (e.type === 'touchstart') {
            startDragging();
        } else {
            // Use a small timeout to allow the browser to capture the drag image before we rearrange the DOM.
            setTimeout(startDragging, 50);
        }
    }

    function animatePlaceholderMove(target, isBefore) {
        if (isBefore && target.previousElementSibling === placeholder) return;
        if (!isBefore && target.nextElementSibling === placeholder) return;

        // Use cached siblings for faster measurement
        const initialPositions = new Map();
        relevantSiblings.forEach(el => {
            initialPositions.set(el, el.getBoundingClientRect().top);
        });

        if (isBefore) {
            target.before(placeholder);
        } else {
            target.after(placeholder);
        }

        relevantSiblings.forEach(el => {
            const newTop = el.getBoundingClientRect().top;
            const oldTop = initialPositions.get(el);
            const delta = oldTop - newTop;

            if (delta !== 0) {
                el.animate([
                    { transform: `translateY(${delta}px)` },
                    { transform: 'translateY(0)' }
                ], {
                    duration: 400,
                    easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                });
            }
        });
    }

    function handleAutoScrollLoop() {
        if (scrollSpeed === 0) {
            scrollAnimationFrame = null;
            return;
        }
        window.scrollBy(0, scrollSpeed);
        scrollAnimationFrame = requestAnimationFrame(handleAutoScrollLoop);
    }

    function updateAutoScroll(clientY) {
        const threshold = 100;
        const maxSpeed = 20;
        let speed = 0;

        if (clientY < threshold) {
            speed = -maxSpeed * (1 - Math.max(0, clientY) / threshold);
        } else if (clientY > window.innerHeight - threshold) {
            speed = maxSpeed * (1 - Math.max(0, window.innerHeight - clientY) / threshold);
        }

        scrollSpeed = speed;
        if (scrollSpeed !== 0 && !scrollAnimationFrame) {
            scrollAnimationFrame = requestAnimationFrame(handleAutoScrollLoop);
        }
    }

    function stopAutoScroll() {
        scrollSpeed = 0;
        if (scrollAnimationFrame) {
            cancelAnimationFrame(scrollAnimationFrame);
            scrollAnimationFrame = null;
        }
    }

    groceryList.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedElement || !isDragStarted) return;

        if (touchGhost) {
            touchGhost.style.top = (e.clientY - dragOffset.y) + 'px';
        }

        updateAutoScroll(e.clientY);

        if (dragUpdateFrame) return;
        dragUpdateFrame = requestAnimationFrame(() => {
            dragUpdateFrame = null;
            if (!draggedElement) return;

            let targetSelector = dragType === 'section' ? '.section-container, .add-section-row' : '.grocery-item, .section-header, .add-item-row, .add-section-row';
            let target = e.target.closest(targetSelector);

            if (!target || target === draggedElement || target.classList.contains('drag-placeholder')) return;

            if (dragType === 'item') {
                const rect = target.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                let isBefore = e.clientY < midpoint;
                
                if (target.classList.contains('add-item-row')) isBefore = true;
                if (target.classList.contains('section-header')) isBefore = false;

                if (target.classList.contains('add-section-row')) {
                    target = target.previousElementSibling;
                    while (target && target.classList.contains('collapsed')) target = target.previousElementSibling;
                    if (!target) return;
                    isBefore = true;
                }

                animatePlaceholderMove(target, isBefore);
            } else {
                // Section reordering: Prevent dropping below "Add section" row
                if (target.classList.contains('add-section-row')) {
                    // Do nothing - the placeholder shouldn't move to/below the stationary delete target
                } else {
                    const rect = target.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    let isBefore = e.clientY < midpoint;

                    // Shop Mode anchor: Cannot drop before Uncategorized
                    if (currentMode !== 'home' && target.dataset.id === shopDefId && isBefore) {
                        isBefore = false; // Force snap AFTER
                    }

                    animatePlaceholderMove(target, isBefore);
                }
            }
        });
    });

    groceryList.addEventListener('drop', (e) => {
        e.preventDefault();
        if (!draggedElement) return;

        const isHome = currentMode === 'home';
        const currentList = getCurrentList();

        if (dragType === 'section') {
            const sectionsKey = isHome ? 'homeSections' : 'shopSections';
            const sections = currentList[sectionsKey];
            const movedId = draggedElement.dataset.id;

            // Find new index based on placeholder position
            const children = Array.from(groceryList.children).filter(el => (el.classList.contains('section-container') && el !== draggedElement) || el === placeholder);
            let newIdx = children.indexOf(placeholder);
            const oldIdx = sections.findIndex(s => s.id === movedId);

            if (oldIdx !== -1 && newIdx !== -1) {
                const [moved] = sections.splice(oldIdx, 1);

                // Ensure Uncategorized stays at top in Shop Mode
                if (!isHome) {
                    newIdx = Math.max(1, newIdx);
                }

                sections.splice(newIdx, 0, moved);
            }
        } else {
            // Item reordering
            const movedId = draggedElement.dataset.id;
            
            const elements = Array.from(groceryList.children).filter(el => 
                (el.classList.contains('grocery-item') && el !== draggedElement) || 
                el === placeholder || 
                el.classList.contains('section-header')
            );
            
            const placeholderIdx = elements.indexOf(placeholder);
            
            // Find the current section by looking backwards at headers
            let targetSectionId = null;
            for (let i = placeholderIdx; i >= 0; i--) {
                if (elements[i].classList.contains('section-header')) {
                    targetSectionId = elements[i].dataset.originalSectionId;
                    break;
                }
            }

            if (targetSectionId) {
                // Find anchor: the item immediately following the placeholder in the same section
                let anchorId = null;
                let isAtEnd = true;
                
                for (let i = placeholderIdx + 1; i < elements.length; i++) {
                    const el = elements[i];
                    if (el.classList.contains('section-header')) break; // End of section
                    if (el.classList.contains('grocery-item') && !el.classList.contains('add-item-row') && !el.classList.contains('add-section-row')) {
                        anchorId = el.dataset.id;
                        isAtEnd = false;
                        break;
                    }
                }

                updateOrderInState(movedId, anchorId, targetSectionId, isAtEnd);
            }
        }

        handleDragEnd(true);
    });

    function createDragVisual(point, element, type, initialRect) {
        if (touchGhost) touchGhost.remove();

        const rect = initialRect || element.getBoundingClientRect();
        dragOffset = {
            x: point.clientX - rect.left,
            y: point.clientY - rect.top
        };

        touchGhost = element.cloneNode(true);
        touchGhost.classList.add('touch-ghost');
        touchGhost.classList.remove('dragging', 'collapsed');

        // Add current mode class to the ghost so mode-specific styles apply
        touchGhost.classList.add(currentMode === 'home' ? 'home-mode' : 'shop-mode');

        // Lock width and height
        touchGhost.style.width = element.offsetWidth + 'px';
        touchGhost.style.height = (type === 'section' ? 50 : element.offsetHeight) + 'px';

        // Lock horizontal position based on the original element's rect
        touchGhost.style.left = rect.left + 'px';
        touchGhost.style.top = (point.clientY - dragOffset.y) + 'px';

        document.body.appendChild(touchGhost);
    }

    function handleTouchStart(e, element, type) {
        const initialRect = element.getBoundingClientRect();
        createDragVisual(e.touches[0], element, type, initialRect);
        handleDragStart(e, element, type, initialRect);
    }

    groceryList.addEventListener('touchmove', (e) => {
        if (!draggedElement || !isDragStarted) return;
        const touch = e.touches[0];

        if (touchGhost) {
            touchGhost.style.top = (touch.clientY - dragOffset.y) + 'px';
        }

        updateAutoScroll(touch.clientY);

        // Prevent scrolling during drag
        if (e.cancelable) e.preventDefault();

        if (dragUpdateFrame) return;
        dragUpdateFrame = requestAnimationFrame(() => {
            dragUpdateFrame = null;
            if (!draggedElement) return;

            // Disable pointer events so we can detect target behind it
            const originalPointerEvents = draggedElement.style.pointerEvents;
            draggedElement.style.pointerEvents = 'none';
            if (touchGhost) touchGhost.style.pointerEvents = 'none';

            let target = document.elementFromPoint(touch.clientX, touch.clientY);

            draggedElement.style.pointerEvents = originalPointerEvents;
            if (touchGhost) touchGhost.style.pointerEvents = '';

            let targetSelector = dragType === 'section' ? '.section-container, .add-section-row' : '.grocery-item, .section-header, .add-item-row, .add-section-row';
            if (target) target = target.closest(targetSelector);

            if (!target || target === draggedElement || target.classList.contains('drag-placeholder')) return;

            if (dragType === 'item') {
                const rect = target.getBoundingClientRect();
                const midpoint = rect.top + rect.height / 2;
                let isBefore = touch.clientY < midpoint;

                if (target.classList.contains('add-item-row')) isBefore = true;
                if (target.classList.contains('section-header')) isBefore = false;

                if (target.classList.contains('add-section-row')) {
                    target = target.previousElementSibling;
                    while (target && target.classList.contains('collapsed')) target = target.previousElementSibling;
                    if (!target) return;
                    isBefore = true;
                }

                animatePlaceholderMove(target, isBefore);
            } else {
                // Section reordering: Prevent dropping below "Add section" row
                if (target.classList.contains('add-section-row')) {
                    // Do nothing - the placeholder shouldn't move to/below the stationary delete target
                } else {
                    const rect = target.getBoundingClientRect();
                    const midpoint = rect.top + rect.height / 2;
                    let isBefore = touch.clientY < midpoint;

                    // Shop Mode anchor: Cannot drop before Uncategorized
                    if (currentMode !== 'home' && target.dataset.id === shopDefId && isBefore) {
                        isBefore = false; // Force snap AFTER
                    }

                    animatePlaceholderMove(target, isBefore);
                }
            }
        });
    }, { passive: false });

    groceryList.addEventListener('touchend', (e) => {
        if (!draggedElement) return;

        // Reuse drop logic
        const dropEvent = new Event('drop');
        groceryList.dispatchEvent(dropEvent);
    });

    function handleDragEnd(wasDropped = false) {
        const el = draggedElement;
        const type = dragType;
        const ghost = touchGhost;

        if (!el) return;

        // Null out globals immediately to prevent re-entry
        draggedElement = null;
        dragType = null;

        const finalize = () => {
            if (wasDropped === true) {
                saveAppState();
            }

            // Capture headers one last time before clearing padding/DRAG state
            let headerFinalDragTops = new Map();
            if (type === 'section') {
                document.querySelectorAll('.section-header').forEach(h => {
                    const title = h.querySelector('.section-title')?.textContent;
                    if (title) headerFinalDragTops.set(title, h.getBoundingClientRect().top);
                });
                isSectionRestoration = true;
            }

            groceryList.style.paddingTop = '';
            groceryList.style.paddingBottom = '';

            const collapsed = document.querySelectorAll('.collapsed');
            collapsed.forEach(element => element.classList.remove('collapsed'));

            renderList();
            isSectionRestoration = false; // Reset

            // Handoff: Wait one frame for the new list to be painted before removing the ghost
            requestAnimationFrame(() => {
                el.classList.remove('dragging', 'collapsed');
                el.style.opacity = '';
                el.style.height = '';
                el.style.margin = '';
                el.style.padding = '';
                el.style.overflow = '';
                el.style.pointerEvents = '';

                if (ghost) {
                    ghost.remove();
                    if (touchGhost === ghost) touchGhost = null;
                }
                isDragStarted = false;

                if (dragUpdateFrame) {
                    cancelAnimationFrame(dragUpdateFrame);
                    dragUpdateFrame = null;
                }

                lastDragPos = { x: 0, y: 0 };
                stopAutoScroll();
                placeholder.remove();
            });

            if (type === 'section' && headerFinalDragTops.size > 0) {
                const postHeaders = Array.from(document.querySelectorAll('.section-header'));
                postHeaders.forEach(h => {
                    const title = h.querySelector('.section-title')?.textContent;
                    const oldTop = headerFinalDragTops.get(title);
                    if (oldTop !== undefined) {
                        const newTop = h.getBoundingClientRect().top;
                        const delta = oldTop - newTop;
                        if (delta !== 0) {
                            h.animate([
                                { transform: `translateY(${delta}px)` },
                                { transform: 'translateY(0)' }
                            ], {
                                duration: 400,
                                easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)'
                            });
                        }
                    }
                });

                // Staggered fade-in for items
                const restoringItems = Array.from(document.querySelectorAll('.restoring-item'));
                restoringItems.forEach((item, idx) => {
                    item.style.opacity = '0';
                    item.style.transform = 'translateY(10px)';
                    setTimeout(() => {
                        item.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
                        item.style.opacity = '1';
                        item.style.transform = 'translateY(0)';
                    }, idx * 15);
                });
            }

            // Small delay to let browser process the new DOM before re-enabling transitions
            requestAnimationFrame(() => {
                groceryList.classList.remove('no-transition');
                document.body.style.overflow = '';
            });
        };

        if (ghost && placeholder.parentElement) {
            const phRect = placeholder.getBoundingClientRect();
            // Slide ghost to placeholder position
            const anim = ghost.animate([
                { top: ghost.style.top, left: ghost.style.left },
                { top: phRect.top + 'px', left: phRect.left + 'px' }
            ], {
                duration: 250,
                easing: 'cubic-bezier(0.2, 1, 0.3, 1)',
                fill: 'forwards'
            });
            anim.onfinish = finalize;
        } else {
            finalize();
        }
    }

    groceryList.addEventListener('dragend', handleDragEnd);

    function updateOrderInState(movedId, anchorId, targetSectionId, isAtEnd) {
        const currentList = getCurrentList();
        const isHome = currentMode === 'home';
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const indexKey = isHome ? 'homeIndex' : 'shopIndex';

        const movedItem = currentList.items.find(i => i.id === movedId);
        if (!movedItem) return;

        const oldSectionId = movedItem[sectionIdKey];

        if (isAtEnd) {
            movedItem[sectionIdKey] = targetSectionId;
            let sectionItems = currentList.items.filter(i => i[sectionIdKey] === targetSectionId && i.id !== movedId);
            sectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));
            sectionItems.push(movedItem);
            sectionItems.forEach((item, idx) => { item[indexKey] = idx; });

            if (oldSectionId !== targetSectionId) {
                let oldSectionItems = currentList.items.filter(i => i[sectionIdKey] === oldSectionId);
                oldSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));
                oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
            }
            return;
        }

        const anchorItem = currentList.items.find(i => i.id === anchorId);
        if (!anchorItem) return;

        const newSectionId = anchorItem[sectionIdKey];
        movedItem[sectionIdKey] = newSectionId;

        let oldSectionItems = currentList.items.filter(i => i[sectionIdKey] === oldSectionId);
        oldSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));

        if (oldSectionId === newSectionId) {
            const oldIdx = oldSectionItems.findIndex(i => i.id === movedId);
            let newIdx = oldSectionItems.findIndex(i => i.id === anchorId);

            if (oldIdx !== -1 && newIdx !== -1) {
                const [moved] = oldSectionItems.splice(oldIdx, 1);
                const finalNewIdx = oldSectionItems.findIndex(i => i.id === anchorId);
                // Safety check: if anchor lost, append to end
                if (finalNewIdx === -1) {
                    oldSectionItems.push(moved);
                } else {
                    oldSectionItems.splice(finalNewIdx, 0, moved);
                }
                oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
            }
        } else {
            // Moving ACROSS sections
            oldSectionItems = oldSectionItems.filter(i => i.id !== movedId);
            oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });

            let newSectionItems = currentList.items.filter(i => i[sectionIdKey] === newSectionId && i.id !== movedId);
            newSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));

            let insertIdx = newSectionItems.findIndex(i => i.id === anchorId);
            if (insertIdx !== -1) {
                newSectionItems.splice(insertIdx, 0, movedItem);
            } else {
                newSectionItems.push(movedItem);
            }
            newSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
        }
    }

    init();
});
