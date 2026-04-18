import sys

with open('public/app.js', 'r') as f:
    content = f.read()

# 1. Ensure relevantSiblings are calculated reliably
old_sib = """            // Performance: cache relevant siblings once at drag start
            relevantSiblings = Array.from(groceryList.children).filter(el =>
                el.nodeType === 1 &&
                !el.classList.contains('collapsed') &&
                el.offsetHeight > 0 &&
                el !== draggedElement &&
                el !== placeholder
            );"""

new_sib = """            // Performance: cache relevant siblings once at drag start
            // Use a more robust filter that doesn't rely solely on offsetHeight which can be buggy during DOM moves
            relevantSiblings = Array.from(groceryList.children).filter(el => {
                if (el.nodeType !== 1 || el === draggedElement || el === placeholder) return false;
                if (el.classList.contains('collapsed') || el.classList.contains('section-container')) return false;
                // Elements with display: none should be excluded, but others (even if transitioning) should stay
                return getComputedStyle(el).display !== 'none';
            });"""

if old_sib in content:
    content = content.replace(old_sib, new_sib)

# 2. Ensure placeholder always has a height and force layout before sibling capture
old_start = "            // Initialize placeholder at starting position\n            const phHeight = type === 'section' ? 50 : element.offsetHeight;\n            placeholder.style.height = phHeight + 'px';\n            element.before(placeholder);"

new_start = "            // Initialize placeholder at starting position with a fallback height\n            const phHeight = Math.max(50, element.offsetHeight);\n            placeholder.style.height = phHeight + 'px';\n            element.before(placeholder);\n\n            // Force another reflow to ensure placeholder and siblings are correctly positioned in the parent\n            void groceryList.offsetHeight;"

if old_start in content:
    content = content.replace(old_start, new_start)

with open('public/app.js', 'w') as f:
    f.write(content)
