# Handoff: Pursuit sign-in and simpler navigation

Use this document to reproduce the changes from this session in the other version of the app. The source implementation is this `pursuit-study-companion` directory. Adapt individual changes to the destination; do not replace entire files or copy local student data.

## Requested result

1. Let macOS users sign in to Pursuit in a native window instead of pasting a token. Verify and save the session locally, then start read-only sync.
2. Make the sign-in button work from a browser dashboard too: it opens the native app's sign-in window.
3. In Settings, show account sign-in followed immediately by app updates. Put token/configuration fields and manual day import under a collapsed **Advanced setup** section.
4. Replace the **Search** tab with a persistent search bar above the tabs, placeholder **Search your assignments…**.
5. Replace the **Settings** tab text with a gear icon aligned to the right. Retain a Settings tooltip and accessible name.

## Important destination differences

The other version inspected in this session is the parent `pursuit-learning-agent` project. It already has native macOS sign-in, `DashboardAuth`, token storage/status helpers, and capture tests. Its dashboard uses port **4781**; this companion defaults to **4782**. Preserve the destination's port, app identity, existing features, and launcher conventions.

The parent originally stores the capture helper at `src/macos/captureToken.js`; this companion stores it at `src/pursuit/captureToken.js`. Match Swift's helper path and the tests to whichever location the destination uses.

There were already unrelated uncommitted changes when this session began, including study expansion, catch-up, resources, and export work. The whole working-tree diff is not a patch for this handoff. Do not copy all modified/untracked files or port the companion's study-only API over the other app's API.

## Sign-in implementation

Reference files:

- `src/macos/App.swift`
- `src/pursuit/captureToken.js`
- `src/pursuit/tokenStatus.ts`
- `src/pursuit/tokenStore.ts`
- `src/dashboard/auth.ts`
- `src/dashboard/api.ts`
- `src/dashboard/server.ts`
- `scripts/start-macos.ts`
- `src/start.ts` and `package.json`

### Native window and credential boundary

The local dashboard sends `connectPursuit` through the WKWebView message bridge. Validate the main frame, webview identity, local host, scheme, and configured dashboard port before opening sign-in.

The sign-in window loads `https://platform.pursuit.org/learning` with an ephemeral website data store. The user signs in manually. The helper observes successful authenticated fetch/XHR requests from that platform to the existing known API origin, `https://test-pilot-server.onrender.com`. It reports a bounded JWT once through `pursuitToken`; it does not collect passwords or guess login/refresh endpoints. Keep its origin and token-format checks.

The native receiver validates the platform origin and sign-in webview identity, then sends JSON `{ token }` to the local `POST /api/auth/token`. Its URLSession refuses redirects. Close the sign-in window and dispatch `pursuit-auth-updated` only after the local receiver reports success. On failure, display an error; close/reopen sign-in to retry.

`DashboardAuth.accept` rejects malformed or expired tokens, verifies with an existing allowlisted Pursuit GET, and only then persists. Verification prefers a non-protected task from saved live history. This companion adds a fresh-setup fallback: read definitions for the first configured verified day ID and exact cohort. It cannot verify a fresh installation without those anchors.

`saveLocalToken` preserves the other `.env` contents, rejects symlinks, writes an exclusive temporary file with mode `0600`, then renames it. Never return or log credentials or raw remote errors. JWT expiry is only a hint; successful server verification establishes connection status.

### Local API and sync integration

`dashboardApi` accepts optional auth dependencies and includes sanitized connection status in `/api/status` without blocking dashboard readiness on remote verification.

- `POST /api/auth/token`: local JSON only; reject unknown fields, query strings, and active operations. Verify/save, then invoke `afterSignIn`.
- `POST /api/auth/check`: explicitly reverify the saved connection.
- `POST /api/auth/open`: empty local POST only; launch the native sign-in window or return an actionable unsupported-platform/launch error.

The server wires `afterSignIn` to the existing catch-up service's `request(true)`. Reuse the destination's sync service and busy/locking rules; do not introduce a second competing sync implementation. Preserve saved study notes.

For browser clicks, `/api/auth/open` invokes `/usr/bin/open` with the generated app path and `--args --sign-in`. Native startup honors `--sign-in`. `applicationShouldHandleReopen` brings the app forward and opens sign-in when it is already running. The UI displays launch feedback next to the button instead of only at the top of the page.

The destination already has much of this flow: merge the missing browser-launch behavior and any needed fresh-setup verification rather than replacing its auth stack.

### Launcher changes specific to this companion

- `npm start`: on macOS, starts/reuses the local server and builds/opens the native wrapper; elsewhere opens the browser.
- `npm run start:browser`: retains browser launch on macOS.
- `npm run start:macos`: builds and opens the wrapper directly.
- `node --import tsx scripts/start-macos.ts --build-only`: compiles without opening.

