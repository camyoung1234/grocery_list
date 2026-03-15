from playwright.sync_api import Page, expect, sync_playwright
import time

def test_full_page(page: Page):
    page.goto("http://localhost:3000")
    page.wait_for_selector('#toolbar-mode')

    # Take full page screenshot
    page.screenshot(path="verification/full-page-home-v4.png")

    # Click toggle to switch to Shop mode
    page.click('#toolbar-mode')

    # Wait for transition
    time.sleep(0.5)

    # Take full page screenshot
    page.screenshot(path="verification/full-page-shop-v4.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Use a mobile-like viewport
        page = browser.new_page(viewport={'width': 375, 'height': 667})
        try:
            test_full_page(page)
        finally:
            browser.close()
