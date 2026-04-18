import sys

content = open('public/app.js').read()

old_start = """        const startDragging = () => {
            if (draggedElement !== element) return;

            isDragStarted = true;
            document.documentElement.classList.add('is-dragging');
            void groceryList.offsetHeight;
            groceryList.classList.add('no-transition');
            document.body.style.overflow = 'hidden';

            // Initialize placeholder at starting position to prevent layout shift
            const phHeight = type === 'section' ? 50 : element.offsetHeight;
            placeholder.style.height = phHeight + 'px';
            element.before(placeholder);

            if (type === 'item') {
                flattenList();
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
                el.offsetHeight > 0 && // Only animate visible siblings
                el !== draggedElement &&
                el !== placeholder
            );"""

new_start = """        const startDragging = () => {
            if (draggedElement !== element) return;

            isDragStarted = true;
            document.documentElement.classList.add('is-dragging');

            if (type === 'item') {
                flattenList();
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

            // Force reflow after DOM changes to ensure correct visibility and layout for siblings
            void document.documentElement.offsetHeight;
            void groceryList.offsetHeight;

            groceryList.classList.add('no-transition');
            document.body.style.overflow = 'hidden';

            // Initialize placeholder at starting position to prevent layout shift
            const phHeight = type === 'section' ? 50 : element.offsetHeight;
            placeholder.style.height = phHeight + 'px';
            element.before(placeholder);

            // Performance: cache relevant siblings once at drag start
            relevantSiblings = Array.from(groceryList.children).filter(el =>
                el.nodeType === 1 &&
                !el.classList.contains('collapsed') &&
                el.offsetHeight > 0 &&
                el !== draggedElement &&
                el !== placeholder
            );"""

if old_start in content:
    content = content.replace(old_start, new_start)
    with open('public/app.js', 'w') as f:
        f.write(content)
    print("Successfully patched startDragging")
else:
    print("Could not find startDragging block")