The build script writes an Info.plist carrying the project root, actual Node executable, and configured dashboard port. It compiles Swift with Cocoa/WebKit and ad-hoc signs the local `.app`. Generated `.app` and `.runtime` cache stay ignored. Xcode Command Line Tools are required. This is not a standalone installer.

Do not transplant this launcher if the destination already has an established native packaging/launch flow. Preserve its identity and startup behavior.

## Settings simplification

Reference: the Settings branch in `dashboard/app/page.tsx`.

Visible order:

1. Account heading, short local-storage explanation, connection status, sign-in button, inline sign-in feedback.
2. App updates, last check, check button, exact-commit update/restart action when available.
3. Collapsed `<details className="advanced-settings">` with summary **Advanced setup**.
4. Offline example controls.

Move the existing account configuration form and specific-day import form inside Advanced setup. Keep their handlers intact. Avoid deleting configuration required for fresh account verification or canonical update source setup.

`src/dashboard/settings.ts` now allows saving valid cohort/day/timezone/upstream configuration with an empty token when no token exists. An empty field preserves an existing token; a placeholder token is treated as absent. Keep validation for supplied tokens. `tests/settings.test.ts` adds coverage for setup before sign-in.

Use concise account copy: “Sign in to sync your curriculum. Your connection and study notes stay on this device.”

## Search bar

Reference:

- `dashboard/app/page.tsx`: `searchQuery`, `assignment-search`, tab labels, LearningHub props.
- `dashboard/components/LearningHub.tsx`: controlled `query` prop and search results.
- `dashboard/app/globals.css`: `.assignment-search` rules.

Remove `["search", "Search"]` from the visible tab list. Keep internal search mode for displaying results.

Add a full-width `type="search"` input above the tabs, with placeholder **Search your assignments…**, matching accessible label, and `maxLength={200}`. The parent owns query state and passes it into LearningHub. Typing a nonempty query displays search results; clearing switches to Assignments. Focusing an existing nonempty query returns to results.

LearningHub no longer owns a separate query input. It keeps the existing 250 ms debounce, AbortController cancellation, `/api/library` query, and result navigation. Change its search heading to **Search results**. Search covers saved assignments, study notes, and personal annotations across indexed days; it does not perform remote Pursuit or AI requests. Preserve protected-content exclusions in the existing index.

## Settings gear

Reference: tab buttons in `dashboard/app/page.tsx` and `.study-tabs .settings-tab` in `dashboard/app/globals.css`.

Keep the internal `settings` tab and click handler. Render an inline SVG gear instead of text for that button. Preserve `role="tab"`, `aria-selected`, add `aria-label="Settings"` and `title="Settings"`, and mark the decorative SVG `aria-hidden="true"` and `focusable="false"`.

Use `margin-left: auto` to align the gear to the right, centered contents, and a minimum 44×44 px click target. Keep selected-state colors inherited from the tab styling. No icon dependency is needed.

## Boundaries to preserve

The user explicitly authorized the native macOS sign-in wrapper/session capture exception. This companion's `AGENTS.md` records that narrow exception. Do not interpret it as permission for assignment browser automation.

Keep all Pursuit reads behind the existing verified GET transport. No new Pursuit authentication, submission, conversation, or completion-write endpoints were added. Assessments/surveys remain protected. Keep student credentials, SQLite, notes, runtime data, generated apps, and caches local and ignored. Do not copy `.env`, `state/`, `study-notes/`, `.runtime/`, or a built `.app` into the destination.

## Validation and remaining manual checks

Completed in this companion:

- 207 offline tests passed after the sign-in/browser-launch fixes.
- Typecheck and production build passed after the subsequent Settings, search, and gear edits.
- Native Swift compilation and signing passed.
- A local POST to `/api/auth/open` returned success after the browser-button fix. This confirms the launch command succeeded, not completion of live authentication.
- No automated test or visual inspection established an end-to-end live sign-in/sync success.

Relevant auth tests: `tests/tokenConnection.test.ts`, `tests/tokenCapture.test.ts`, and `tests/settings.test.ts`. They cover missing/expired/rejected credentials, verification before save, configuration preservation, private permissions, symlink rejection, redaction, nonblocking readiness, origin checks, busy rejection, sync after acceptance, and empty local native-launch requests.

After adapting to the destination, run its offline tests, typecheck, production build, and native build. Then manually verify:

- Native sign-in opens from both browser and native dashboard, including an already-running app.
- Sign-in succeeds, persists only after verification, updates connection status, and starts sync.
- Fresh setup works with cohort/day anchors saved before sign-in; failure is actionable.
- Advanced setup is collapsed and app updates immediately follow sign-in.
- Search has no visible tab; typing, clearing, result navigation, and narrow layouts work.
- The gear is right-aligned, keyboard reachable, named Settings, and opens Settings.

