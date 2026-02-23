document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let appState = {
        lists: [],
        currentListId: null
    };

    // Legacy state retrieval for migration
    const legacyItems = JSON.parse(localStorage.getItem('grocery-items'));
    const storedState = JSON.parse(localStorage.getItem('grocery-app-state'));
    let currentMode = localStorage.getItem('grocery-mode') || 'home'; // 'home' or 'shop'
    let activeReorderId = null;
    let activeTabReorderId = null; // Tracks the ID of the list tab currently showing reorder arrows
    let currentShopFilter = 'unbought'; // 'unbought' or 'all'

    // --- DOM Elements ---
    const groceryList = document.getElementById('grocery-list');
    const modeToggle = document.getElementById('mode-toggle');
    const tabsList = document.getElementById('tabs-list');
    // const addTabBtn = document.getElementById('add-tab-btn'); // Removed static ref

    // Modal Elements
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const modalThemeGroup = document.getElementById('modal-theme-group');
    const modalThemeSelect = document.getElementById('modal-theme');
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

    // Modal State
    let currentDeleteCallback = null;

    // --- Initialization ---
    function init() {
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
                homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
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

        modeToggle.checked = currentMode === 'shop';
        updateModeUI();
        renderTabs();
        renderList();
    }

    // --- Event Listeners ---
    modeToggle.addEventListener('change', () => {
        const newMode = modeToggle.checked ? 'shop' : 'home';

        // Auto-update "Have" counts when switching FROM Shop TO Home
        if (currentMode === 'shop' && newMode === 'home') {
            const currentList = getCurrentList();
            currentList.items.forEach(item => {
                if (item.shopCompleted) {
                    item.haveCount = item.wantCount; // Assume bought to full capacity
                    item.shopCompleted = false;      // Reset for next trip
                }
            });
            saveAppState();
        }

        currentMode = newMode;
        saveMode();
        updateModeUI();
        renderList(); // Re-render to sort by new mode
    });

    // --- Import / Export Logic ---
    exportBtn.addEventListener('click', () => {
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

    importBtn.addEventListener('click', () => {
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

    // addTabBtn listener moved to renderTabs


    let currentModalCallback = null;
    let currentDeleteActionCallback = null;

    function showModal(title, initialValue, showTheme, initialTheme, callback, deleteCallback) {
        modalTitle.textContent = title;
        modalInput.value = initialValue || '';

        if (showTheme) {
            modalThemeGroup.classList.remove('hidden');
            modalThemeSelect.value = initialTheme || 'var(--theme-blue)';
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
        currentModalCallback = null;
        currentDeleteActionCallback = null;
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
        const theme = !modalThemeGroup.classList.contains('hidden') ? modalThemeSelect.value : null;
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
            const theme = !modalThemeGroup.classList.contains('hidden') ? modalThemeSelect.value : null;
            if (currentModalCallback) {
                currentModalCallback(val, theme);
            }
            hideModal();
        }
    });

    modalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = modalInput.value.trim();
            const theme = !modalThemeGroup.classList.contains('hidden') ? modalThemeSelect.value : null;
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

    function onLongPress(element, callback, duration = 300) {
        let pressTimer;
        let isPressing = false;
        let startX, startY;

        const startPress = (e) => {
            if (e.type === 'mousedown' && e.button !== 0) return;
            if (e.target.closest('button') || e.target.closest('input')) return;

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
            homeSections: [{ id: 'sec-h-def', name: 'Uncategorized' }],
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
        }, () => deleteItemWithConfirmation(id, item.text));

        modalHomeSectionGroup.classList.remove('hidden');
        modalShopSectionGroup.classList.remove('hidden');
    }

    function addSection(name, isHome) {
        const currentList = getCurrentList();
        const sectionArray = isHome ? currentList.homeSections : currentList.shopSections;
        const newSection = {
            id: 'sec-' + Date.now().toString(),
            name: name
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

    function deleteItemWithConfirmation(id, name) {
        showDeleteModal('Delete Item?', name, () => {
            deleteItem(id);
        });
    }

    function deleteSectionWithConfirmation(id, isHome, name) {
        showDeleteModal('Delete Section?', name, () => {
            const currentList = getCurrentList();
            const sectionArray = isHome ? currentList.homeSections : currentList.shopSections;
            const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
            const defaultSectionId = sectionArray[0].id; // Fallback to first section (Uncategorized)

            // Re-assign items
            currentList.items.forEach(item => {
                if (item[sectionIdKey] === id) {
                    item[sectionIdKey] = defaultSectionId;
                }
            });

            // Remove section
            if (isHome) {
                currentList.homeSections = currentList.homeSections.filter(s => s.id !== id);
            } else {
                currentList.shopSections = currentList.shopSections.filter(s => s.id !== id);
            }

            saveAppState();
            renderList();
        });
    }

    // --- Core Functions ---

    function addItemToSection(sectionId, textValue, isHome) {
        const text = textValue ? textValue.trim() : '';
        if (!text) return;

        const currentList = getCurrentList();
        const newItem = {
            id: Date.now().toString(),
            text: text,
            homeSectionId: isHome ? sectionId : currentList.homeSections[0].id,
            shopSectionId: !isHome ? sectionId : currentList.shopSections[0].id,
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
        currentList.items = currentList.items.filter(i => i.id !== id);
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
        // Fallback color if something goes wrong or no list
        const themeColor = currentList && currentList.theme ? currentList.theme : 'var(--theme-blue)';

        if (currentMode === 'home') {
            document.documentElement.style.setProperty('--primary-color', themeColor);
        } else {
            document.documentElement.style.setProperty('--primary-color', themeColor);
        }
    }

    function saveAppState() {
        localStorage.setItem('grocery-app-state', JSON.stringify(appState));
    }

    function saveMode() {
        localStorage.setItem('grocery-mode', currentMode);
    }

    function renderTabs() {
        tabsList.innerHTML = '';

        appState.lists.forEach((list, index) => {
            const tab = document.createElement('div');
            tab.className = `tab-item ${list.id === appState.currentListId ? 'active' : ''}`;
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
            tab.appendChild(btnRight);

            tab.addEventListener('click', (e) => {
                if (e.target.closest('.tab-reorder-btn')) return;

                if (activeTabReorderId) {
                    activeTabReorderId = null;
                    renderTabs();
                    return;
                }
                switchList(list.id);
            });

            // Double click to rename
            onDoubleTap(nameSpan, (e) => {
                e.stopPropagation();
                activeTabReorderId = null;
                tab.classList.remove('reorder-active');
                renameList(list.id);
            });

            onLongPress(tab, (e) => {
                const isActive = tab.classList.contains('reorder-active');
                document.querySelectorAll('.tab-item.reorder-active').forEach(n => n.classList.remove('reorder-active'));
                if (!isActive) {
                    tab.classList.add('reorder-active');
                    activeTabReorderId = list.id;
                } else {
                    activeTabReorderId = null;
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
        addBtn.className = 'add-tab-btn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = "Create New List";
        addBtn.addEventListener('click', () => {
            showModal('Create New List', 'New List', true, 'var(--theme-blue)', (name, theme) => {
                if (name) addNewList(name, theme);
            });
        });
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

        sections.forEach((section) => {
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
            // Double tap to rename section
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

            // Reorder Controls
            const reorderControls = document.createElement('div');
            reorderControls.className = 'section-reorder-controls';

            const arr = isHome ? currentList.homeSections : currentList.shopSections;
            const idx = arr.findIndex(s => s.id === section.id);

            const upBtn = document.createElement('button');
            upBtn.className = 'section-reorder-btn';
            upBtn.innerHTML = '<i class="fas fa-chevron-up"></i>';
            if (idx === 0) {
                upBtn.disabled = true;
            }
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (idx > 0) {
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

            sectionLi.appendChild(header);

            // Nested UL for items
            const itemsUl = document.createElement('ul');
            itemsUl.className = 'section-items-list';
            itemsUl.dataset.sectionId = section.id;
            itemsUl.dataset.type = 'item-placeholder'; // Allow empty UL to receive drops



            // items for this section 
            let sectionItems = currentList.items.filter(i => i[sectionIdKey] === section.id);

            if (!isHome) {
                // filter shop items
                sectionItems = sectionItems.filter(item => {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);
                    return toBuy > 0 || item.shopCompleted;
                });
            }

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

                        const isActive = li.classList.contains('reorder-active');
                        document.querySelectorAll('.grocery-item.reorder-active').forEach(n => n.classList.remove('reorder-active'));
                        if (!isActive) {
                            li.classList.add('reorder-active');
                            activeReorderId = item.id;
                        } else {
                            activeReorderId = null;
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

                        // Turn into text input
                        const input = document.createElement('input');
                        input.type = 'text';
                        input.value = item.text;
                        input.className = 'inline-edit-input';

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

                        info.replaceChild(input, nameSpan);
                        input.focus();
                        input.setSelectionRange(0, input.value.length);
                    });

                    info.appendChild(nameSpan);

                    const badgeSpan = document.createElement('span');
                    badgeSpan.className = 'item-shop-badge';
                    const currentList = getCurrentList();
                    const shopSec = currentList.shopSections.find(s => s.id === item.shopSectionId) || currentList.shopSections[0];
                    badgeSpan.textContent = shopSec ? shopSec.name : 'Unknown';

                    onDoubleTap(badgeSpan, (e) => {
                        e.stopPropagation();

                        // Close reordering
                        activeReorderId = null;
                        li.classList.remove('reorder-active');

                        const dropdownContainer = document.createElement('div');
                        dropdownContainer.className = 'custom-dropdown-container';

                        const dropdownList = document.createElement('ul');
                        dropdownList.className = 'custom-dropdown-list';

                        const closeDropdown = (e) => {
                            if (!dropdownContainer.contains(e.target)) {
                                document.removeEventListener('mousedown', closeDropdown);
                                renderList();
                            }
                        };

                        currentList.shopSections.forEach(sec => {
                            const option = document.createElement('li');
                            option.className = 'custom-dropdown-item';
                            option.textContent = sec.name;
                            if (sec.id === item.shopSectionId) {
                                option.classList.add('selected');
                            }

                            option.addEventListener('mousedown', (clickEvent) => {
                                clickEvent.preventDefault(); // Prevent default focus changes
                                clickEvent.stopPropagation();
                                if (sec.id !== item.shopSectionId) {
                                    item.shopSectionId = sec.id;
                                    saveAppState();
                                }
                                document.removeEventListener('mousedown', closeDropdown);
                                renderList();
                            });

                            dropdownList.appendChild(option);
                        });

                        dropdownContainer.appendChild(dropdownList);

                        // Small delay to prevent immediate close if double click propagates
                        setTimeout(() => {
                            document.addEventListener('mousedown', closeDropdown);
                        }, 50);

                        info.replaceChild(dropdownContainer, badgeSpan);

                        // Center the selected item within the scrollable area
                        const selectedOption = dropdownList.querySelector('.selected');
                        if (selectedOption) {
                            // Scroll so the element is vertically centered in the dropdown view
                            const dropdownHeight = dropdownList.offsetHeight;
                            const optionTop = selectedOption.offsetTop;
                            const optionHeight = selectedOption.offsetHeight;
                            dropdownList.scrollTop = optionTop - (dropdownHeight / 2) + (optionHeight / 2);
                        }
                    });

                    info.appendChild(badgeSpan);

                    li.appendChild(btnUp); // Arrow Up on the left
                    li.appendChild(info);

                    const controls = document.createElement('div');
                    controls.className = 'quantity-controls';

                    controls.appendChild(createCombinedQtyControl(item));

                    li.appendChild(controls);
                    li.appendChild(btnDown); // Arrow Down on the right
                } else {
                    const toBuy = Math.max(0, item.wantCount - item.haveCount);

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

                    li.appendChild(textSpan);
                    li.appendChild(qtyCircle);

                    // Full-chip click toggle for Shop Mode
                    li.addEventListener('click', (e) => {
                        toggleShopCompleted(item.id);
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
                input.className = 'inline-item-input';
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
        addSecRow.className = 'add-section-row';

        const addSecContainer = document.createElement('form');
        addSecContainer.className = 'inline-input-group';

        const addSecInput = document.createElement('input');
        addSecInput.type = 'text';
        addSecInput.placeholder = '+ Add section';
        addSecInput.className = 'inline-item-input';

        const doAddSec = (e) => {
            e.preventDefault();
            if (addSecInput.value.trim()) {
                addSection(addSecInput.value.trim(), isHome);
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
                if (p !== part) p.classList.remove('expanded');
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
                renderList();
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

        // Adjust scroll position
        const targetNewNode = postNodes.find(n => n.dataset.id === movedId);
        if (targetNewNode) {
            const targetNewTop = targetNewNode.getBoundingClientRect().top;
            const scrollDelta = targetNewTop - targetInitialTop;
            window.scrollBy(0, scrollDelta);
        }

        // Apply FLIP animation
        postNodes.forEach(n => {
            const id = n.dataset.id;
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

        document.querySelectorAll('.grocery-item.reorder-active').forEach(node => {
            if (!node.contains(e.target) && !e.target.closest('.item-reorder-btn')) {
                node.classList.remove('reorder-active');
                if (node.dataset.id === activeReorderId) activeReorderId = null;
            }
        });

        document.querySelectorAll('.tab-item.reorder-active').forEach(node => {
            if (!node.contains(e.target) && !e.target.closest('.tab-reorder-btn')) {
                node.classList.remove('reorder-active');
                if (node.dataset.id === activeTabReorderId) {
                    activeTabReorderId = null;
                    renderTabs();
                }
            }
        });
    });

    init();
});
