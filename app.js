document.addEventListener('DOMContentLoaded', () => {
    // --- State ---
    let items = JSON.parse(localStorage.getItem('grocery-items')) || [];
    let currentMode = localStorage.getItem('grocery-mode') || 'home'; // 'home' or 'shop'

    // --- DOM Elements ---
    const itemInput = document.getElementById('item-input');
    const addBtn = document.getElementById('add-btn');
    const groceryList = document.getElementById('grocery-list');
    const modeToggle = document.getElementById('mode-toggle');
    const modeLabelHome = document.getElementById('mode-label-home');
    const modeLabelShop = document.getElementById('mode-label-shop');
    const emptyState = document.getElementById('empty-state');

    // --- Initialization ---
    function init() {
        // Migration: Ensure all items have quantity fields
        let dataChanged = false;
        items.forEach(item => {
            if (item.haveCount === undefined) { item.haveCount = 0; dataChanged = true; }
            if (item.wantCount === undefined) { item.wantCount = 1; dataChanged = true; }
            if (item.shopCompleted === undefined) { item.shopCompleted = false; dataChanged = true; }
            // Remove old 'completed' property if it exists, as it's replaced by shopCompleted
            if (item.completed !== undefined) { delete item.completed; dataChanged = true; }
        });
        if (dataChanged) saveItems();

        modeToggle.checked = currentMode === 'shop';
        updateModeUI();
        renderList();
    }

    // --- Event Listeners ---
    addBtn.addEventListener('click', addItem);
    itemInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addItem();
    });

    modeToggle.addEventListener('change', () => {
        currentMode = modeToggle.checked ? 'shop' : 'home';
        saveMode();
        updateModeUI();
        renderList(); // Re-render to sort by new mode
    });

    // --- Core Functions ---

    function addItem() {
        const text = itemInput.value.trim();
        if (!text) return;

        const newItem = {
            id: Date.now().toString(),
            text: text,
            // Initialize indices for both modes at the end of the list
            homeIndex: items.length,
            shopIndex: items.length,
            haveCount: 0,
            wantCount: 1,
            shopCompleted: false
        };

        items.push(newItem);
        saveItems();
        renderList();
        itemInput.value = '';
        itemInput.focus();
    }

    function toggleShopCompleted(id) {
        const item = items.find(i => i.id === id);
        if (item) {
            item.shopCompleted = !item.shopCompleted;
            saveItems();
            renderList();
        }
    }

    function deleteItem(id) {
        items = items.filter(i => i.id !== id);
        saveItems();
        renderList();
    }

    function adjustHave(id, delta) {
        const item = items.find(i => i.id === id);
        if (item) {
            item.haveCount = Math.max(0, item.haveCount + delta);
            saveItems();
            renderList();
        }
    }

    function adjustWant(id, delta) {
        const item = items.find(i => i.id === id);
        if (item) {
            item.wantCount = Math.max(0, item.wantCount + delta);
            saveItems();
            renderList();
        }
    }

    function updateModeUI() {
        if (currentMode === 'home') {
            modeLabelHome.classList.add('active');
            modeLabelShop.classList.remove('active');
            document.documentElement.style.setProperty('--primary-color', '#4a90e2');
        } else {
            modeLabelHome.classList.remove('active');
            modeLabelShop.classList.add('active');
            document.documentElement.style.setProperty('--primary-color', '#eebb4d'); // Switch accent color
        }
    }

    function saveItems() {
        localStorage.setItem('grocery-items', JSON.stringify(items));
        updateEmptyState();
    }

    function saveMode() {
        localStorage.setItem('grocery-mode', currentMode);
    }

    function updateEmptyState() {
        if (items.length === 0) {
            emptyState.classList.add('visible');
            groceryList.style.display = 'none';
        } else {
            emptyState.classList.remove('visible');
            groceryList.style.display = 'block';
        }
    }

    function renderList() {
        groceryList.innerHTML = '';

        // Sort items based on current mode's index
        const sortedItems = [...items].sort((a, b) => {
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
                info.innerHTML = `<span class="item-text">${item.text}</span>`;
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
                details.appendChild(textSpan);

                const toBuy = Math.max(0, item.wantCount - item.haveCount);
                const badge = document.createElement('span');
                badge.className = `buy-badge ${toBuy > 0 ? 'needed' : 'stocked'}`;
                badge.textContent = `Buy: ${toBuy}`;
                details.appendChild(badge);

                content.appendChild(details);
                li.appendChild(content);
            }

            const delBtn = document.createElement('button');
            delBtn.className = 'delete-btn';
            delBtn.innerHTML = '<i class="fas fa-trash"></i>';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteItem(item.id);
            });
            li.appendChild(delBtn);


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
        // Find current indices in the *sorted* list we are viewing
        const indexKey = currentMode === 'home' ? 'homeIndex' : 'shopIndex';

        // We need to work with the sorted array to know "visual" positions
        let sortedItems = [...items].sort((a, b) => a[indexKey] - b[indexKey]);

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
            const originalItem = items.find(i => i.id === item.id);
            if (originalItem) {
                originalItem[indexKey] = index;
            }
        });

        saveItems();
    }

    init();
});
