import os
import re

files = [
    'tests/commit-animation.spec.js',
    'tests/double_tap_shop.test.js',
    'tests/flatten_list.spec.js',
    'tests/indentation.test.js',
    'tests/stepper_persistence.spec.js',
    'tests/undo_delete.spec.js',
    'tests/verify_shop_add_item.spec.js'
]

for filepath in files:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    # Add missing listId definition
    if 'listId' in content and 'const listId =' not in content:
        content = re.sub(r'(const state = {)', r"const listId = 'list-1';\n  \1", content)

    # Replace JSON.parse(stateJson) if I missed it
    content = content.replace("JSON.parse(stateJson)", "stateJson")

    with open(filepath, 'w') as f:
        f.write(content)

# Fix shop_stepper.spec.js specifically
with open('tests/shop_stepper.spec.js', 'r') as f:
    content = f.read()
content = content.replace("'editMode': False", "'editMode': false")
with open('tests/shop_stepper.spec.js', 'w') as f:
    f.write(content)

# Fix perf.spec.js
with open('tests/perf.spec.js', 'r') as f:
    content = f.read()
if 'items: items' in content and 'const items =' not in content:
    content = content.replace('const state = {', 'const items = [];\n    for(let i=0; i<100; i++) items.push({id: "item-"+i, text: "Item "+i, wantCount: 1, haveCount: 0, homeSectionId: "sec-h-def", shopSectionId: "sec-s-def", homeIndex: i, shopIndex: i, shopCompleted: false});\n    const state = {')
with open('tests/perf.spec.js', 'w') as f:
    f.write(content)
