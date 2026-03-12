
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
                    document.querySelectorAll('.reorder-active').forEach(n => n.classList.remove('reorder-active'));
                } else {
                    // Enter reorder mode for this section
                    activeReorderId = section.id;
                    groceryList.classList.add('reorder-mode-active');
                }
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
