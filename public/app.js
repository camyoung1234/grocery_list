document.addEventListener('DOMContentLoaded', async () => {
    // --- State ---
    let appState = {
        lists: [],
        currentListId: null
    };

    let currentMode = 'home'; // 'home' or 'shop'
    let activeTabReorderId = null; // Tracks the ID of the list tab currently showing reorder arrows
    let draggedElement = null;
    let dragType = null; // 'item' or 'section'
    let touchGhost = null;
    let placeholder = document.createElement('li');
    placeholder.className = 'drag-placeholder';
    let dragOffset = { x: 0, y: 0 };
    let lastDragPos = { x: 0, y: 0 };
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

    // Mode Bar Elements
    const modeHomeBtn = document.getElementById('mode-home');
    const modeShopBtn = document.getElementById('mode-shop');

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

    // --- Mode Bar Switching ---
    if (modeHomeBtn) {
        modeHomeBtn.addEventListener('click', () => switchMode('home', true));
    }
    if (modeShopBtn) {
        modeShopBtn.addEventListener('click', () => switchMode('shop', true));
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
                    renderTabs();
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
        renderTabs();
        updateModeUI(); // Update theme color
        renderList();
    }

    function switchList(id) {
        if (appState.currentListId === id) return; // Fix double tap bug by preventing instantly unmounting the target 

        appState.currentListId = id;
        saveAppState();
        renderTabs();
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
                renderTabs();
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
            renderTabs();
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

    function toggleShopCompleted(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (item) {
            // Find all items with the same name to toggle them together (Grouping requirement)
            const sameNameItems = currentList.items.filter(i => i.text === item.text);
            const newState = !item.shopCompleted;
            
            sameNameItems.forEach(i => {
                i.shopCompleted = newState;
                i.shopCheckOrder = newState ? Date.now() : null;
            });
            
            saveAppState();
            renderList();
        }
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

        // Update mode indicator icon
        if (modeIndicator) {
            const icon = modeIndicator.querySelector('i');
            if (currentMode === 'shop') {
                icon.className = 'fas fa-shopping-cart';
                modeIndicator.title = 'Shop Mode';
            } else {
                icon.className = 'fas fa-home';
                modeIndicator.title = 'Home Mode';
            }
        }

        // Update Mode Bar active state
        if (modeHomeBtn && modeShopBtn) {
            modeHomeBtn.classList.toggle('active', currentMode === 'home');
            modeShopBtn.classList.toggle('active', currentMode === 'shop');
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
        syncToHash();
    }

    function renderTabs() {
        tabsList.innerHTML = '';

        appState.lists.forEach((list, index) => {
            const tab = document.createElement('div');
            tab.className = `tab-item ${list.id === appState.currentListId ? 'active' : ''}`;
            if (deleteListMode) {
                tab.classList.add('delete-mode');
            }
            if (activeTabReorderId === list.id) {
                tab.classList.add('reorder-active');
            }
            tab.dataset.id = list.id;

            if (list.theme) {
                tab.style.setProperty('--list-color', list.theme);
            }

            const btnLeft = document.createElement('button');
            btnLeft.className = 'tab-reorder-btn tab-left';
            btnLeft.innerHTML = '<i class="fas fa-chevron-left"></i>';
            btnLeft.disabled = index === 0;

            const btnRight = document.createElement('button');
            btnRight.className = 'tab-reorder-btn tab-right';
            btnRight.innerHTML = '<i class="fas fa-chevron-right"></i>';
            btnRight.disabled = index === appState.lists.length - 1;

            btnLeft.addEventListener('click', (e) => {
                e.stopPropagation();
                swapTabsAndAnimate(tab, -1);
            });

            btnRight.addEventListener('click', (e) => {
                e.stopPropagation();
                swapTabsAndAnimate(tab, 1);
            });

            const nameSpan = document.createElement('span');
            nameSpan.className = 'tab-text';
            nameSpan.textContent = list.name;

            tab.appendChild(btnLeft);
            tab.appendChild(nameSpan);

            // Add trash icon for delete mode
            const trashIcon = document.createElement('span');
            trashIcon.className = 'tab-delete-icon';
            trashIcon.innerHTML = '<i class="fas fa-trash"></i>';
            tab.appendChild(trashIcon);

            tab.appendChild(btnRight);

            tab.addEventListener('click', (e) => {
                if (e.target.closest('.tab-reorder-btn')) return;

                // Delete mode: clicking a tab deletes it
                if (deleteListMode) {
                    deleteListWithConfirmation(list.id, list.name);
                    return;
                }

                if (activeTabReorderId === list.id) {
                    tab.classList.add('dismissing');
                    activeTabReorderId = null;
                    setTimeout(() => {
                        tab.classList.remove('reorder-active', 'dismissing');
                        renderTabs();
                    }, 320);
                    return;
                } else if (activeTabReorderId) {
                    activeTabReorderId = null;
                    renderTabs();
                    return;
                }
                switchList(list.id);
            });

            // Double tap to edit list name and theme via modal
            onDoubleTap(nameSpan, (e) => {
                e.stopPropagation();
                activeTabReorderId = null;
                tab.classList.remove('reorder-active');

                showModal('Edit List', list.name, true, list.theme, (newName, newTheme) => {
                    if (newName && (newName !== list.name || newTheme !== list.theme)) {
                        list.name = newName;
                        if (newTheme) list.theme = newTheme;
                        saveAppState();
                        renderTabs();
                        // If editing the current list, update theme color immediately
                        if (list.id === appState.currentListId) {
                            updateModeUI();
                        }
                    }
                });
            });

            onLongPress(tab, (e) => {
                const isActive = tab.classList.contains('reorder-active');
                if (isActive) {
                    // Dismiss
                    tab.classList.add('dismissing');
                    activeTabReorderId = null;
                    setTimeout(() => {
                        tab.classList.remove('reorder-active', 'dismissing');
                        renderTabs();
                    }, 320);
                } else {
                    // Close any other active tab reorder first (without animation for simplicity/speed)
                    document.querySelectorAll('.tab-item.reorder-active').forEach(n => n.classList.remove('reorder-active'));
                    tab.classList.add('reorder-active');
                    activeTabReorderId = list.id;
                }
            });

            // Remove context menu listener, using edit modal delete now.
            // tab.addEventListener('contextmenu', (e) => {
            //     e.preventDefault();
            //     deleteListWithConfirmation(list.id, list.name);
            // });

            tabsList.appendChild(tab);
        });

        // Add the "+" button at the end
        const addBtn = document.createElement('button');
        addBtn.id = 'add-tab-btn';
        addBtn.className = 'add-tab-btn' + (deleteListMode ? ' delete-active' : '');
        addBtn.innerHTML = deleteListMode ? '<i class="fas fa-times"></i>' : '<i class="fas fa-plus"></i>';
        addBtn.title = deleteListMode ? 'Exit Delete Mode' : 'Create New List';
        addBtn.addEventListener('click', () => {
            if (deleteListMode) {
                deleteListMode = false;
                renderTabs();
            } else {
                showModal('Create New List', 'New List', true, 'var(--theme-blue)', (name, theme) => {
                    if (name) addNewList(name, theme);
                });
            }
        });

        // Long-press on add button to enter delete mode
        onLongPress(addBtn, () => {
            deleteListMode = !deleteListMode;
            renderTabs();
        }, 300, { allowOnButtons: true });

        tabsList.appendChild(addBtn);
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
        } else {
            groceryList.classList.remove('shop-selection-mode');
        }

        const shopDefId = 'sec-s-def';

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

            const totalItemsInSection = sectionItems.length;

            if (!isHome && section.id === shopDefId) {
                // In shop mode, Uncategorized is only visible if at least one item is in the section
                if (totalItemsInSection === 0) {
                    return; // Skip rendering Uncategorized
                }
            }

            const sectionLi = document.createElement('li');
            sectionLi.className = 'section-container';
            sectionLi.dataset.id = section.id;
            sectionLi.dataset.type = 'section';

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
                // Spacer for consistent alignment
                const spacer = document.createElement('div');
                spacer.className = 'drag-handle section-drag-handle spacer';
                header.appendChild(spacer);
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


            sectionItems.forEach(item => {
                const li = document.createElement('li');
                li.className = `grocery-item ${isHome ? '' : 'shop-chip'} ${item.shopCompleted && !isHome ? 'completed' : ''}`;
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
                    // Hide if 0-qty, not completed, and NOT in the Uncategorized section.
                    if (toBuy <= 0 && !item.shopCompleted && section.id !== shopDefId) {
                        li.classList.add('shop-hidden');
                    }
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

                    // Check if selected
                    const isSelected = selectedShopItems.has(item.id);
                    if (isSelected) {
                        li.classList.add('selected');
                    }

                    const textSpan = document.createElement('span');
                    textSpan.className = 'item-text';
                    textSpan.textContent = item.text;

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

                    li.appendChild(textSpan);
                    li.appendChild(qtyCircle);

                    // Full-chip click toggle for Shop Mode
                    li.addEventListener('click', (e) => {
                        if (shopSelectionMode) {
                            // Toggle selection
                            if (selectedShopItems.has(item.id)) {
                                selectedShopItems.delete(item.id);
                                li.classList.remove('selected');
                                // Auto-exit if empty
                                if (selectedShopItems.size === 0) {
                                    shopSelectionMode = false;
                                    renderList(); // re-render to restore section arrows
                                }
                            } else {
                                selectedShopItems.add(item.id);
                                li.classList.add('selected');
                            }
                        } else {
                            // Normal behavior: toggle check off
                            toggleShopCompleted(item.id);
                            item.shopCheckOrder = item.shopCompleted ? Date.now() : null;
                            saveAppState();
                        }
                    });

                    onLongPress(li, (e) => {
                        // Enter selection mode
                        shopSelectionMode = true;
                        selectedShopItems.add(item.id);
                        renderList();
                    });
                }

                // Delete button removed since double tap covers deletion

                itemsUl.appendChild(li);
            });


            // Add "Add item" row for this section
            if (isHome) {
                const addRow = document.createElement('li');
                addRow.className = 'grocery-item add-item-row';
                addRow.dataset.type = 'item-placeholder';
                addRow.dataset.sectionId = section.id;

                const inputContainer = document.createElement('form');
                inputContainer.className = 'input-group inline-input-group';

                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'inline-item-input add-item-input';
                input.placeholder = '+ Add item';

                const doAdd = (e) => {
                    e.preventDefault();
                    addItemToSection(section.id, input.value, isHome);
                };
                inputContainer.addEventListener('submit', doAdd);
                inputContainer.appendChild(input);
                addRow.appendChild(inputContainer);

                // Allow dropping ONTO the add row so we can drop files into an empty section
                addRow.dataset.type = 'item-placeholder';
                addRow.dataset.sectionId = section.id;

                itemsUl.appendChild(addRow);
            }
            sectionLi.appendChild(itemsUl);

            groceryList.appendChild(sectionLi);
        });


        // Add "Add a section..." element at the bottom
        const addSecRow = document.createElement('li');
        addSecRow.className = 'grocery-item add-section-row';

        const addSecContainer = document.createElement('form');
        addSecContainer.className = 'input-group inline-input-group';

        const addSecInput = document.createElement('input');
        addSecInput.type = 'text';
        addSecInput.placeholder = '+ Add section';
        addSecInput.className = 'inline-item-input add-section-input';

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
        addSecRow.appendChild(addSecContainer);
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

    function swapTabsAndAnimate(tabNode, directionOffset) {
        const allTabs = Array.from(document.querySelectorAll('.tab-item'));
        const draggedIdx = allTabs.indexOf(tabNode);

        if (draggedIdx === -1) return;

        let targetIdx = draggedIdx + directionOffset;
        if (targetIdx < 0 || targetIdx >= allTabs.length) return;

        const targetNode = allTabs[targetIdx];
        const movedId = tabNode.dataset.id;
        const anchorId = targetNode.dataset.id;

        // Capture bounding boxes internally
        const preNodes = Array.from(document.querySelectorAll('.tab-item'));
        const firstPositions = {};
        preNodes.forEach(n => {
            firstPositions[n.dataset.id] = n.getBoundingClientRect().left;
        });

        const targetInitialLeft = firstPositions[movedId] || 0;

        // Reorder state
        const oldIdx = appState.lists.findIndex(l => l.id === movedId);
        const newIdx = appState.lists.findIndex(l => l.id === anchorId);
        if (oldIdx !== -1 && newIdx !== -1) {
            const [moved] = appState.lists.splice(oldIdx, 1);
            appState.lists.splice(newIdx, 0, moved);
            saveAppState();
        }

        renderTabs();

        const postNodes = Array.from(document.querySelectorAll('.tab-item'));

        // Adjust scroll position horizontally
        const targetNewNode = postNodes.find(n => n.dataset.id === movedId);
        if (targetNewNode) {
            const targetNewLeft = targetNewNode.getBoundingClientRect().left;
            const scrollDelta = targetNewLeft - targetInitialLeft;
            tabsList.scrollBy(scrollDelta, 0);
        }

        // Apply FLIP animation
        postNodes.forEach(n => {
            const id = n.dataset.id;
            if (firstPositions[id] !== undefined) {
                const newLeft = n.getBoundingClientRect().left;
                const deltaX = firstPositions[id] - newLeft;

                if (deltaX !== 0) {
                    if (id === movedId) {
                        n.style.position = 'relative';
                        n.style.zIndex = '20';
                    } else {
                        n.style.position = 'relative';
                        n.style.zIndex = '10';
                    }

                    n.style.transform = `translateX(${deltaX}px)`;
                    n.style.transition = 'none';

                    requestAnimationFrame(() => {
                        n.style.transform = '';
                        n.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                    });

                    setTimeout(() => {
                        n.style.position = '';
                        n.style.zIndex = '';
                        n.style.transition = '';
                    }, 400);
                }
            }
        });
    }


    // Close steppers on outside click
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.qty-part.expanded').forEach(part => {
            if (!part.contains(e.target)) {
                part.classList.remove('expanded');
                part.closest('.qty-combined-pill')?.classList.remove('active');
            }
        });


        document.querySelectorAll('.tab-item.reorder-active').forEach(node => {
            if (!node.contains(e.target) && !e.target.closest('.tab-reorder-btn')) {
                node.classList.add('dismissing');
                if (node.dataset.id === activeTabReorderId) activeTabReorderId = null;

                setTimeout(() => {
                    node.classList.remove('reorder-active', 'dismissing');
                    renderTabs();
                }, 320);
            }
        });
    });

    function handleDragStart(e, element, type) {
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

        // For mouse events, create the ghost immediately
        if (e.type === 'dragstart') {
            createDragVisual(e, element, type);
        }

        // Disable scrolling for mobile and desktop consistency
        document.body.style.overflow = 'hidden';

        // Use a small timeout to allow the browser to capture the drag image before we collapse elements.
        setTimeout(() => {
            if (draggedElement !== element) return;

            if (type === 'section') {
                document.querySelectorAll('.section-items-list, .add-item-row, .add-section-row').forEach(el => {
                    el.classList.add('collapsed');
                });
            } else {
                // When dragging an item, keep the "Add" rows visible as per user request
                // but we still want to collapse the dragged element itself if needed, 
                // though handleDragStart handles the 'element' separately.
            }

            // Initialize placeholder at starting position to prevent layout shift
            placeholder.style.height = element.offsetHeight + 'px';
            element.before(placeholder);

            element.classList.add('dragging');
            element.classList.add('collapsed');
            element.style.pointerEvents = 'none'; // Prevent interfering with target detection

        }, 50);
    }

    function animatePlaceholderMove(target, isBefore) {
        if (isBefore && target.previousElementSibling === placeholder) return;
        if (!isBefore && target.nextElementSibling === placeholder) return;

        // Collect all potential elements that could move
        const allElements = Array.from(groceryList.querySelectorAll('.section-container, .grocery-item, .add-item-row, .add-section-row'));
        if (!allElements.includes(placeholder)) allElements.push(placeholder);

        // Store initial positions
        const initialPositions = new Map();
        allElements.forEach(el => {
            if (!el.classList.contains('collapsed') && el !== draggedElement) {
                initialPositions.set(el, el.getBoundingClientRect().top);
            }
        });

        // Move the placeholder
        if (target.classList.contains('section-items-list')) {
            if (isBefore) {
                target.prepend(placeholder);
            } else {
                const addRow = target.querySelector('.add-item-row');
                if (addRow) {
                    addRow.before(placeholder);
                } else {
                    target.appendChild(placeholder);
                }
            }
        } else if (isBefore) {
            target.before(placeholder);
        } else {
            target.after(placeholder);
        }

        // Calculate deltas and apply relative FLIP
        const deltas = new Map();
        allElements.forEach(el => {
            if (initialPositions.has(el)) {
                const newTop = el.getBoundingClientRect().top;
                const oldTop = initialPositions.get(el);
                deltas.set(el, oldTop - newTop);
            }
        });

        deltas.forEach((delta, el) => {
            if (delta === 0) return;

            // Find displacement of nearest moving ancestor
            let parentDisplacement = 0;
            let p = el.parentElement;
            while (p && p !== groceryList) {
                if (deltas.has(p)) {
                    parentDisplacement = deltas.get(p);
                    break;
                }
                p = p.parentElement;
            }

            // The actual transform needs to subtract the parent's displacement
            // because the layout engine already moved the child with the parent.
            const relativeDelta = delta - parentDisplacement;

            if (relativeDelta !== 0) {
                el.animate([
                    { transform: `translateY(${relativeDelta}px)` },
                    { transform: 'translateY(0)' }
                ], {
                    duration: 200,
                    easing: 'ease-out'
                });
            }
        });
    }

    groceryList.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!draggedElement) return;

        // movement threshold to prevent jitter
        const dist = Math.sqrt(Math.pow(e.clientX - lastDragPos.x, 2) + Math.pow(e.clientY - lastDragPos.y, 2));
        if (dist < 5) return;
        lastDragPos = { x: e.clientX, y: e.clientY };

        if (touchGhost) {
            touchGhost.style.top = (e.clientY - dragOffset.y) + 'px';
        }

        let targetSelector = dragType === 'section' ? '.section-container, .add-section-row' : '.grocery-item, .section-items-list, .add-item-row';
        let target = e.target.closest(targetSelector);

        let redirectedFromAdd = false;
        // If dragging an item, redirect "Add item" row to its parent list
        if (dragType === 'item' && target && target.classList.contains('add-item-row')) {
            target = target.closest('.section-items-list');
            redirectedFromAdd = true;
        }
        // "Add section" row should still be ignored for items
        if (dragType === 'item' && target && target.classList.contains('add-section-row')) {
            target = null;
        }

        if (!target || target === draggedElement || target.classList.contains('drag-placeholder')) return;

        if (dragType === 'item' && target.classList.contains('section-items-list')) {
            const items = Array.from(target.querySelectorAll('.grocery-item:not(.add-item-row):not(.dragging)'));
            
            if (items.length > 0) {
                // If section has items, only snap if outside the item block
                const firstRect = items[0].getBoundingClientRect();
                const lastRect = items[items.length - 1].getBoundingClientRect();

                if (e.clientY < firstRect.top) {
                    animatePlaceholderMove(items[0], true);
                } else if (e.clientY > lastRect.bottom || redirectedFromAdd) {
                    animatePlaceholderMove(items[items.length - 1], false);
                }
                // Else: Ignore the background hit when hovering between existing items
                return;
            } else {
                // Empty section: snap to top
                animatePlaceholderMove(target, true);
                return;
            }
        }

        const rect = target.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        animatePlaceholderMove(target, e.clientY < midpoint);
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
                if (!isHome && newIdx === 0) {
                    newIdx = 1;
                }

                const adjustedIdx = newIdx > oldIdx ? newIdx - 1 : newIdx;
                sections.splice(adjustedIdx, 0, moved);
            }
        } else {
            // Item reordering
            const movedId = draggedElement.dataset.id;
            const targetSection = placeholder.closest('.section-container');
            if (targetSection) {
                const targetSectionId = targetSection.dataset.id;
                const itemsUl = targetSection.querySelector('.section-items-list');
                const children = Array.from(itemsUl.children).filter(el => (el.classList.contains('grocery-item') && el !== draggedElement) || el === placeholder);
                const placeholderIdx = children.indexOf(placeholder);

                let anchorId = null;
                let isAtEnd = false;

                // If placeholder is not at the very end (before add row)
                if (placeholderIdx < children.length - 1) {
                    const nextEl = children[placeholderIdx + 1];
                    if (nextEl.classList.contains('grocery-item') && !nextEl.classList.contains('add-item-row')) {
                        anchorId = nextEl.dataset.id;
                    } else {
                        isAtEnd = true;
                    }
                } else {
                    isAtEnd = true;
                }

                updateOrderInState(movedId, anchorId, targetSectionId, isAtEnd);
            }
        }

        saveAppState();

        // Small delay before ending drag to ensure all drops complete across browsers
        setTimeout(() => handleDragEnd(), 0);
    });

    function createDragVisual(point, element, type) {
        if (touchGhost) touchGhost.remove();

        const rect = element.getBoundingClientRect();
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
        handleDragStart(e, element, type);
        createDragVisual(e.touches[0], element, type);
    }

    groceryList.addEventListener('touchmove', (e) => {
        if (!draggedElement) return;
        const touch = e.touches[0];

        // movement threshold to prevent jitter
        const dist = Math.sqrt(Math.pow(touch.clientX - lastDragPos.x, 2) + Math.pow(touch.clientY - lastDragPos.y, 2));
        if (dist < 5) return;
        lastDragPos = { x: touch.clientX, y: touch.clientY };

        if (touchGhost) {
            touchGhost.style.top = (touch.clientY - dragOffset.y) + 'px';
        }

        // Prevent scrolling during drag
        if (e.cancelable) e.preventDefault();

        // Disable pointer events so we can detect target behind it
        const originalPointerEvents = draggedElement.style.pointerEvents;
        draggedElement.style.pointerEvents = 'none';
        if (touchGhost) touchGhost.style.pointerEvents = 'none';

        const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);

        draggedElement.style.pointerEvents = originalPointerEvents;

        let targetSelector = dragType === 'section' ? '.section-container, .add-section-row' : '.grocery-item, .section-items-list, .add-item-row';
        let target = document.elementFromPoint(touch.clientX, touch.clientY);
        if (target) target = target.closest(targetSelector);

        let redirectedFromAdd = false;
        if (dragType === 'item' && target && target.classList.contains('add-item-row')) {
            target = target.closest('.section-items-list');
            redirectedFromAdd = true;
        }
        if (dragType === 'item' && target && target.classList.contains('add-section-row')) {
            target = null;
        }

        if (!target || target === draggedElement || target.classList.contains('drag-placeholder')) return;

        if (dragType === 'item' && target.classList.contains('section-items-list')) {
            const items = Array.from(target.querySelectorAll('.grocery-item:not(.add-item-row):not(.dragging)'));
            
            if (items.length > 0) {
                const firstRect = items[0].getBoundingClientRect();
                const lastRect = items[items.length - 1].getBoundingClientRect();

                if (touch.clientY < firstRect.top) {
                    animatePlaceholderMove(items[0], true);
                } else if (touch.clientY > lastRect.bottom || redirectedFromAdd) {
                    animatePlaceholderMove(items[items.length - 1], false);
                }
                return;
            } else {
                animatePlaceholderMove(target, true);
                return;
            }
        }

        const rect = target.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        animatePlaceholderMove(target, touch.clientY < midpoint);

        // Auto-scroll if near edges
        const scrollThreshold = 100;
        if (touch.clientY < scrollThreshold) {
            window.scrollBy(0, -10);
        } else if (touch.clientY > window.innerHeight - scrollThreshold) {
            window.scrollBy(0, 10);
        }
    }, { passive: false });

    groceryList.addEventListener('touchend', (e) => {
        if (!draggedElement) return;

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

        lastDragPos = { x: 0, y: 0 };
        placeholder.remove();
        groceryList.classList.remove('no-transition');
        document.body.style.overflow = '';

        const collapsed = document.querySelectorAll('.collapsed');
        if (collapsed.length > 0) {
            collapsed.forEach(el => el.classList.remove('collapsed'));
            // Small delay to allow show transition to start before re-rendering
            setTimeout(() => {
                draggedElement = null;
                dragType = null;
                renderList();
            }, 50);
        } else {
            draggedElement = null;
            dragType = null;
            renderList();
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
                // After splice, if the original element was before the anchor,
                // the anchor's index in the remaining array is still newIdx (or newIdx-1 if movedIdx < newIdx)
                // Actually, finding anchor index AFTER splice is safer.
                const finalNewIdx = oldSectionItems.findIndex(i => i.id === anchorId);
                oldSectionItems.splice(finalNewIdx, 0, moved);
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
