# Agent Instructions

This document provides information about the codebase structure, testing framework, and development guidelines for this repository.

## Codebase Structure

- `public/`: Contains the frontend assets.
  - `index.html`: The main entry point of the web application.
  - `style.css`: The global stylesheet.
  - `app.js`: The main application logic, implemented as an ES module. It handles UI rendering, state management, and Firebase integration via CDN imports.
- `tests/`: Contains Playwright E2E tests for various features like drag-and-drop, shop mode, and sync.
- Root Directory: Contains configuration files:
  - `package.json`: Project dependencies and scripts.
  - `wrangler.toml`: Configuration for Cloudflare Wrangler (used for local development and deployment).
  - `playwright.config.js`: Configuration for the Playwright testing framework.

## Testing Framework

- **Framework**: [Playwright](https://playwright.dev/) is used for end-to-end testing.
- **Setup**:
  - `npm install`: Install dependencies.
  - `npx playwright install-deps`: Install OS dependencies for Playwright.
  - `npx playwright install`: Install Playwright browsers.
- **Execution**:
  - Start the development server: `npx wrangler dev --assets public --port 3000`
  - Run tests: `npx playwright test`
- **Firebase Mocking**: The application requires Firebase for authentication and Firestore. In the testing environment, Firebase CDN imports are mocked using `page.route` in `tests/test-utils.js` (or similar mocking files like `tests/mockFirebase.js`) to provide a consistent, authenticated state without requiring real network requests.

## Files to NEVER Commit

The following files and patterns are excluded via `.gitignore` and should never be committed to the repository:

- **Log files**: Any file with a `.log` extension (e.g., `server.log`, `wrangler.log`, `server_log.txt`, `dev_server.log`).
- **Test artifacts**:
  - `test-results/` directory.
  - Screenshot files (`*.png`) generated during testing or debugging (e.g., `edit-mode-large.png`, `verify-ui-edit-mode.png`).
- **Local state/cache**:
  - `.last-run.json`
  - `.wrangler/` directory.
  - `node_modules/` directory.
- **Secrets/Credentials**: Any files containing sensitive information (e.g., `gha-creds-*.json`).
