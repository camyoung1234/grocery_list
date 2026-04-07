import os
import re

files = [
    'tests/create_sparks.spec.js',
    'tests/flatten_list.spec.js',
    'tests/perf.spec.js',
    'tests/double_tap_shop.test.js',
    'tests/stepper_persistence.spec.js',
    'tests/verify_shop_add_item.spec.js',
    'tests/delete_list.spec.js',
    'tests/repro_selection_x.spec.js',
    'tests/commit-animation.spec.js',
    'tests/inline_item_edit.spec.js',
    'tests/shop_stepper.spec.js',
    'tests/undo_delete.spec.js',
    'tests/indentation.test.js'
]

for filepath in files:
    if not os.path.exists(filepath):
        continue
    with open(filepath, 'r') as f:
        content = f.read()

    # Ensure mockFirebase is required
    if "require('./mockFirebase')" not in content:
        content = "const { mockFirebase, setMockState } = require('./mockFirebase');\n" + content

    # Ensure mockFirebase(page) is called before goto
    if "await mockFirebase(page);" not in content:
        content = content.replace("await page.goto", "await mockFirebase(page);\n  await page.goto")

    # Replace localStorage.setItem in evaluate
    # Pattern: await page.evaluate(() => { ... localStorage.setItem('grocery-app-state', JSON.stringify(state)); ... });
    # This is tricky with regex if there are multiple setItem calls.

    # Simpler approach: find the state object and the setItem calls, and replace the whole evaluate block if possible,
    # or just replace the inner part.

    # We'll try to find the evaluate block that contains localStorage.setItem
    def replace_evaluate(match):
        inner = match.group(1)
        # Extract state variable if it exists
        state_match = re.search(r'const state = ({.*?});', inner, re.DOTALL)
        if not state_match:
             state_match = re.search(r'const appState = ({.*?});', inner, re.DOTALL)

        mode_match = re.search(r"localStorage.setItem\('grocery-mode', '(.*?)'\);", inner)
        edit_mode_match = re.search(r"localStorage.setItem\('grocery-edit-mode', '(.*?)'\);", inner)

        new_inner = ""
        if state_match:
            new_inner += f"const state = {state_match.group(1)};\n"
            updates = []
            if mode_match: updates.append(f"mode: '{mode_match.group(1)}'")
            if edit_mode_match: updates.append(f"editMode: {edit_mode_match.group(1)}")

            if updates:
                new_inner += f"await setMockState(page, {{ ...state, {', '.join(updates)} }});"
            else:
                new_inner += "await setMockState(page, state);"
        else:
            # Handle cases where state isn't defined inside or is different
            updates = {}
            if mode_match: updates['mode'] = mode_match.group(1)
            if edit_mode_match: updates['editMode'] = edit_mode_match.group(1) == 'true'
            if updates:
                new_inner = f"await setMockState(page, {updates});"

        return new_inner

    # Find await page.evaluate(() => { ... localStorage.setItem ... });
    content = re.sub(r'await page\.evaluate\(\(\) => \{(.*?localStorage\.setItem.*?)\}\);', replace_evaluate, content, flags=re.DOTALL)

    # Handle localStorage.getItem
    content = content.replace("localStorage.getItem('grocery-app-state')", "window.__MOCK_FIREBASE_STATE__")
    content = content.replace("localStorage.getItem('grocery-edit-mode')", "window.__MOCK_FIREBASE_STATE__.editMode")

    with open(filepath, 'w') as f:
        f.write(content)