Restart the destination server after building and reload its dashboard. Rebuild and quit/reopen the native process for Swift changes; rebuilding a binary does not update an already-running process.

## Suggested instruction for the next agent

“Read docs/HANDOFF-sign-in-and-navigation.md in the companion project. Reproduce the account sign-in/browser-launch fixes and Settings/search/gear UX and tab-layout stability fixes in the other app. Compare its existing native/auth/sync code first; preserve its port, identity, features, and local student data. Port only the relevant changes, run offline tests/typecheck/production/native builds, and clearly distinguish verified checks from manual sign-in checks.”

## Follow-up: stabilize tab layout

`dashboard/app/globals.css` gives `main` a zero flex basis and explicit full width
so different tabs' intrinsic content widths cannot resize the main column. The
root reserves scrollbar space (with an always-visible vertical scrollbar fallback)
so long and short tabs do not change available horizontal space. Tab buttons
share a 44 px minimum height, fixed line-height, nonshrinking flex sizing, and
no text wrapping. The panel has full width, a 360 px minimum height, safe text
wrapping, and disables scroll anchoring within changing tab content.

In `dashboard/app/page.tsx`, ordinary tab clicks, Today, and search input changes
clear old task/heading navigation targets. This prevents the existing deep-link
scroll effect from scrolling to an old assignment when returning to a tab.
Explicit result/assignment navigation continues to set targets and scroll.

Validation after these layout changes: all 207 offline tests, typecheck, and
production build passed. The local server was restarted. Visual behavior still
needs manual checking in the destination:

- Switch repeatedly between long and short tabs; the main column, search bar,
  tab buttons, and Settings gear should retain their positions and sizes.
- Check widths near tab-wrap breakpoints and with a visible vertical scrollbar.
- Open an assignment or heading from search, switch away, then return using an
  ordinary tab click; it should not scroll back to the old target.
- Confirm explicit search-result navigation still scrolls to its chosen target.

## Follow-up: match the personal app's study dashboard

The user requested the personal app's general presentation and study features,
excluding assignment automation. The latest request supersedes the earlier gear
placement: Settings now lives in the **top navbar**, beside workspace status,
not among the content tabs. It remains an accessible, named button with a tooltip
and pressed state. The user also requested **no Pursuit logo**: use the plain
“Study Companion” wordmark and do not copy the personal app's branding images.

`dashboard/app/page.tsx` now uses the personal app's sidebar structure (dashboard
kicker, Today, Your Days, sort selector, and local history footer). Day labels use
`dashboard/lib/dateLabel.ts`: **Tue, Oct 20**, with year and verified day ID beneath.
Sort order persists in `localStorage` under `pursuit-day-sort`. Assignments is the
default view. The heading shows Today or a relative day with the readable date
in its subtitle.

The main view now matches the personal app's connection status card, sync/study
buttons, four progress cards, white content panel with underline tabs, assignment
completion markers/badges, resource indicators, source/concept details, study-note
links, study toolbar (refresh and copy), and selected-day run cards. Shared learning,
resource, annotation, expansion, and export components retain their existing
behavior. Keep the search bar, collapsed Advanced setup, and tab stability fixes
from earlier requests.

New deep-link parsing supports `studyTask`, `studyLine`, and `annotation`, alongside
existing assignment and lesson links. Explicit navigation still scrolls to its
chosen assignment or study section; ordinary tab changes clear stale targets.

Do not copy assignment execution/resume buttons, automated scheduling, conversation
or submission controls, messages-sent counters, automation badges/reasons, student
names, credentials, or assignment journals. The underlying Pursuit transport remains
GET-only. Run-history cards describe study imports only. Existing notes and local
history remain untouched by this UI change.

A new `tests/dateLabel.test.ts` checks the requested readable date format. All 208
offline tests and the production build passed after these changes. Verify the
navbar gear, sidebar selection/sort, source links, refresh/copy controls, narrow
layouts, and tab stability manually in the destination.

### Final branding preference

The user clarified that text branding is welcome: **Pursuit Study Companion**,
with **Pursuit in blue** (`#2563eb`) and no logo image. The sidebar uses stacked
text spans (`.pursuit-word` and `.companion-name`) inside `.companion-wordmark`.
This supersedes the shorter “Study Companion” wordmark described above.

### Personal-app branding clarification

The personal copy must remain **Pursuit Learning Agent** with its existing
**Pursuit logo**. The blue text-only **Pursuit Study Companion** branding applies
only to the shareable companion. Port the navigation/settings/sign-in/layout
changes to the personal app while retaining its original branding and app identity.
