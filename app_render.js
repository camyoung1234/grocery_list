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
