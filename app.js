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
    const itemInput = document.getElementById('item-input');
    const addBtn = document.getElementById('add-btn');
    const groceryList = document.getElementById('grocery-list');
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabelHome = document.getElementById('mode-label-home');
    const modeLabelShop = document.getElementById('mode-label-shop');
    const emptyState = document.getElementById('empty-state');
    const tabsList = document.getElementById('tabs-list');
    // const addTabBtn = document.getElementById('add-tab-btn'); // Removed static ref

    // Modal Elements
    const modalOverlay = document.getElementById('modal-overlay');
    const modalTitle = document.getElementById('modal-title');
    const modalInput = document.getElementById('modal-input');
    const modalCancelBtn = document.getElementById('modal-cancel-btn');
    const modalSaveBtn = document.getElementById('modal-save-btn');

    // Delete Modal Elements
    const deleteModalOverlay = document.getElementById('delete-modal-overlay');
    const deleteMatchName = document.getElementById('delete-match-name');
    const deleteInput = document.getElementById('delete-input');
    const deleteCancelBtn = document.getElementById('delete-cancel-btn');
    const deleteConfirmBtn = document.getElementById('delete-confirm-btn');

    // Modal State
    let currentModalCallback = null;
    let currentDeleteCallback = null;
    let currentDeleteTargetName = '';

    // --- Initialization ---
    function init() {
        if (storedState && storedState.lists && storedState.lists.length > 0) {
            appState = storedState;
        } else if (legacyItems && Array.isArray(legacyItems)) {
            // Migration: Convert legacy items to new structure
            const defaultListId = Date.now().toString();
            appState.lists = [{
                id: defaultListId,
                name: 'Grocery List',
                items: legacyItems
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
    addBtn.addEventListener('click', addItem);
    itemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addItem();
    });

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

    // addTabBtn listener moved to renderTabs


    // --- Modal Logic ---
    function showModal(title, initialValue, callback) {
        modalTitle.textContent = title;
        modalInput.value = initialValue || '';
        currentModalCallback = callback;
        modalOverlay.classList.add('visible');
        modalInput.focus();
        modalInput.select();
    }

    function hideModal() {
        modalOverlay.classList.remove('visible');
        currentModalCallback = null;
    }

    modalCancelBtn.addEventListener('click', hideModal);

    modalSaveBtn.addEventListener('click', () => {
        const val = modalInput.value.trim();
        if (currentModalCallback) {
            currentModalCallback(val);
        }
        hideModal();
    });

    modalInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = modalInput.value.trim();
            if (currentModalCallback) {
                currentModalCallback(val);
            }
            hideModal();
        }
    });

    // --- Delete Modal Logic ---
    function showDeleteModal(listName, callback) {
        currentDeleteTargetName = listName;
        currentDeleteCallback = callback;
        deleteMatchName.textContent = listName;
        deleteInput.value = '';
        deleteInput.placeholder = `Type "${listName}" to confirm`;
        deleteConfirmBtn.disabled = true;

        deleteModalOverlay.classList.add('visible');
        deleteInput.focus();
    }

    function hideDeleteModal() {
        deleteModalOverlay.classList.remove('visible');
        currentDeleteCallback = null;
        currentDeleteTargetName = '';
    }

    deleteInput.addEventListener('input', () => {
        if (deleteInput.value === currentDeleteTargetName) {
            deleteConfirmBtn.disabled = false;
        } else {
            deleteConfirmBtn.disabled = true;
        }
    });

    deleteConfirmBtn.addEventListener('click', () => {
        if (currentDeleteCallback) {
            currentDeleteCallback();
        }
        hideDeleteModal();
    });

    deleteCancelBtn.addEventListener('click', hideDeleteModal);

    deleteInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !deleteConfirmBtn.disabled) {
            if (currentDeleteCallback) {
                currentDeleteCallback();
            }
            hideDeleteModal();
        }
    });

    // --- Helper ---
    function getCurrentList() {
        return appState.lists.find(l => l.id === appState.currentListId);
    }

    // --- List Management ---
    function addNewList(name) {
        const newList = {
            id: Date.now().toString(),
            name: name,
            items: []
        };
        appState.lists.push(newList);
        appState.currentListId = newList.id;
        saveAppState();
        renderTabs();
        renderList();
    }

    function switchList(id) {
        appState.currentListId = id;
        saveAppState();
        renderTabs();
        renderList();
    }

    function renameList(id) {
        const list = appState.lists.find(l => l.id === id);
        if (!list) return;

        showModal('Rename List', list.name, (newName) => {
            if (newName) {
                list.name = newName;
                saveAppState();
                renderTabs();
            }
        });
    }

    function renameItem(id) {
        const currentList = getCurrentList();
        const item = currentList.items.find(i => i.id === id);
        if (!item) return;

        showModal('Rename Item', item.text, (newName) => {
            if (newName && newName.trim() !== '') {
                item.text = newName.trim();
                saveAppState();
                renderList();
            }
        });
    }

    function deleteList(id) {
        if (appState.lists.length <= 1) {
            alert("You must have at least one list.");
            return;
        }

        const list = appState.lists.find(l => l.id === id);
        if (!list) return;

        showDeleteModal(list.name, () => {
            appState.lists = appState.lists.filter(l => l.id !== id);
            if (appState.currentListId === id) {
                appState.currentListId = appState.lists[0].id;
            }
            saveAppState();
            renderTabs();
            renderList();
        });
    }

    // --- Core Functions ---

    function addItem() {
        const text = itemInput.value.trim();
        if (!text) return;

        const currentList = getCurrentList();
        const newItem = {
            id: Date.now().toString(),
            text: text,
            // Initialize indices for both modes at the end of the list
            homeIndex: currentList.items.length,
            shopIndex: currentList.items.length,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
        };

        currentList.items.push(newItem);
        saveAppState();
        renderList();
        itemInput.value = '';
        itemInput.focus();
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
        const inputGroup = document.querySelector('.input-group');
        if (currentMode === 'home') {
            modeLabelHome.classList.add('active');
            modeLabelShop.classList.remove('active');
            document.documentElement.style.setProperty('--primary-color', '#4a90e2');
            inputGroup.style.display = 'flex';
        } else {
            modeLabelHome.classList.remove('active');
            modeLabelShop.classList.add('active');
            document.documentElement.style.setProperty('--primary-color', '#eebb4d'); // Switch accent color
            inputGroup.style.display = 'none';
        }
    }

    function saveAppState() {
        localStorage.setItem('grocery-app-state', JSON.stringify(appState));
        updateEmptyState();
    }

    function saveMode() {
        localStorage.setItem('grocery-mode', currentMode);
    }

    function updateEmptyState() {
        const currentList = getCurrentList();
        if (!currentList || currentList.items.length === 0) {
            emptyState.classList.add('visible');
            groceryList.style.display = 'none';
        } else {
            emptyState.classList.remove('visible');
            groceryList.style.display = 'block'; // Make sure this is 'block' not valid syntax error
        }
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

            // Long press or something for delete? Or maybe just right click
            tab.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                deleteList(list.id);
            });

            tabsList.appendChild(tab);
        });

        // Add the "+" button at the end
        const addBtn = document.createElement('button');
        addBtn.id = 'add-tab-btn';
        addBtn.className = 'add-tab-btn';
        addBtn.innerHTML = '<i class="fas fa-plus"></i>';
        addBtn.title = "Create New List";
        addBtn.addEventListener('click', () => {
            showModal('Create New List', 'New List', (name) => {
                if (name) addNewList(name);
            });
        });
        tabsList.appendChild(addBtn);
    }

    function renderList() {
        groceryList.innerHTML = '';
        const currentList = getCurrentList();
        if (!currentList) return;

        let visibleItems = [...currentList.items];

        // Filter for Shop Mode: Only show items needed or currently in basket
        if (currentMode === 'shop') {
            visibleItems = visibleItems.filter(item => {
                const toBuy = Math.max(0, item.wantCount - item.haveCount);
                return toBuy > 0 || item.shopCompleted;
            });
        }

        // Sort items based on current mode's index
        const sortedItems = visibleItems.sort((a, b) => {
            const indexKey = currentMode === 'home' ? 'homeIndex' : 'shopIndex';
            return a[indexKey] - b[indexKey];
        });

        sortedItems.forEach(item => {
            const li = document.createElement('li');
            li.className = `grocery-item ${item.shopCompleted && currentMode === 'shop' ? 'completed' : ''}`;
            li.draggable = true;
            li.dataset.id = item.id;

            // Clear for safe DOM creation
            li.innerHTML = '';

            if (currentMode === 'home') {
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

                // Have Group
                const haveGroup = createQtyGroup('Have', item.haveCount, (d) => adjustHave(item.id, d));
                controls.appendChild(haveGroup);

                // Want Group
                const wantGroup = createQtyGroup('Want', item.wantCount, (d) => adjustWant(item.id, d));
                controls.appendChild(wantGroup);

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

            // Only show delete button in Home mode
            if (currentMode === 'home') {
                const delBtn = document.createElement('button');
                delBtn.className = 'delete-btn';
                delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteItem(item.id);
                });
                li.appendChild(delBtn);
            }


            // Drag events
            li.addEventListener('dragstart', handleDragStart);
            li.addEventListener('dragover', handleDragOver);
            li.addEventListener('drop', handleDrop);
            li.addEventListener('dragenter', handleDragEnter);
            li.addEventListener('dragleave', handleDragLeave);
            li.addEventListener('dragend', handleDragEnd);

            groceryList.appendChild(li);
        });

        updateEmptyState();
    }

    function createQtyGroup(label, val, callback) {
        const group = document.createElement('div');
        group.className = 'qty-group';

        const spanLabel = document.createElement('span');
        spanLabel.className = 'qty-label';
        spanLabel.textContent = label;
        group.appendChild(spanLabel);

        const btnMinus = document.createElement('button');
        btnMinus.className = 'qty-btn';
        btnMinus.textContent = '-';
        btnMinus.addEventListener('click', () => callback(-1));
        group.appendChild(btnMinus);

        const spanVal = document.createElement('span');
        spanVal.className = 'qty-val';
        spanVal.textContent = val;
        group.appendChild(spanVal);

        const btnPlus = document.createElement('button');
        btnPlus.className = 'qty-btn';
        btnPlus.textContent = '+';
        btnPlus.addEventListener('click', () => callback(1));
        group.appendChild(btnPlus);

        return group;
    }

    // --- Drag and Drop Logic ---
    let dragSrcEl = null;

    function handleDragStart(e) {
        dragSrcEl = this;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', this.innerHTML);
        this.classList.add('dragging');
    }

    function handleDragOver(e) {
        if (e.preventDefault) {
            e.preventDefault(); // Necessary. Allows us to drop.
        }
        e.dataTransfer.dropEffect = 'move';
        return false;
    }

    function handleDragEnter(e) {
        this.classList.add('over');
    }

    function handleDragLeave(e) {
        this.classList.remove('over');
    }

    function handleDrop(e) {
        if (e.stopPropagation) {
            e.stopPropagation(); // stops the browser from redirecting.
        }

        if (dragSrcEl !== this) {
            // Get IDs
            const draggedId = dragSrcEl.dataset.id;
            const targetId = this.dataset.id;

            // Reorder in array
            reorderItems(draggedId, targetId);

            // Re-render
            renderList();
        }

        return false;
    }

    function handleDragEnd(e) {
        this.classList.remove('dragging');
        // Clean up classes
        [].forEach.call(groceryList.querySelectorAll('.grocery-item'), function (col) {
            col.classList.remove('over');
        });
    }

    function reorderItems(draggedId, targetId) {
        const currentList = getCurrentList();
        // Find current indices in the *sorted* list we are viewing
        const indexKey = currentMode === 'home' ? 'homeIndex' : 'shopIndex';

        // We need to work with the sorted array to know "visual" positions
        let sortedItems = [...currentList.items].sort((a, b) => a[indexKey] - b[indexKey]);

        const fromIndex = sortedItems.findIndex(i => i.id === draggedId);
        const toIndex = sortedItems.findIndex(i => i.id === targetId);

        if (fromIndex < 0 || toIndex < 0) return;

        // Create a new array with the move applied
        const itemToMove = sortedItems[fromIndex];
        sortedItems.splice(fromIndex, 1);
        sortedItems.splice(toIndex, 0, itemToMove);

        // Now update the actual 'homeIndex' or 'shopIndex' on ALL items 
        // to reflect their new visual order.
        // This effectively "saves" the new order.
        sortedItems.forEach((item, index) => {
            // Find the original item reference in the main 'items' array and update it
            const originalItem = currentList.items.find(i => i.id === item.id);
            if (originalItem) {
                originalItem[indexKey] = index;
            }
        });

        saveAppState();
    }

    init();
});
