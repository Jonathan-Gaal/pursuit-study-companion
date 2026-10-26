# Changelog

## 0.1.2 — 2026-10-26

- Automatically check the publisher’s stable release on startup and every 30 minutes, without blocking the dashboard.
- Show installed and latest published versions, including when local source edits block installation.
- Refresh cached update status when returning to the app, with rate-limited background checks.
- Update runtime and testing dependencies to patched versions.
- Keep the fork-and-clone local app; no Electron installer or bundled browser.

## 0.1.1 — 2026-10-26

- Reject symlinked study notes explicitly on Windows as well as macOS/Linux.
- Use portable file URLs in release-command tests and check POSIX permissions only where supported.
- First publishable stable release after the cross-platform release gate caught Windows failures.

## 0.1.0 — 2026-10-26

- Read-only Pursuit curriculum sync with locally stored study notes and annotations.
- Native macOS sign-in and browser-to-native sign-in launch.
- Assignment search, self-test review, concept maps, weekly recaps, and Obsidian export.
- Top-navbar Settings gear, advanced setup, readable sidebar dates, and stable tab layouts.
- User-requested study expansions with optional confirmed-free providers.
- Stable versioned GitHub releases and exact-commit update approvals.

Personal credentials, notes, history, and runtime data are never distributed with releases.
