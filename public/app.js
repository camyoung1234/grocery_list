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
    let pendingDeletions = new Map(); // Tracks timeout IDs for items in "Undo" state
    const shopDefId = 'sec-s-def'; // Default Uncategorized ID for Shop Mode

    // --- DOM Elements ---
    const groceryList = document.getElementById('grocery-list');
    const appContainer = document.querySelector('.app-container');
    const listsMenu = document.getElementById('lists-menu');

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

        if (toolbarModeBtn) {
            toolbarModeBtn.classList.add('mode-switching');
        }

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
                if (toolbarModeBtn) {
                    toolbarModeBtn.classList.remove('mode-switching');
                }
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
            const rows = Array.from(document.querySelectorAll('.grocery-item, .section-header'));
            let topRow = null;
            let topOffset = 0;

            for (const row of rows) {
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
                await navigator.clipboard.writeText(window.location.href);
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

        element.addEventListener('click', (e) => {
            const currentTime = Date.now();
            const timeDiff = currentTime - lastTapTime;

            if (timeDiff < 400 && timeDiff > 0) {
                e.preventDefault();
                callback(e);
                lastTapTime = 0; // reset
            } else {
                lastTapTime = currentTime;
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
                item.text = newName.trim();
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

        const newItem = {
            id: Date.now().toString(),
            text: text,
            homeSectionId: isHome ? targetSectionId : currentList.homeSections[0].id,
            shopSectionId: !isHome ? targetSectionId : 'sec-s-def',
            homeIndex: currentList.items.length,
            shopIndex: currentList.items.length,
            haveCount: 0,
            wantCount: 1,
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

    let animatingItems = new Map(); // id -> 'completing' | 'undoing'
    async function toggleShopCompleted(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        const sameNameItems = currentList.items.filter(i => i.text === item.text);
        if (sameNameItems.some(i => animatingItems.has(i.id))) return;

        const newState = !item.shopCompleted;

        try {
            sameNameItems.forEach(i => animatingItems.set(i.id, newState ? 'completing' : 'undoing'));

            sameNameItems.forEach(i => {
                const el = document.querySelector(`.grocery-item[data-id="${i.id}"]`);
                if (el) {
                    if (newState) {
                        el.classList.add('is-completing');
                    } else {
                        el.classList.remove('completed');
                        el.classList.add('is-undoing');
                    }
                }
            });

            if (newState) {
                // Completion sequence
                // Wait for strike-through + circle fill (0.4s + 0.3s)
                await new Promise(r => setTimeout(r, 700));

                // Trigger sparks
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

                // Wait for sparks to be visible
                await new Promise(r => setTimeout(r, 100));

                sameNameItems.forEach(i => {
                    i.shopCompleted = true;
                    i.shopCheckOrder = Date.now();
                });
            } else {
                // Undo sequence
                await new Promise(r => setTimeout(r, 300));

                sameNameItems.forEach(i => {
                    i.shopCompleted = false;
                    i.shopCheckOrder = null;
                });
            }
        } finally {
            sameNameItems.forEach(i => animatingItems.delete(i.id));
        }

        saveAppState();
        renderList();
    }

    function deleteItem(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        // Mark as pending delete
        item.pendingDelete = true;

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

    function adjustHave(id, delta) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (item) {
            item.haveCount = Math.max(0, item.haveCount + delta);
            saveAppState();
            renderList();
        }
    }

    function adjustWant(id, delta) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (item) {
            item.wantCount = Math.max(0, item.wantCount + delta);
            saveAppState();
            renderList();
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
            const icon = toolbarModeBtn.querySelector('i');

            if (currentMode === 'shop') {
                if (icon) icon.className = 'fas fa-shopping-cart';
                toolbarModeBtn.title = 'Switch to Home Mode';
            } else {
                if (icon) icon.className = 'fas fa-home';
                toolbarModeBtn.title = 'Switch to Store Mode';
            }
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
        }
    }

    function saveAppState() {
        // Clone appState for saving, filtering out items that are currently pending deletion
        const stateToSave = JSON.parse(JSON.stringify(appState));
        stateToSave.lists.forEach(list => {
            list.items = list.items.filter(item => !item.pendingDelete);
        });
        localStorage.setItem('grocery-app-state', JSON.stringify(stateToSave));
        syncToHash();
    }

    function saveMode() {
        localStorage.setItem('grocery-mode', currentMode);
        localStorage.setItem('grocery-edit-mode', JSON.stringify(editMode));
        syncToHash();
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

    function renderList() {
        groceryList.innerHTML = '';
        const currentList = getCurrentList();
        if (!currentList) return;

        const isHome = currentMode === 'home';
        const sectionsKey = isHome ? 'homeSections' : 'shopSections';
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const indexKey = isHome ? 'homeIndex' : 'shopIndex';

        const sections = currentList[sectionsKey] || [];

        // Toggle global reorder/selection classes
        if (!isHome && shopSelectionMode) {
            groceryList.classList.add('shop-selection-mode');
            appContainer.classList.add('hide-drag-handles');
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
                group.wantCount += item.wantCount;
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

            const titleSpan = document.createElement('h3');
            titleSpan.className = 'section-title';
            titleSpan.textContent = section.name;

            // Double tap to rename section (disabled for Uncategorized in Shop Mode ONLY)
            const canRename = isHome || section.id !== shopDefId;

            if (canRename) {
                const handle = createDragHandle();
                handle.classList.add('section-drag-handle');
                handle.addEventListener('dragstart', (e) => handleDragStart(e, sectionLi, 'section'));
                handle.addEventListener('touchstart', (e) => handleTouchStart(e, sectionLi, 'section'), { passive: false });
                header.appendChild(handle);

                onDoubleTap(titleSpan, (e) => {
                    e.stopPropagation();

                    const input = document.createElement('input');
                    input.type = 'text';
                    input.value = section.name;
                    input.className = 'inline-section-input';

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

                    header.replaceChild(input, titleSpan);
                    input.focus();
                    input.setSelectionRange(0, input.value.length);
                });
                header.appendChild(titleSpan);
            } else {
                // Disabled drag handle for consistent alignment
                const handle = createDragHandle();
                handle.classList.add('section-drag-handle', 'disabled');
                handle.draggable = false;
                header.appendChild(handle);
                header.appendChild(titleSpan);
            }



            if (shopSelectionMode && !isHome) {
                // Reorder Controls or Merge Button
                const reorderControls = document.createElement('div');
                reorderControls.className = 'section-reorder-controls';

                // If we are in shop selection mode, show a "merge here" button instead of reorder arrows
                const moveHereBtn = document.createElement('button');
                moveHereBtn.className = 'move-here-btn';
                moveHereBtn.innerHTML = '<i class="fas fa-level-down-alt"></i>';
                moveHereBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (selectedShopItems.size > 0) {
                        currentList.items.forEach(item => {
                            if (selectedShopItems.has(item.id)) {
                                item.shopSectionId = section.id;
                            }
                        });
                        saveAppState();
                        shopSelectionMode = false;
                        selectedShopItems.clear();
                        renderList();
                    }
                });
                reorderControls.appendChild(moveHereBtn);
                header.appendChild(reorderControls);
            }

            sectionLi.appendChild(header);

            // Nested UL for items
            const itemsUl = document.createElement('ul');
            itemsUl.className = 'section-items-list';
            itemsUl.dataset.sectionId = section.id;
            itemsUl.dataset.type = 'item-placeholder'; // Allow empty UL to receive drops



            // items for this section are already fetched in sectionItems variable
            // and shop mode filtering logic will be handled differently or is already done

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
                    li.dataset.id = item.id;
                    li.dataset.type = 'item';
                    li.dataset.sectionId = section.id;

                    // Standard item text layout
                    const info = document.createElement('div');
                    info.className = 'item-info';
                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'item-text';
                    nameSpan.textContent = item.text;
                    // Note: No onDoubleTap here

                    const undoBtn = document.createElement('button');
                    undoBtn.className = 'undo-btn-inline';
                    undoBtn.textContent = 'Undo';
                    undoBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        undoDeleteItem(item.id);
                    });

                    if (isHome) {
                        info.appendChild(nameSpan);
                    } else {
                        // Shop Mode
                        info.appendChild(nameSpan);
                    }
                    li.appendChild(info); // Always use info wrapper for flex: 1
                    li.appendChild(undoBtn); // Put in place of counter/qty circle

                    itemsUl.appendChild(li);
                    return;
                }

                if (!isHome) {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);
                    const isZeroQty = toBuy <= 0 && !item.shopCompleted && !item.pendingDelete;
                    li.classList.toggle('zero-qty-item', isZeroQty);
                }


                li.innerHTML = '';

                if (isHome) {
                    const handle = createDragHandle();
                    handle.addEventListener('dragstart', (e) => handleDragStart(e, li, 'item'));
                    handle.addEventListener('touchstart', (e) => handleTouchStart(e, li, 'item'), { passive: false });
                    li.appendChild(handle);

                    const info = document.createElement('div');
                    info.className = 'item-info';

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'item-text';
                    nameSpan.textContent = item.text;

                    onDoubleTap(nameSpan, (e) => {
                        e.stopPropagation();

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

                        const syncMirror = () => {
                            mirror.textContent = input.value || ' ';
                        };
                        input.addEventListener('input', syncMirror);
                        syncMirror(); // Initial sync

                        const saveName = () => {
                            const newName = input.value.trim();
                            if (newName && newName !== item.text) {
                                item.text = newName;
                                saveAppState();
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
                        input.setSelectionRange(0, input.value.length);
                    });

                    info.appendChild(nameSpan);

                    li.appendChild(info);

                    const controls = document.createElement('div');
                    controls.className = 'quantity-controls';

                    controls.appendChild(createCombinedQtyControl(item));

                    li.appendChild(controls);
                } else {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);

                    const info = document.createElement('div');
                    info.className = 'item-info';

                    const textSpan = document.createElement('span');
                    textSpan.className = 'item-text';
                    textSpan.textContent = item.text;

                    info.appendChild(textSpan);

                    const qtyCircle = document.createElement('div');
                    qtyCircle.className = 'shop-qty-circle';

                    const qtyNumber = document.createElement('span');
                    qtyNumber.className = 'qty-number';
                    qtyNumber.textContent = toBuy;

                    const checkIcon = document.createElement('i');
                    checkIcon.className = 'fas fa-check check-icon';

                    qtyCircle.appendChild(qtyNumber);
                    qtyCircle.appendChild(checkIcon);

                    const handle = createDragHandle();
                    handle.addEventListener('dragstart', (e) => handleDragStart(e, li, 'item'));
                    handle.addEventListener('touchstart', (e) => handleTouchStart(e, li, 'item'), { passive: false });
                    li.appendChild(handle);

                    li.appendChild(info);
                    li.appendChild(qtyCircle);

                    // Full-chip click toggle for Shop Mode
                    li.addEventListener('click', (e) => {
                        if (shopSelectionMode || editMode) {
                            // Selection Mode
                            if (selectedShopItems.has(item.id)) {
                                selectedShopItems.delete(item.id);
                                // Auto-exit if empty
                                if (selectedShopItems.size === 0) {
                                    shopSelectionMode = false;
                                }
                            } else {
                                shopSelectionMode = true;
                                selectedShopItems.add(item.id);
                            }
                            renderList();
                        } else {
                            // Regular Shop Mode: toggle completion
                            toggleShopCompleted(item.id);
                        }
                    });
                }

                // Delete button removed since double tap covers deletion

                itemsUl.appendChild(li);
            });


            // Add "Add item" row for this section
            {
                const addRow = document.createElement('li');
                addRow.className = 'grocery-item add-item-row';
                if (isSectionRestoration) addRow.classList.add('restoring-item');
                addRow.dataset.type = 'item-placeholder';
                addRow.dataset.sectionId = section.id;

                const plusIcon = document.createElement('div');
                plusIcon.className = 'drag-handle add-row-plus';
                plusIcon.innerHTML = '<i class="fas fa-plus"></i>';
                addRow.appendChild(plusIcon);

                const info = document.createElement('div');
                info.className = 'item-info';

                const inputContainer = document.createElement('form');
                inputContainer.className = 'input-group inline-input-group';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'inline-item-input add-item-input';
                input.placeholder = 'Add item';

                plusIcon.addEventListener('click', () => input.focus());

                const doAdd = (e) => {
                    e.preventDefault();
                    addItemToSection(section.id, input.value, isHome);
                };
                inputContainer.addEventListener('submit', doAdd);
                inputContainer.appendChild(input);
                info.appendChild(inputContainer);
                addRow.appendChild(info);

                // Allow dropping ONTO the add row so we can drop files into an empty section

                itemsUl.appendChild(addRow);
            }
            sectionLi.appendChild(itemsUl);

            groceryList.appendChild(sectionLi);
        });


        // Add "Add a section..." element at the bottom
        const addSecRow = document.createElement('li');
        addSecRow.className = 'grocery-item add-section-row';

        const addSecPlusIcon = document.createElement('div');
        addSecPlusIcon.className = 'drag-handle add-row-plus';
        addSecPlusIcon.innerHTML = '<i class="fas fa-plus"></i>';
        addSecRow.appendChild(addSecPlusIcon);

        const addSecInfo = document.createElement('div');
        addSecInfo.className = 'item-info';

        const addSecContainer = document.createElement('form');
        addSecContainer.className = 'input-group inline-input-group';

        const addSecInput = document.createElement('input');
        addSecInput.type = 'text';
        addSecInput.placeholder = 'Add section';
        addSecInput.className = 'inline-item-input add-section-input';

        addSecPlusIcon.addEventListener('click', () => addSecInput.focus());

        const doAddSec = (e) => {
            if (e) e.preventDefault();
            const val = addSecInput.value.trim();
            if (val) {
                addSection(val, isHome);
                addSecInput.value = '';
            }
        };

        addSecContainer.addEventListener('submit', doAddSec);

        addSecContainer.appendChild(addSecInput);
        addSecInfo.appendChild(addSecContainer);
        addSecRow.appendChild(addSecInfo);
        groceryList.appendChild(addSecRow);
    }

    function createQtyPart(group, value, type) {
        const part = document.createElement('div');
        part.className = `qty-part ${type}-part`;

        const btnMinus = document.createElement('button');
        btnMinus.className = 'qty-btn minus';
        const minusIcon = document.createElement('i');
        minusIcon.className = 'fas fa-minus icon-default';
        const trashIcon = document.createElement('i');
        trashIcon.className = 'fas fa-trash icon-delete';
        btnMinus.appendChild(minusIcon);
        btnMinus.appendChild(trashIcon);

        const valSpan = document.createElement('span');
        valSpan.className = 'qty-val';
        valSpan.textContent = value;

        const btnPlus = document.createElement('button');
        btnPlus.className = 'qty-btn plus';
        btnPlus.innerHTML = '<i class="fas fa-plus"></i>';

        part.appendChild(btnMinus);
        part.appendChild(valSpan);
        part.appendChild(btnPlus);

        part.addEventListener('click', (e) => {
            e.stopPropagation();

            document.querySelectorAll('.qty-part.expanded').forEach(p => {
                if (p !== part) {
                    p.classList.remove('expanded');
                    // Also remove active from the other pill if it's not our own parent
                    const otherGroup = p.closest('.qty-combined-pill');
                    if (otherGroup && otherGroup !== group) {
                        otherGroup.classList.remove('active');
                    }
                }
            });
            part.classList.add('expanded');
            group.classList.add('active'); // For overall styling if needed
        });

        return { part, valSpan, btnMinus, btnPlus };
    }

    function createCombinedQtyControl(item) {
        const group = document.createElement('div');
        group.className = 'qty-combined-pill';

        const have = createQtyPart(group, item.haveCount, 'have');
        const want = createQtyPart(group, item.wantCount, 'want');

        const separator = document.createElement('span');
        separator.className = 'qty-divider';
        separator.textContent = '/';

        group.appendChild(have.part);
        group.appendChild(separator);
        group.appendChild(want.part);

        const updateUI = (isInit = false) => {
            const oldHave = have.valSpan.textContent;
            const oldWant = want.valSpan.textContent;

            have.valSpan.textContent = item.haveCount;
            want.valSpan.textContent = item.wantCount;

            if (!isInit) {
                if (oldHave !== String(item.haveCount)) {
                    have.valSpan.classList.remove('pop-animate');
                    void have.valSpan.offsetWidth; // Trigger reflow
                    have.valSpan.classList.add('pop-animate');
                }
                if (oldWant !== String(item.wantCount)) {
                    want.valSpan.classList.remove('pop-animate');
                    void want.valSpan.offsetWidth; // Trigger reflow
                    want.valSpan.classList.add('pop-animate');
                }
            }

            if (item.wantCount === 0) {
                want.part.classList.add('delete-mode');
            } else {
                want.part.classList.remove('delete-mode');
            }

            saveAppState();
        };

        // Initialize UI state
        updateUI(true);

        have.btnMinus.addEventListener('click', (e) => { e.stopPropagation(); item.haveCount = Math.max(0, item.haveCount - 1); updateUI(); });
        have.btnPlus.addEventListener('click', (e) => { e.stopPropagation(); item.haveCount++; updateUI(); });

        want.btnMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.wantCount === 0) {
                deleteItem(item.id);
            } else {
                item.wantCount = Math.max(0, item.wantCount - 1);
                updateUI();
            }
        });
        want.btnPlus.addEventListener('click', (e) => { e.stopPropagation(); item.wantCount++; updateUI(); });

        return group;
    }



    // Close menus on outside click
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.qty-part.expanded').forEach(part => {
            if (!part.contains(e.target)) {
                part.classList.remove('expanded');
                part.closest('.qty-combined-pill')?.classList.remove('active');
            }
        });

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

        // Maintain scrolling ability so auto-scroll works


        // Use a small timeout to allow the browser to capture the drag image before we rearrange the DOM.
        setTimeout(() => {
            if (draggedElement !== element) return;
            
            isDragStarted = true;
            groceryList.classList.add('no-transition');

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

                // Change "Add section" to "Delete"
                const addSecRow = document.querySelector('.add-section-row');
                if (addSecRow) {
                    addSecRow.classList.add('delete-target');
                    const input = addSecRow.querySelector('.add-section-input');
                    if (input) {
                        input.placeholder = 'Delete';
                        input.disabled = true;
                    }
                    const plusIcon = addSecRow.querySelector('.add-row-plus');
                    if (plusIcon) {
                        plusIcon.innerHTML = '<i class="fas fa-trash"></i>';
                    }
                }
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
                                easing: 'cubic-bezier(0.2, 0, 0, 1)'
                            });
                        }
                    }
                });
            }
        }, 50);
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
                    duration: 150,
                    easing: 'cubic-bezier(0.2, 0, 0, 1)'
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

            // Handle delete target visual state
            document.querySelectorAll('.delete-target').forEach(el => el.classList.remove('drag-over'));
            if (target && target.classList.contains('delete-target')) {
                target.classList.add('drag-over');
            }

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
            const target = e.target.closest('.add-section-row.delete-target');
            if (target) {
                const movedId = draggedElement.dataset.id;
                const section = (isHome ? currentList.homeSections : currentList.shopSections).find(s => s.id === movedId);
                if (section) {
                    showSectionDeleteModal(section.id, section.name, isHome);
                }
                handleDragEnd();
                return;
            }

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

        saveAppState();
        handleDragEnd();
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
        handleDragStart(e, element, type, initialRect);
        createDragVisual(e.touches[0], element, type, initialRect);
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

            // Handle delete target visual state
            document.querySelectorAll('.delete-target').forEach(el => el.classList.remove('drag-over'));
            if (target && target.classList.contains('delete-target')) {
                target.classList.add('drag-over');
            }

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

        // Manually detect if dropped on delete target for touch since e.target won't work correctly with touch-ghost
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest('.add-section-row.delete-target');

        if (target && dragType === 'section') {
            const isHome = currentMode === 'home';
            const movedId = draggedElement.dataset.id;
            const currentList = getCurrentList();
            const section = (isHome ? currentList.homeSections : currentList.shopSections).find(s => s.id === movedId);
            if (section) {
                showSectionDeleteModal(section.id, section.name, isHome);
            }
            handleDragEnd();
            return;
        }

        if (touchGhost) {
            touchGhost.remove();
            touchGhost = null;
        }

        // Reuse drop logic
        const dropEvent = new Event('drop');
        groceryList.dispatchEvent(dropEvent);
    });

    function handleDragEnd() {
        if (draggedElement) {
            draggedElement.classList.remove('dragging', 'collapsed');
            draggedElement.style.opacity = '';
            draggedElement.style.height = '';
            draggedElement.style.margin = '';
            draggedElement.style.padding = '';
            draggedElement.style.overflow = '';
            draggedElement.style.pointerEvents = '';
        }

        if (touchGhost) {
            touchGhost.remove();
            touchGhost = null;
        }
        isDragStarted = false;

        if (dragUpdateFrame) {
            cancelAnimationFrame(dragUpdateFrame);
            dragUpdateFrame = null;
        }

        lastDragPos = { x: 0, y: 0 };
        stopAutoScroll();
        placeholder.remove();

        // Capture headers one last time before clearing padding/DRAG state
        let headerFinalDragTops = new Map();
        if (dragType === 'section') {
            document.querySelectorAll('.section-header').forEach(h => {
                const title = h.querySelector('.section-title')?.textContent;
                if (title) headerFinalDragTops.set(title, h.getBoundingClientRect().top);
            });
            isSectionRestoration = true;
        }

        groceryList.style.paddingTop = '';
        groceryList.style.paddingBottom = '';
        
        const collapsed = document.querySelectorAll('.collapsed');
        collapsed.forEach(el => el.classList.remove('collapsed'));

        const savedDragType = dragType;
        draggedElement = null;
        dragType = null;
        
        // Ensure "Add section" row is fully restored if it was transformed
        const addSecRow = document.querySelector('.add-section-row');
        if (addSecRow) {
            addSecRow.classList.remove('delete-target', 'drag-over');
            const input = addSecRow.querySelector('.add-section-input');
            if (input) {
                input.placeholder = '+ Add section';
                input.disabled = false;
            }
            const plusIcon = addSecRow.querySelector('.add-row-plus');
            if (plusIcon) {
                plusIcon.innerHTML = '<i class="fas fa-plus"></i>';
            }
        }

        renderList();
        isSectionRestoration = false; // Reset

        if (savedDragType === 'section' && headerFinalDragTops.size > 0) {
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
                            easing: 'cubic-bezier(0.2, 0, 0, 1)'
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
