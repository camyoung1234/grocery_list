import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f:
        content = f.read()

    # 1. Ensure mockFirebase import
    if "mockFirebase" not in content:
        content = "const { mockFirebase, setMockState } = require('./mockFirebase');\n" + content

    # 2. Fix duplicated mockFirebase calls
    content = re.sub(r"(await mockFirebase\(page\);(\s+)?)+", "await mockFirebase(page);\n", content)

    # 3. Ensure mockFirebase is called before the first goto
    # If there is a beforeEach, check there.
    if "test.beforeEach" in content:
        # Find first goto in beforeEach and insert before it if not present
        match = re.search(r"test\.beforeEach\(async\s*\(\{\s*page\s*\}\)\s*=>\s*\{", content)
        if match:
            # Check if mockFirebase is already in the block
            block_start = match.end()
            # find end of block (simplified)
            if "await mockFirebase(page);" not in content[block_start:block_start+200]:
                content = content[:block_start] + "\n  await mockFirebase(page);" + content[block_start:]
    else:
        # Check first test or global
        if "await mockFirebase(page);" not in content:
            content = content.replace("await page.goto", "await mockFirebase(page);\n  await page.goto")

    # 4. Replace localStorage evaluations with setMockState
    # This regex looks for evaluate blocks that set grocery-app-state
    def sub_eval(m):
        inner = m.group(1)
        # Extract state
        state_match = re.search(r"const (state|appState) = (\{.*?\});", inner, re.DOTALL)
        mode_match = re.search(r"localStorage\.setItem\('grocery-mode', '(.*?)'\)", inner)
        edit_mode_match = re.search(r"localStorage\.setItem\('grocery-edit-mode', '(.*?)'\)", inner)

        res = ""
        if state_match:
            var_name = state_match.group(1)
            state_val = state_match.group(2)
            # Ensure listId is defined if used
            if "listId" in state_val and "const listId =" not in state_val and "const listId =" not in inner and "const listId =" not in content:
                res += "const listId = 'list-1';\n    "

            res += f"const {var_name} = {state_val};\n    "
            updates = []
            if mode_match: updates.append(f"mode: '{mode_match.group(1)}'")
            if edit_mode_match: updates.append(f"editMode: {edit_mode_match.group(1)}")

            if updates:
                res += f"await setMockState(page, {{ ...{var_name}, {', '.join(updates)} }});"
            else:
                res += f"await setMockState(page, {var_name});"
        else:
            updates = []
            if mode_match: updates.append(f"mode: '{mode_match.group(1)}'")
            if edit_mode_match: updates.append(f"editMode: {edit_mode_match.group(1)}")
            if updates:
                res = f"await setMockState(page, {{ {', '.join(updates)} }});"
        return res

    content = re.sub(r"await page\.evaluate\(\(\) => \{(.*?localStorage\.setItem\('grocery-app-state'.*?)\}\);", sub_eval, content, flags=re.DOTALL)
    content = re.sub(r"await page\.evaluate\(\(\) => \{(.*?localStorage\.setItem\('grocery-mode'.*?)\}\);", sub_eval, content, flags=re.DOTALL)
    content = re.sub(r"await page\.evaluate\(\(\) => \{(.*?localStorage\.setItem\('grocery-edit-mode'.*?)\}\);", sub_eval, content, flags=re.DOTALL)

    # 5. Remove page.reload() calls that follow setMockState immediately,
    # but keep them if they are at the start of a test after setting up storage (though we don't use storage anymore)
    # Actually, let's just remove reloads that were intended to refresh state from localStorage.
    content = re.sub(r"await setMockState\(page,.*?\);\s+await page\.reload\(\);", lambda m: m.group(0).split(';')[0] + ';', content, flags=re.DOTALL)

    # 6. Replace localStorage.getItem
    content = content.replace("localStorage.getItem('grocery-app-state')", "window.__MOCK_FIREBASE_STATE__")
    content = content.replace("localStorage.getItem('grocery-edit-mode')", "window.__MOCK_FIREBASE_STATE__.editMode")

    # 7. Clean up any remaining localStorage.clear() or setItem
    content = re.sub(r"await page\.evaluate\(\(\) => localStorage\.clear\(\)\);", "", content)
    content = re.sub(r"localStorage\.setItem\(.*?\);", "", content)
    content = re.sub(r"localStorage\.removeItem\(.*?\);", "", content)

    # 8. Fix listId issues (again)
    if "listId" in content and "const listId =" not in content:
        # try to insert before state definition
        content = re.sub(r"const state =", "const listId = 'list-1';\n  const state =", content)

    with open(filepath, 'w') as f:
        f.write(content)

test_files = [f for f in os.listdir('tests') if f.endswith('.js') or f.endswith('.spec.js')]
for f in test_files:
    if f != 'mockFirebase.js':
        fix_file(os.path.join('tests', f))
