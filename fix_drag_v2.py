import sys

with open('public/app.js', 'r') as f:
    lines = f.readlines()

out = []
i = 0
found = False
while i < len(lines):
    if "const startDragging = () => {" in lines[i]:
        out.append(lines[i])
        out.append("            if (draggedElement !== element) return;\n")
        out.append("            \n")
        out.append("            isDragStarted = true;\n")
        out.append("            document.documentElement.classList.add('is-dragging');\n")
        out.append("            \n")
        out.append("            if (type === 'item') {\n")
        out.append("                flattenList();\n")
        out.append("            }\n")
        out.append("\n")
        out.append("            if (type === 'section') {\n")
        out.append("                document.querySelectorAll('.section-items-list').forEach(el => {\n")
        out.append("                    el.innerHTML = '';\n")
        out.append("                    el.classList.add('collapsed');\n")
        out.append("                });\n")
        out.append("                document.querySelectorAll('.add-item-row').forEach(el => {\n")
        out.append("                    el.classList.add('collapsed');\n")
        out.append("                });\n")
        out.append("            }\n")
        out.append("\n")
        out.append("            // Force reflow after DOM changes\n")
        out.append("            void document.documentElement.offsetHeight;\n")
        out.append("            void groceryList.offsetHeight;\n")
        out.append("\n")
        out.append("            groceryList.classList.add('no-transition');\n")
        out.append("            document.body.style.overflow = 'hidden';\n")
        out.append("\n")
        out.append("            // Initialize placeholder at starting position\n")
        out.append("            const phHeight = type === 'section' ? 50 : element.offsetHeight;\n")
        out.append("            placeholder.style.height = phHeight + 'px';\n")
        out.append("            element.before(placeholder);\n")
        out.append("\n")
        out.append("            // Performance: cache relevant siblings once at drag start\n")
        out.append("            relevantSiblings = Array.from(groceryList.children).filter(el => \n")
        out.append("                el.nodeType === 1 && \n")
        out.append("                !el.classList.contains('collapsed') && \n")
        out.append("                el.offsetHeight > 0 && \n")
        out.append("                el !== draggedElement && \n")
        out.append("                el !== placeholder\n")
        out.append("            );\n")

        # Skip until the original relevantSiblings assignment is over
        while i < len(lines) and "relevantSiblings = Array.from(groceryList.children).filter" not in lines[i]:
            i += 1
        while i < len(lines) and "placeholder" not in lines[i]:
            i += 1
        while i < len(lines) and ");" not in lines[i]:
            i += 1
        i += 1
        found = True
        continue
    out.append(lines[i])
    i += 1

if found:
    with open('public/app.js', 'w') as f:
        f.writelines(out)
    print("Patched successfully")
else:
    print("StartDragging not found")
