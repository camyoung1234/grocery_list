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

    // --- DOM Elements ---
    const groceryList = document.getElementById('grocery-list');
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabelHome = document.getElementById('mode-label-home');
    const modeLabelShop = document.getElementById('mode-label-shop');
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
                theme: '#4a90e2', // Default Theme
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
            modalThemeSelect.value = initialTheme || '#4a90e2';
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

        currentModalCallback = callback;
        modalOverlay.classList.add('visible');
        modalInput.focus();
        modalInput.select();
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
    function getCurrentList() {
        return appState.lists.find(l => l.id === appState.currentListId);
    }

    // --- List Management ---
    function addNewList(name, theme) {
        const newList = {
            id: Date.now().toString(),
            name: name,
            theme: theme || '#4a90e2',
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

        showModal('Rename Item', item.text, false, null, (newName) => {
            if (newName && newName.trim() !== '') {
                item.text = newName.trim();
                saveAppState();
                renderList();
            }
        }, () => deleteItemWithConfirmation(id, item.text));
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

        showModal('Rename Section', section.name, false, null, (newName) => {
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
            renderList();
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
        const themeColor = currentList && currentList.theme ? currentList.theme : '#4a90e2';

        if (currentMode === 'home') {
            modeLabelHome.classList.add('active');
            modeLabelShop.classList.remove('active');
            document.documentElement.style.setProperty('--primary-color', themeColor);
        } else {
            modeLabelHome.classList.remove('active');
            modeLabelShop.classList.add('active');
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
        appState.lists.forEach(list => {
            const tab = document.createElement('div');
            tab.className = `tab-item ${list.id === appState.currentListId ? 'active' : ''}`;
            tab.textContent = list.name;

            tab.addEventListener('click', () => switchList(list.id));

            // Double click to rename
            tab.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                renameList(list.id);
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
            showModal('Create New List', 'New List', true, '#4a90e2', (name, theme) => {
                if (name) addNewList(name, theme);
            });
        });
        tabsList.appendChild(addBtn);
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
            sectionLi.draggable = true;

            // Section Header
            const header = document.createElement('div');
            header.className = 'section-header';

            const titleSpan = document.createElement('h3');
            titleSpan.className = 'section-title';
            titleSpan.textContent = section.name;
            titleSpan.addEventListener('dblclick', (e) => {
                e.stopPropagation();
                renameSection(section.id, isHome);
            });
            header.appendChild(titleSpan);
            sectionLi.appendChild(header);

            // Nested UL for items
            const itemsUl = document.createElement('ul');
            itemsUl.className = 'section-items-list';
            itemsUl.dataset.sectionId = section.id;
            itemsUl.dataset.type = 'item-placeholder'; // Allow empty UL to receive drops

            itemsUl.addEventListener('dragover', handleItemDragOver);
            itemsUl.addEventListener('drop', handleItemDrop);
            itemsUl.addEventListener('dragenter', handleItemDragEnter);
            itemsUl.addEventListener('dragleave', handleItemDragLeave);

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

            sectionItems.forEach(item => {
                const li = document.createElement('li');
                li.className = `grocery-item ${item.shopCompleted && !isHome ? 'completed' : ''}`;
                li.draggable = true;
                li.dataset.id = item.id;
                li.dataset.type = 'item';
                li.dataset.sectionId = section.id;

                li.innerHTML = '';

                if (isHome) {
                    const info = document.createElement('div');
                    info.className = 'item-info';

                    const textSpan = document.createElement('span');
                    textSpan.className = 'item-text';
                    textSpan.textContent = item.text;
                    textSpan.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        renameItem(item.id);
                    });
                    info.appendChild(textSpan);
                    li.appendChild(info);

                    const controls = document.createElement('div');
                    controls.className = 'quantity-controls';

                    const compactGroup = createCompactQtyControl(item);
                    controls.appendChild(compactGroup);

                    li.appendChild(controls);
                } else {
                    const content = document.createElement('div');
                    content.className = 'item-content-shop';

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.className = 'item-checkbox';
                    checkbox.checked = item.shopCompleted;
                    checkbox.addEventListener('change', () => toggleShopCompleted(item.id));
                    content.appendChild(checkbox);

                    const details = document.createElement('div');
                    details.className = 'shop-details';

                    const textSpan = document.createElement('span');
                    textSpan.className = 'item-text';
                    textSpan.textContent = item.text;
                    textSpan.addEventListener('dblclick', (e) => {
                        e.stopPropagation();
                        renameItem(item.id);
                    });
                    details.appendChild(textSpan);

                    const toBuy = Math.max(0, item.wantCount - item.haveCount);
                    const badge = document.createElement('span');
                    badge.className = `buy-badge ${toBuy > 0 ? 'needed' : 'stocked'}`;
                    badge.textContent = `Buy: ${toBuy}`;
                    details.appendChild(badge);

                    content.appendChild(details);
                    li.appendChild(content);
                }

                // Delete button removed since double tap covers deletion

                // Drag events for items
                li.addEventListener('dragstart', handleItemDragStart);
                li.addEventListener('dragover', handleItemDragOver);
                li.addEventListener('drop', handleItemDrop);
                li.addEventListener('dragenter', handleItemDragEnter);
                li.addEventListener('dragleave', handleItemDragLeave);
                li.addEventListener('dragend', handleDragEnd);

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
                input.placeholder = '+ Add an item...';

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
                addRow.addEventListener('dragover', handleItemDragOver);
                addRow.addEventListener('drop', handleItemDrop);
                addRow.addEventListener('dragenter', handleItemDragEnter);
                addRow.addEventListener('dragleave', handleItemDragLeave);

                itemsUl.appendChild(addRow);
            }
            sectionLi.appendChild(itemsUl);

            // Drag events for section
            sectionLi.addEventListener('dragstart', handleSectionDragStart);
            sectionLi.addEventListener('dragover', handleSectionDragOver);
            sectionLi.addEventListener('drop', handleSectionDrop);
            sectionLi.addEventListener('dragenter', handleSectionDragEnter);
            sectionLi.addEventListener('dragleave', handleSectionDragLeave);
            sectionLi.addEventListener('dragend', handleDragEnd);

            groceryList.appendChild(sectionLi);
        });

        // Add "Add a section..." element at the bottom
        const addSecRow = document.createElement('li');
        addSecRow.className = 'add-section-row';

        const addSecContainer = document.createElement('form');
        addSecContainer.className = 'inline-input-group';

        const addSecInput = document.createElement('input');
        addSecInput.type = 'text';
        addSecInput.placeholder = 'Add a section...';
        addSecInput.className = 'add-section-input';

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

    function createCompactQtyControl(item) {
        const group = document.createElement('div');
        group.className = 'qty-compact-group';

        // --- Have Controls ---
        const btnHaveMinus = document.createElement('button');
        btnHaveMinus.className = 'qty-btn';
        btnHaveMinus.textContent = '-';
        btnHaveMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            adjustHave(item.id, -1);
        });
        group.appendChild(btnHaveMinus);

        const spanHaveVal = document.createElement('span');
        spanHaveVal.className = 'qty-val';
        spanHaveVal.textContent = item.haveCount;
        group.appendChild(spanHaveVal);

        const btnHavePlus = document.createElement('button');
        btnHavePlus.className = 'qty-btn';
        btnHavePlus.textContent = '+';
        btnHavePlus.addEventListener('click', (e) => {
            e.stopPropagation();
            adjustHave(item.id, 1);
        });
        group.appendChild(btnHavePlus);

        // --- Separator ---
        const separator = document.createElement('span');
        separator.className = 'qty-separator';
        separator.textContent = '/';
        group.appendChild(separator);

        // --- Want Controls ---
        const btnWantMinus = document.createElement('button');
        btnWantMinus.className = 'qty-btn';
        btnWantMinus.textContent = '-';
        btnWantMinus.addEventListener('click', (e) => {
            e.stopPropagation();
            adjustWant(item.id, -1);
        });
        group.appendChild(btnWantMinus);

        const spanWantVal = document.createElement('span');
        spanWantVal.className = 'qty-val';
        spanWantVal.textContent = item.wantCount;
        group.appendChild(spanWantVal);

        const btnWantPlus = document.createElement('button');
        btnWantPlus.className = 'qty-btn';
        btnWantPlus.textContent = '+';
        btnWantPlus.addEventListener('click', (e) => {
            e.stopPropagation();
            adjustWant(item.id, 1);
        });
        group.appendChild(btnWantPlus);

        return group;
    }

    // --- Drag and Drop Logic ---
    let dragSrcEl = null;
    let dragType = null;

    // --- ITEM DRAG HANDLERS ---
    function handleItemDragStart(e) {
        e.stopPropagation();
        dragSrcEl = this;
        dragType = 'item';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
        this.classList.add('dragging');
    }

    function handleItemDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleItemDragEnter(e) {
        if (dragType === 'item') this.classList.add('over');
    }

    function handleItemDragLeave(e) {
        this.classList.remove('over');
    }

    function handleItemDrop(e) {
        if (e.stopPropagation) e.stopPropagation();

        if (dragType === 'item' && dragSrcEl !== this) {
            const draggedId = dragSrcEl.dataset.id;
            const targetId = this.dataset.id;
            const targetSectionId = this.dataset.sectionId;
            const isPlaceholder = this.dataset.type === 'item-placeholder' || this.dataset.type === 'section-header';

            reorderItems(draggedId, targetId, targetSectionId, isPlaceholder);
            renderList();
        }
        return false;
    }

    // --- SECTION DRAG HANDLERS ---
    function handleSectionDragStart(e) {
        if (dragType === 'item') return;

        // Prevent child items from triggering section drag (bubbling)
        if (e.target !== this && e.target.classList && !e.target.classList.contains('section-header') && !e.target.classList.contains('section-title')) {
            e.preventDefault();
            return;
        }

        e.stopPropagation();
        dragSrcEl = this;
        dragType = 'section';
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.dataset.id);
        this.classList.add('dragging-section');
    }

    function handleSectionDragOver(e) {
        if (e.preventDefault) e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleSectionDragEnter(e) {
        // Only highlight if dragging a section
        if (dragType === 'section' && this !== dragSrcEl) {
            this.classList.add('over-section');
        }
    }

    function handleSectionDragLeave(e) {
        this.classList.remove('over-section');
    }

    function handleSectionDrop(e) {
        if (e.stopPropagation) e.stopPropagation();

        if (dragType === 'section' && dragSrcEl !== this) {
            const draggedId = dragSrcEl.dataset.id;
            const targetId = this.dataset.id;
            reorderSections(draggedId, targetId);
            renderList();
        }
        return false;
    }

    // --- Shared Drag End ---
    function handleDragEnd(e) {
        this.classList.remove('dragging');
        this.classList.remove('dragging-section');

        document.querySelectorAll('.grocery-item, .add-item-row, .section-container').forEach(el => {
            el.classList.remove('over', 'over-section');
        });
        dragType = null;
        dragSrcEl = null;
    }

    function reorderItems(draggedId, targetId, targetSectionId, isPlaceholder) {
        const currentList = getCurrentList();
        const isHome = currentMode === 'home';
        const sectionIdKey = isHome ? 'homeSectionId' : 'shopSectionId';
        const indexKey = isHome ? 'homeIndex' : 'shopIndex';

        const draggedItem = currentList.items.find(i => i.id === draggedId);
        if (!draggedItem) return;

        const oldSectionId = draggedItem[sectionIdKey];

        // Ensure indices exist and sort old section
        let oldSectionItems = currentList.items.filter(i => i[sectionIdKey] === oldSectionId);
        oldSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));

        if (isPlaceholder) {
            draggedItem[sectionIdKey] = targetSectionId;
            let sectionItems = currentList.items.filter(i => i[sectionIdKey] === targetSectionId && i.id !== draggedId);
            sectionItems.push(draggedItem);
            sectionItems.forEach((item, idx) => { item[indexKey] = idx; });

            if (oldSectionId !== targetSectionId) {
                oldSectionItems = oldSectionItems.filter(i => i.id !== draggedId);
                oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
            }
            saveAppState();
            return;
        }

        const targetItem = currentList.items.find(i => i.id === targetId);
        if (!targetItem) return;

        const newSectionId = targetItem[sectionIdKey];
        draggedItem[sectionIdKey] = newSectionId;

        if (oldSectionId === newSectionId) {
            // Dragging within the SAME section
            const oldIdx = oldSectionItems.findIndex(i => i.id === draggedId);
            const newIdx = oldSectionItems.findIndex(i => i.id === targetId);

            if (oldIdx !== -1 && newIdx !== -1) {
                const [moved] = oldSectionItems.splice(oldIdx, 1);
                oldSectionItems.splice(newIdx, 0, moved);
                oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
            }
        } else {
            // Dragging ACROSS sections
            oldSectionItems = oldSectionItems.filter(i => i.id !== draggedId);
            oldSectionItems.forEach((item, idx) => { item[indexKey] = idx; });

            let newSectionItems = currentList.items.filter(i => i[sectionIdKey] === newSectionId && i.id !== draggedId);
            newSectionItems.sort((a, b) => (a[indexKey] || 0) - (b[indexKey] || 0));

            const insertIdx = newSectionItems.findIndex(i => i.id === targetId);
            if (insertIdx !== -1) {
                newSectionItems.splice(insertIdx, 0, draggedItem);
            } else {
                newSectionItems.push(draggedItem);
            }
            newSectionItems.forEach((item, idx) => { item[indexKey] = idx; });
        }

        saveAppState();
    }

    function reorderSections(draggedId, targetId) {
        const currentList = getCurrentList();
        const isHome = currentMode === 'home';
        const sectionArrayKey = isHome ? 'homeSections' : 'shopSections';
        const sections = currentList[sectionArrayKey];

        const oldIdx = sections.findIndex(s => s.id === draggedId);
        const newIdx = sections.findIndex(s => s.id === targetId);

        if (oldIdx === -1 || newIdx === -1) return;

        const [draggedSec] = sections.splice(oldIdx, 1);
        sections.splice(newIdx, 0, draggedSec);

        saveAppState();
    }

    // Initialize application mode based on DOM
    if (modeToggle) {
        if (modeToggle.checked) {
            currentMode = 'shop';
        } else {
            currentMode = 'home';
        }
    }

    init();
});
