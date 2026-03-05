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
                localStorage.setItem('grocery-app-state', JSON.stringify(data.appState));
                if (data.mode) {
                    localStorage.setItem('grocery-mode', data.mode);
                }
            }
        } catch (e) {
            console.warn('Failed to restore state from URL hash:', e);
        }
    }

    // --- Initialization ---
    function init() {
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

    // --- Swipe Gesture for Mode Switching ---
    let swipeStartX = 0;
    let swipeStartY = 0;
    let isSwiping = false;

    appContainer.addEventListener('touchstart', (e) => {
        // Don't initiate swipe on buttons, modals, select or tab reorder areas.
        // Allow swipe on specific inputs (add-item and add-section) while blocking others (like in modals).
        if (e.target.closest('button') || e.target.closest('.modal-overlay') ||
            e.target.closest('.tab-reorder-btn') || e.target.closest('select')) return;

        const input = e.target.closest('input');
        if (input && !input.classList.contains('add-item-input') && !input.classList.contains('add-section-input')) return;
        swipeStartX = e.touches[0].clientX;
        swipeStartY = e.touches[0].clientY;
        isSwiping = true;
    }, { passive: true });

    appContainer.addEventListener('touchmove', (e) => {
        // passive listener, just tracking
    }, { passive: true });

    appContainer.addEventListener('touchcancel', () => {
        isSwiping = false;
    }, { passive: true });

    appContainer.addEventListener('touchend', (e) => {
        if (!isSwiping || shopSelectionMode) {
            isSwiping = false;
            return;
        }
        isSwiping = false;

        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const deltaX = endX - swipeStartX;
        const deltaY = endY - swipeStartY;

        // Only trigger on predominantly horizontal swipes
        if (Math.abs(deltaX) > 60 && Math.abs(deltaY) < Math.abs(deltaX) * 0.5) {
            if (deltaX < 0) {
                // Swipe left → shop mode
                switchMode('shop', true);
            } else {
                // Swipe right → home mode
                switchMode('home', true);
            }
        }
    }, { passive: true });

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

    // --- Section Delete Modal Logic ---
    function showSectionDeleteModal(sectionName, isHome, onDeleteOnly, onDeleteAll) {
        currentSectionDeleteOnlyCallback = onDeleteOnly;
        currentSectionDeleteAllCallback = onDeleteAll;

        sectionDeleteModalTitle.textContent = 'Delete Section?';

        if (isHome) {
            sectionDeleteModalText.innerHTML = `This action cannot be undone. How would you like to delete <strong>${sectionName}</strong>?`;
            sectionDeleteOnlyBtn.textContent = 'Delete Section Only';
            sectionDeleteOnlyBtn.style.display = '';
            sectionDeleteAllBtn.style.display = '';
        } else {
            sectionDeleteModalText.innerHTML = `This action cannot be undone. Are you sure you want to delete <strong>${sectionName}</strong>?`;
            sectionDeleteOnlyBtn.textContent = 'Delete Section';
            sectionDeleteOnlyBtn.style.display = '';
            sectionDeleteAllBtn.style.display = 'none';
        }

        sectionDeleteModalOverlay.classList.add('visible');
    }

    function hideSectionDeleteModal() {
        sectionDeleteModalOverlay.classList.remove('visible');
        currentSectionDeleteOnlyCallback = null;
        currentSectionDeleteAllCallback = null;
        // Reset button visibility and text for next use
        sectionDeleteOnlyBtn.style.display = '';
        sectionDeleteAllBtn.style.display = '';
        sectionDeleteOnlyBtn.textContent = 'Delete Section Only';
    }

    sectionDeleteOnlyBtn.addEventListener('click', () => {
        if (currentSectionDeleteOnlyCallback) {
            currentSectionDeleteOnlyCallback();
        }
        hideSectionDeleteModal();
    });

    sectionDeleteAllBtn.addEventListener('click', () => {
        if (currentSectionDeleteAllCallback) {
            currentSectionDeleteAllCallback();
        }
        hideSectionDeleteModal();
    });

    sectionDeleteCancelBtn.addEventListener('click', hideSectionDeleteModal);

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

    function renameSection(id, isHome) {
        const currentList = getCurrentList();
        const sectionArray = isHome ? currentList.homeSections : currentList.shopSections;
        const section = sectionArray.find(s => s.id === id);
        if (!section) return;

        showModal('Edit Section', section.name, false, null, (newName) => {
            if (newName && newName.trim() !== '') {
                section.name = newName.trim();
                saveAppState();
                renderList();
            }
        }, () => deleteSectionWithConfirmation(id, isHome, section.name));
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

    function deleteSectionWithConfirmation(id, isHome, name) {
        const onDeleteOnly = () => {
            const currentList = getCurrentList();
            const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
            const uncategorized = getOrCreateUncategorizedSection(isHome);

            // Re-assign items to Uncategorized for this mode only
            currentList.items.forEach(item => {
                if (item[sectionIdKey] === id) {
                    item[sectionIdKey] = uncategorized.id;
                }
            });

            // Remove section from the target mode's array
            if (isHome) {
                currentList.homeSections = currentList.homeSections.filter(s => s.id !== id);
            } else {
                currentList.shopSections = currentList.shopSections.filter(s => s.id !== id);
            }

            saveAppState();
            renderList();
        };

        const onDeleteAll = () => {
            const currentList = getCurrentList();
            const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';

            // Delete all items that belong to this section in THIS mode
            currentList.items = currentList.items.filter(item => item[sectionIdKey] !== id);

            // Remove section from the target mode's array
            if (isHome) {
                currentList.homeSections = currentList.homeSections.filter(s => s.id !== id);
            } else {
                currentList.shopSections = currentList.shopSections.filter(s => s.id !== id);
            }

            saveAppState();
            renderList();
        };

        showSectionDeleteModal(name, isHome, onDeleteOnly, onDeleteAll);
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
            item.shopCompleted = !item.shopCompleted;
            saveAppState();

            // Dynamically update the DOM node so CSS animations can reverse without being destroyed
            const itemNodes = document.querySelectorAll(`li.grocery-item[data-id="${id}"]`);
            itemNodes.forEach(node => {
                if (item.shopCompleted) {
                    node.classList.add('completed');
                } else {
                    node.classList.remove('completed');
                }
                const checkbox = node.querySelector('.item-checkbox');
                if (checkbox) {
                    checkbox.checked = item.shopCompleted;
                }
            });
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
    function swapSectionsAndAnimate(arr, idx1, idx2) {
        // First: Record current positions
        const listContainer = document.getElementById('grocery-list');
        const sections = Array.from(listContainer.querySelectorAll('.section-container'));
        const firstPositions = {};
        sections.forEach(node => {
            firstPositions[node.dataset.id] = node.getBoundingClientRect();
        });

        // Track the element that the user clicked on
        const targetSectionId = arr[idx1].id;
        const targetInitialTop = firstPositions[targetSectionId] ? firstPositions[targetSectionId].top : 0;

        // Swap state
        const temp = arr[idx1];
        arr[idx1] = arr[idx2];
        arr[idx2] = temp;
        saveAppState();

        // Re-render
        renderList();

        // Last: Get new nodes and positions
        const newSections = Array.from(listContainer.querySelectorAll('.section-container'));

        // Adjust scroll position to keep the target section in exactly the same place on screen
        const targetNewSection = newSections.find(n => n.dataset.id === targetSectionId);
        if (targetNewSection) {
            const targetNewTop = targetNewSection.getBoundingClientRect().top;
            const scrollDelta = targetNewTop - targetInitialTop;
            window.scrollBy(0, scrollDelta);
        }

        // We need to re-fetch positions after scrolling because getBoundingClientRect is relative to viewport
        const finalPositions = {};
        newSections.forEach(node => {
            finalPositions[node.dataset.id] = node.getBoundingClientRect();
        });

        // Invert
        newSections.forEach(node => {
            const id = node.dataset.id;
            const first = firstPositions[id];
            const final = finalPositions[id];
            if (first && final) {
                const deltaY = first.top - final.top;

                if (deltaY !== 0) {
                    node.style.transform = `translateY(${deltaY}px)`;
                    node.style.transition = 'none';
                    if (id === targetSectionId) {
                        node.style.position = 'relative';
                        node.style.zIndex = '10';
                    }
                }
            }
        });

        // Play
        requestAnimationFrame(() => {
            newSections.forEach(node => {
                if (node.style.transform) {
                    node.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                    node.style.transform = 'translateY(0)';

                    // Cleanup after transition
                    node.addEventListener('transitionend', function cleanup() {
                        node.style.transition = '';
                        node.style.transform = '';
                        node.style.position = '';
                        node.style.zIndex = '';
                        node.removeEventListener('transitionend', cleanup);
                    });
                }
            });
        });
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
        if (activeReorderId) {
            groceryList.classList.add('reorder-mode-active');
        } else {
            groceryList.classList.remove('reorder-mode-active');
        }

        if (!isHome && shopSelectionMode) {
            groceryList.classList.add('shop-selection-mode');
        } else {
            groceryList.classList.remove('shop-selection-mode');
        }

        const shopDefId = 'sec-s-def';

        sections.forEach((section) => {
            // items for this section 
            let sectionItems = currentList.items.filter(i => i[sectionIdKey] === section.id);
            const totalItemsInSection = sectionItems.length;

            if (!isHome && section.id === shopDefId) {
                // In shop mode, Uncategorized is only visible if at least one item is needed
                const hasNeededItems = sectionItems.some(item => (item.wantCount - item.haveCount) > 0);
                if (!hasNeededItems) {
                    return; // Skip rendering Uncategorized
                }
            }

            // Note: User requested "Show sections without items", so we are no longer hiding empty sections in Shop Mode.
            // (Except Uncategorized which has specific rules above).

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
                header.appendChild(titleSpan);
            }

            // Delete Button (revealed on long-press)
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'section-delete-btn';
            deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
            if (canRename) {
                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    header.classList.remove('delete-active');
                    deleteSectionWithConfirmation(section.id, isHome, section.name);
                });
                header.appendChild(deleteBtn);
            }

            // Long-press to toggle reorder mode
            onLongPress(header, (e) => {
                if (activeReorderId) {
                    // Exit reorder mode
                    activeReorderId = null;
                    groceryList.classList.remove('reorder-mode-active');
                } else {
                    // Enter reorder mode for this section
                    activeReorderId = section.id;
                    groceryList.classList.add('reorder-mode-active');
                }
                renderList();
            });

            // Reorder Controls or Merge Button
            const reorderControls = document.createElement('div');
            reorderControls.className = 'section-reorder-controls';

            const arr = isHome ? currentList.homeSections : currentList.shopSections;
            const idx = arr.findIndex(s => s.id === section.id);

            if (shopSelectionMode && !isHome) {
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
            } else if (isHome || section.id !== shopDefId) {
                // Normal mode: show reordering arrows (except for Uncategorized in Shop Mode)
                const upBtn = document.createElement('button');
                upBtn.className = 'section-reorder-btn';
                upBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';

                // In Shop mode, Uncategorized is locked at index 0 and can't move. 
                // So index 1 in Shop mode also can't move up.
                const cannotMoveUp = isHome ? (idx === 0) : (idx <= 1);

                if (cannotMoveUp) {
                    upBtn.disabled = true;
                }
                upBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    // In Home mode, anything index > 0 can move up.
                    // In Shop mode, index 1 cannot move up (protects Uncategorized at 0).
                    const canMoveUp = isHome ? (idx > 0) : (idx > 1);
                    if (canMoveUp) {
                        swapSectionsAndAnimate(arr, idx, idx - 1);
                    }
                });

                const downBtn = document.createElement('button');
                downBtn.className = 'section-reorder-btn';
                downBtn.innerHTML = '<i class="fas fa-chevron-down"></i>';
                if (idx === arr.length - 1) {
                    downBtn.disabled = true;
                }
                downBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (idx < arr.length - 1 && idx !== -1) {
                        swapSectionsAndAnimate(arr, idx, idx + 1);
                    }
                });

                reorderControls.appendChild(upBtn);
                reorderControls.appendChild(downBtn);
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

            // In shop mode, mark all sections as reorder-active when any reorder is happening
            if (!isHome && activeReorderId) {
                itemsUl.classList.add('reorder-active-list');
            } else if (sectionItems.some(i => i.id === activeReorderId)) {
                itemsUl.classList.add('reorder-active-list');
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

                    // Placeholders for reorder buttons to maintain alignment
                    const btnUp = document.createElement('button');
                    btnUp.className = 'item-reorder-btn item-up placeholder-btn';
                    btnUp.innerHTML = '<i class="fas fa-chevron-up"></i>';
                    btnUp.disabled = true;

                    const btnDown = document.createElement('button');
                    btnDown.className = 'item-reorder-btn item-down placeholder-btn';
                    btnDown.innerHTML = '<i class="fas fa-chevron-down"></i>';
                    btnDown.disabled = true;

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

                    li.appendChild(btnUp);
                    if (isHome) {
                        info.appendChild(nameSpan);
                    } else {
                        // Shop Mode
                        info.appendChild(nameSpan);
                    }
                    li.appendChild(info); // Always use info wrapper for flex: 1
                    li.appendChild(undoBtn); // Put in place of counter/qty circle
                    li.appendChild(btnDown);

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

                // Tag 0-qty items shown during shop mode reorder
                if (!isHome && activeReorderId) {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);
                    if (toBuy <= 0 && !item.shopCompleted) {
                        li.classList.add('zero-qty-reorder');
                    }
                }

                if (item.id === activeReorderId && isHome) {
                    li.classList.add('reorder-active');
                }

                li.innerHTML = '';

                if (isHome) {
                    const btnUp = document.createElement('button');
                    btnUp.className = 'item-reorder-btn item-up';
                    btnUp.innerHTML = '<i class="fas fa-chevron-up"></i>';

                    const btnDown = document.createElement('button');
                    btnDown.className = 'item-reorder-btn item-down';
                    btnDown.innerHTML = '<i class="fas fa-chevron-down"></i>';

                    btnUp.addEventListener('click', (e) => {
                        e.stopPropagation();
                        swapItemsAndAnimate(li, -1);
                    });

                    btnDown.addEventListener('click', (e) => {
                        e.stopPropagation();
                        swapItemsAndAnimate(li, 1);
                    });

                    onLongPress(li, (e) => {
                        // Close steppers
                        document.querySelectorAll('.qty-part.expanded').forEach(part => {
                            part.classList.remove('expanded');
                            part.closest('.qty-combined-pill')?.classList.remove('active');
                        });

                        if (activeReorderId) {
                            // In Home mode, long press on ANY item while reordering exits the mode
                            activeReorderId = null;
                            document.querySelectorAll('.grocery-item.reorder-active').forEach(n => n.classList.remove('reorder-active'));
                            groceryList.classList.remove('reorder-mode-active');
                        } else {
                            // Enter reorder mode
                            li.classList.add('reorder-active');
                            groceryList.classList.add('reorder-mode-active');
                            activeReorderId = item.id;
                        }
                    });

                    const info = document.createElement('div');
                    info.className = 'item-info';

                    const nameSpan = document.createElement('span');
                    nameSpan.className = 'item-text';
                    nameSpan.textContent = item.text;

                    onDoubleTap(nameSpan, (e) => {
                        e.stopPropagation();

                        // Close reordering
                        activeReorderId = null;
                        li.classList.remove('reorder-active');
                        groceryList.classList.remove('reorder-mode-active');

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

                    li.appendChild(btnUp); // Arrow Up on the left
                    li.appendChild(info);

                    const controls = document.createElement('div');
                    controls.className = 'quantity-controls';

                    controls.appendChild(createCombinedQtyControl(item));

                    li.appendChild(controls);
                    li.appendChild(btnDown); // Arrow Down on the right
                } else {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);

                    const btnUp = document.createElement('button');
                    btnUp.className = 'item-reorder-btn item-up';
                    btnUp.innerHTML = '<i class="fas fa-chevron-up"></i>';

                    const btnDown = document.createElement('button');
                    btnDown.className = 'item-reorder-btn item-down';
                    btnDown.innerHTML = '<i class="fas fa-chevron-down"></i>';

                    btnUp.addEventListener('click', (e) => {
                        e.stopPropagation();
                        swapItemsAndAnimate(li, -1);
                    });

                    btnDown.addEventListener('click', (e) => {
                        e.stopPropagation();
                        swapItemsAndAnimate(li, 1);
                    });

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

                    li.appendChild(btnUp);
                    li.appendChild(textSpan);
                    li.appendChild(qtyCircle);
                    li.appendChild(btnDown);

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

        // Handle disabling of first up/last down globally
        const allReorderableNodes = Array.from(document.querySelectorAll('.grocery-item[data-type="item"], .grocery-item[data-type="item-placeholder"]'));
        const activeItems = document.querySelectorAll('.grocery-item[data-type="item"]');

        activeItems.forEach(item => {
            const itemIdx = allReorderableNodes.indexOf(item);
            const upBtn = item.querySelector('.item-up');
            const downBtn = item.querySelector('.item-down');

            if (upBtn) {
                // Disabled if there's no valid node above it (index 0 implies it's entirely first)
                // Wait, even if it's index 1 and index 0 is its OWN placeholder, it can't move up.
                const hasValidNodeAbove = allReorderableNodes.slice(0, itemIdx).some(n =>
                    n.dataset.type === 'item' || (n.dataset.type === 'item-placeholder' && n.dataset.sectionId !== item.dataset.sectionId)
                );
                upBtn.disabled = !hasValidNodeAbove;
            }

            if (downBtn) {
                const hasValidNodeBelow = allReorderableNodes.slice(itemIdx + 1).some(n =>
                    n.dataset.type === 'item' || (n.dataset.type === 'item-placeholder' && n.dataset.sectionId !== item.dataset.sectionId)
                );
                downBtn.disabled = !hasValidNodeBelow;
            }
        });

        // Add "Add a section..." element at the bottom
        const addSecRow = document.createElement('li');
        addSecRow.className = 'grocery-item';

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

            // Close reordering if active
            if (activeReorderId) {
                const activeNode = document.querySelector('.grocery-item.reorder-active');
                if (activeNode) activeNode.classList.remove('reorder-active');
                activeReorderId = null;
            }

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

        // Combined pill triggers expansion to clear reordering if clicked as a whole
        group.addEventListener('click', (e) => {
            if (activeReorderId) {
                const activeNode = document.querySelector('.grocery-item.reorder-active');
                if (activeNode) activeNode.classList.remove('reorder-active');
                activeReorderId = null;
            }
        });

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

    function animateShopChipReorder(sectionUl, callback) {
        // FLIP animation for shop chip reorder mode transitions
        const chips = Array.from(sectionUl.querySelectorAll('.shop-chip'));

        // First: capture current positions and sizes
        const firstRects = new Map();
        chips.forEach(chip => {
            firstRects.set(chip.dataset.id, chip.getBoundingClientRect());
        });

        // Execute the layout change
        callback();

        // Last: read new positions
        const updatedChips = Array.from(sectionUl.querySelectorAll('.shop-chip'));

        // Invert + Play
        updatedChips.forEach(chip => {
            const id = chip.dataset.id;
            const first = firstRects.get(id);
            if (!first) return;

            const last = chip.getBoundingClientRect();
            const deltaX = first.left - last.left;
            const deltaY = first.top - last.top;
            const scaleX = first.width / last.width;
            const scaleY = first.height / last.height;

            if (deltaX === 0 && deltaY === 0 && Math.abs(scaleX - 1) < 0.01 && Math.abs(scaleY - 1) < 0.01) return;

            chip.style.transformOrigin = 'left center';
            chip.style.transform = `translate(${deltaX}px, ${deltaY}px) scaleX(${scaleX})`;
            chip.style.transition = 'none';
        });

        requestAnimationFrame(() => {
            updatedChips.forEach(chip => {
                if (chip.style.transform) {
                    chip.style.transition = 'transform 0.35s cubic-bezier(0.25, 1, 0.5, 1)';
                    chip.style.transform = '';

                    chip.addEventListener('transitionend', function cleanup(e) {
                        if (e.propertyName !== 'transform') return;
                        chip.removeEventListener('transitionend', cleanup);
                        chip.style.transition = '';
                        chip.style.transformOrigin = '';
                    });
                }
            });
        });
    }

    function swapItemsAndAnimate(node, offset) {
        const isHome = currentMode === 'home';
        const sectionKey = isHome ? 'homeSectionId' : 'shopSectionId';

        // Include both items and placeholders (for empty sections) to establish strict linear vertical order
        const allNodes = Array.from(document.querySelectorAll('.grocery-item[data-type="item"], .grocery-item[data-type="item-placeholder"]'));
        const nodeIdx = allNodes.indexOf(node);

        if (nodeIdx === -1) return;

        // Find the valid target swap index, skipping over our own section's placeholder if dragging down
        let targetIdx = nodeIdx + offset;
        while (targetIdx >= 0 && targetIdx < allNodes.length) {
            const potentialTarget = allNodes[targetIdx];
            // If we are moving down and hit the placeholder for the section we are currently in, skip it (it's conceptually after all items in the section)
            if (offset > 0 && potentialTarget.dataset.type === 'item-placeholder' && potentialTarget.dataset.sectionId === node.dataset.sectionId) {
                targetIdx += offset;
                continue;
            }
            // If we are moving up and hit the placeholder for the section we are currently in, skip it
            if (offset < 0 && potentialTarget.dataset.type === 'item-placeholder' && potentialTarget.dataset.sectionId === node.dataset.sectionId) {
                targetIdx += offset;
                continue;
            }
            break; // Found valid target
        }

        if (targetIdx < 0 || targetIdx >= allNodes.length) return;

        const targetNode = allNodes[targetIdx];
        const movedId = node.dataset.id;

        let anchorId = null;
        let targetSectionId = null;
        let isPlaceholder = false;

        if (targetNode.dataset.type === 'item-placeholder') {
            targetSectionId = targetNode.dataset.sectionId;
            isPlaceholder = true;
        } else {
            anchorId = targetNode.dataset.id;
        }

        // We need to capture bounding boxes for ALL rendered item nodes before the change
        const preNodes = Array.from(document.querySelectorAll('.grocery-item[data-type="item"]'));
        const firstPositions = {};
        preNodes.forEach(n => {
            firstPositions[n.dataset.id] = n.getBoundingClientRect().top;
        });

        const targetInitialTop = firstPositions[movedId] || 0;

        // Use standard reorder items logic
        updateOrderInState(movedId, anchorId, targetSectionId, isPlaceholder);

        // State is saved inside updateOrderInState, now rerender to get new DOM
        renderList();

        const postNodes = Array.from(document.querySelectorAll('.grocery-item[data-type="item"]'));

        // Adjust scroll position to keep moved item at same viewport position
        const targetNewNode = postNodes.find(n => n.dataset.id === movedId);
        if (targetNewNode) {
            const targetNewTop = targetNewNode.getBoundingClientRect().top;
            const scrollDelta = targetNewTop - targetInitialTop;
            window.scrollBy(0, scrollDelta);

            // Adjust firstPositions to account for the scroll we just did,
            // so FLIP animation deltas are computed correctly
            Object.keys(firstPositions).forEach(id => {
                firstPositions[id] -= scrollDelta;
            });
        }

        // Apply FLIP animation (skip the moved item — scroll already keeps it static)
        postNodes.forEach(n => {
            const id = n.dataset.id;
            if (id === movedId) return;
            if (firstPositions[id] !== undefined) {
                const newTop = n.getBoundingClientRect().top;
                const deltaY = firstPositions[id] - newTop;

                if (deltaY !== 0) {
                    if (id === movedId) {
                        n.style.position = 'relative';
                        n.style.zIndex = '20';
                    } else {
                        n.style.position = 'relative';
                        n.style.zIndex = '10';
                    }

                    n.style.transform = `translateY(${deltaY}px)`;
                    n.style.transition = 'none';

                    requestAnimationFrame(() => {
                        n.style.transform = '';
                        n.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
                    });

                    n.addEventListener('transitionend', function cleanup() {
                        n.removeEventListener('transitionend', cleanup);
                        n.style.transform = '';
                        n.style.transition = '';
                        n.style.position = '';
                        n.style.zIndex = '';
                    });
                }
            }
        });
    }

    function updateOrderInState(movedId, anchorId, targetSectionId, isPlaceholder) {
        const currentList = getCurrentList();
        const isHome = currentMode === 'home';
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const indexKey = isHome ? 'homeIndex' : 'shopIndex';

        const movedItem = currentList.items.find(i => i.id === movedId);
        if (!movedItem) return;

        const oldSectionId = movedItem[sectionIdKey];

        // Ensure indices exist and sort old section
        let oldSectionItems = currentList.items.filter(i => i[sectionIdKey] === oldSectionId);
        oldSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));

        if (isPlaceholder) {
            movedItem[sectionIdKey] = targetSectionId;
            let sectionItems = currentList.items.filter(i => i[sectionIdKey] === targetSectionId && i.id !== movedId);
            sectionItems.push(movedItem);
            sectionItems.forEach((item, idx) => { item[indexKey] = idx; });

            if (oldSectionId !== targetSectionId) {
                oldSectionItems = oldSectionItems.filter(i => i.id !== movedId);
                oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
            }
            saveAppState();
            return;
        }

        const anchorItem = currentList.items.find(i => i.id === anchorId);
        if (!anchorItem) return;

        const newSectionId = anchorItem[sectionIdKey];
        movedItem[sectionIdKey] = newSectionId;

        if (oldSectionId === newSectionId) {
            // Moving within the SAME section
            const oldIdx = oldSectionItems.findIndex(i => i.id === movedId);
            const newIdx = oldSectionItems.findIndex(i => i.id === anchorId);

            if (oldIdx !== -1 && newIdx !== -1) {
                const [moved] = oldSectionItems.splice(oldIdx, 1);
                oldSectionItems.splice(newIdx, 0, moved);
                oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
            }
        } else {
            // Moving ACROSS sections
            oldSectionItems = oldSectionItems.filter(i => i.id !== movedId);
            oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });

            let newSectionItems = currentList.items.filter(i => i[sectionIdKey] === newSectionId && i.id !== movedId);
            newSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));

            const insertIdx = newSectionItems.findIndex(i => i.id === anchorId);
            if (insertIdx !== -1) {
                newSectionItems.splice(insertIdx, 0, movedItem);
            } else {
                newSectionItems.push(movedItem);
            }
            newSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
        }

        saveAppState();
    }

    // Close steppers on outside click
    document.addEventListener('click', (e) => {
        document.querySelectorAll('.qty-part.expanded').forEach(part => {
            if (!part.contains(e.target)) {
                part.classList.remove('expanded');
                part.closest('.qty-combined-pill')?.classList.remove('active');
            }
        });

        // Close section delete buttons on outside click
        document.querySelectorAll('.section-header.delete-active').forEach(header => {
            if (!header.contains(e.target)) {
                header.classList.remove('delete-active');
            }
        });

        document.querySelectorAll('.grocery-item.reorder-active').forEach(node => {
            if (!node.contains(e.target) && !e.target.closest('.item-reorder-btn')) {
                if (node.dataset.id === activeReorderId) activeReorderId = null;

                const sectionUl = node.closest('.section-items-list');
                if (sectionUl && currentMode === 'shop') {
                    // Fade out 0-qty items first, then re-render
                    const zeroQtyChips = sectionUl.querySelectorAll('.shop-chip.zero-qty-reorder');
                    if (zeroQtyChips.length > 0) {
                        zeroQtyChips.forEach(chip => {
                            chip.classList.remove('zero-qty-reorder');
                            chip.classList.add('zero-qty-leaving');
                        });
                        setTimeout(() => {
                            renderList();
                        }, 300);
                    } else {
                        // Use FLIP animation for shop chips
                        animateShopChipReorder(sectionUl, () => {
                            node.classList.remove('reorder-active');
                            sectionUl.classList.remove('reorder-active-list');
                        });
                    }
                } else {
                    // Home mode: use existing dismissing animation
                    node.classList.add('dismissing');
                    groceryList.classList.remove('reorder-mode-active');
                    const list = node.closest('.section-items-list');
                    setTimeout(() => {
                        node.classList.remove('reorder-active', 'dismissing');
                        if (list) list.classList.remove('reorder-active-list');
                        renderList();
                    }, 320);
                }
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

    await restoreFromHash();
    init();
});
