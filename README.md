# Pursuit Study Companion

A local personal study layer for Pursuit. Import curriculum, keep Markdown
notes, find connections, review concepts, annotate lessons, and track the
assignments and deliverables you complete yourself.

This app never answers or submits assignments. Assessments and weekly surveys
stay manual and their questions are excluded from study processing.

## Run it

Install Git and Node.js 22.13 or newer (with npm). macOS, Windows and Linux are
supported through a local browser; a desktop installer is a future step.

Fork the published GitHub repository, clone your fork, and open a terminal in
that folder:

```sh
npm ci
npm run dashboard:build
npm start
```

The app opens at **http://127.0.0.1:4782**. It can run alongside the original
assignment helper on port 4781. Keep the terminal open while using the app.

In **Settings**, provide your own bearer token, the exact cohort name, verified
day IDs, and your local timezone. A blank token field keeps an already-saved
token. Settings writes an ignored local `.env`; the UI never returns your token.
Tokens may expire, in which case update yours locally. Never paste a real token
in an issue, commit, screenshot or shared chat.

You can use **Load example** without credentials or network access. The example
is labeled offline fixture data. Select its saved date in the sidebar.

## Study tools

- Fetch today's curriculum and reported task completion, or import a specific
  verified historical day in Settings.
- Daily Markdown notes, saved lesson sources, personal annotations and preserved
  existing notes on repeated imports.
- Search, self-test cards, spaced review, a concept map and weekly recap.
- Assignment status, links back to Pursuit, and separate **Resources** and
  **Deliverables** sections, with genuine work left to you.
- Saved-day sorting, relative date labels, and read-only **Sync saved & missing
  days** discovery based on your own verified saved curriculum.
- Optional **Tell me more** buttons below assignment and sourced concept study
  sections. Expansions persist and are included in Markdown copying and exports.
- Obsidian Markdown previews and ZIP export, with no vault sync or overwrites.
- Saved import history and a bounded historical backfill command.

Study notes use offline curated concept material and preserved curriculum text.
The default import does not call an AI service. The catalog is finite; unfamiliar topics may
have lesson notes without a substantive curated deep dive. Completion is what
Pursuit reports, not independent evidence of completed external work.

Current-day discovery still uses a bounded candidate ID scan through a verified
GET route, then validates returned date, ID and cohort. A supported day-listing
endpoint is not yet known. Missing or unverified dates fail closed.

```sh
# Offline sample, no credentials or network
npm run daily -- --fixture --dry-run

# A verified historical day using the cohort in your local configuration
npm run daily -- --day 1648 --dry-run

# Import the known L1/L2 history, without submissions
npm run history:backfill -- --from 2026-07-06 --through 2026-10-08 --min-day 1400 --max-day 1648 --cohort 'L2 - September 2026' --cohort 'L1 - July 2026'
```

The L1/L2 names and IDs above are examples from the verified cohort contracts
used to develop this app; use identities available to your own account. L1
assignments end August 27, with L2 beginning September 21 after a module break.
Backfill candidates are bounded at 500 GETs per run; partial coverage is reported.

## Updates from the original repository

The canonical release repository is configured in **updates.json**:
`https://github.com/Jonathan-Gaal/pursuit-study-companion`. Student installs use a
clean `main` branch. Public visibility is needed for credential-free updates.

The app checks **published stable GitHub Releases**, rather than every development
commit. Each release has a version such as `0.1.0`, an immutable-by-policy `v0.1.0`
tag, and release notes. Settings shows installed and available versions. See
[the release guide](docs/RELEASING.md) for publishing commands and checks.

**Update & restart** approves the exact displayed release commit. The worker
revalidates the canonical tag, release version, clean branch, and fast-forward
ancestry; it then updates source, installs locked dependencies, rebuilds the
browser app and macOS helper where applicable, and restarts the server. Reopen
the macOS window after updates that change the native helper.

Ignored local credentials, study notes, SQLite history, annotations, and review
progress stay on each student's device. Releases that track local-data paths are
blocked. Local code edits, divergent history, and moved release tags stop updates;
the app never resets, stashes, discards, or pushes student changes.

If install/build fails after a fast-forward, source may already have advanced.
The app does not promise an automatic rollback. Read `.runtime/update-state.json`
and recover in the repository folder with:

```sh
npm ci
npm run dashboard:build
npm start
```

If a worker is interrupted and leaves locks, verify no study/updater process is
running before removing its `.runtime/update.lock` or `.runtime/study-run.lock`.
Do not bypass locks while an operation is active.

Git's [fast-forward-only merge](https://git-scm.com/docs/git-merge) rejects a
diverged history. [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/)
installs the lockfile's dependency tree and fails when it disagrees with package
metadata. The app uses both as update guardrails.

## Your local data

`study-notes/` stores generated Markdown, `state/` stores local JSON/SQLite
history and annotations, and `.runtime/` stores locks, exports and update state.
These paths and `.env` are ignored by Git. Back them up yourself before moving
machines. Every student starts with an empty history; nobody's personal notes,
credentials or Pursuit conversations ship in this repository.

## Development and publishing

```sh
npm run dev
npm run typecheck
npm test
npm run dashboard:build
```

The shared source includes only sanitized/synthetic fixtures. Tests need no live
credentials or Pursuit network access. GitHub CI checks tests, types and build.
Before publishing, configure `updates.json`, review all tracked files, verify the
read-only app using your own local account, and publish the clean `main` branch.
This is an unofficial student tool, not a supported Pursuit product. Obtain the
supported day-listing/authentication contracts before claiming durable API support.

## Optional AI study expansions

To use **Tell me more**, configure your own `GEMINI_API_KEY` and
`GEMINI_FREE_TIER_CONFIRMED=true` in the ignored local `.env`, then restart the
app. An optional `GROQ_API_KEY` with `GROQ_FREE_TIER_CONFIRMED=true` enables one
fallback when Gemini generation fails. See `.env.example` for model settings.
Use a free-tier/unbilled project; the app cannot verify billing from a key.
Settings preserves these local options without returning keys to the browser.
No keys, notes or student data are copied from the assignment automation app.

Each click asks a dedicated study tutor for deeper mechanisms, worked examples,
trade-offs or failure modes. It includes all eligible notes and previous
expansions for that day, tracks covered subtopics, and rejects repeated subtopic
labels or copied paragraphs. Semantic repetition is discouraged by the prompt,
not perfectly detectable. Input is never silently truncated. Calls, response
sizes and timeouts are bounded; each click makes at most one Gemini and one
Groq attempt, without automatic retries or paid fallback.

Expansions are saved locally in `study-notes/YYYY-MM-DD.md.expansions.json`,
leaving original Markdown intact. Concurrent generations are locked per day.
Assessments and weekly surveys are excluded from model context and cannot be
expanded. The tutor generates study material only: it never answers assignment
questions, generates submission responses, converses with Pursuit or writes to
Pursuit. If no provider is configured, existing offline study tools still work.

**Sync saved & missing days** is a manual read-only action. Fetch at least one
verified live day first so discovery has an anchor. It preserves existing notes,
refreshes reported completion, validates returned dates and cohorts, and stops
on errors. It never runs or submits assignments. The companion retains its own
cross-platform Settings and exact-commit update workflow; assignment scheduling,
macOS token capture and assignment automation are intentionally excluded.

## Sign in to Pursuit on macOS

`npm start` now opens a native macOS window. The first launch compiles the wrapper
using Xcode Command Line Tools (`xcode-select --install` if missing). Node and Git
are still required; this is a local wrapper, not a standalone installer.

In Settings, save your exact cohort and verified day IDs (the token field can stay
blank), then click **Sign in to Pursuit**. Sign in yourself in the Pursuit window.
The helper observes a successful authenticated request to Pursuit's known API,
verifies the captured session using an existing allowlisted GET, and only then
saves the token in the owner-only, ignored local `.env`. Successful sign-in starts
the existing read-only sync. Saved study notes are preserved. Verification needs
a saved live task or configured cohort/day anchor; no authentication endpoint is
guessed. Passwords are never collected by the companion. The sign-in window uses
an ephemeral session, independent of Chrome or Safari. If verification fails,
close and reopen sign-in to retry; no new credential is saved.

`npm run start:macos` builds and opens the wrapper directly.
`npm run start:browser` keeps the browser interface on macOS. Windows and Linux
continue to use the browser through `npm start` and local token setup. Browser
dashboards cannot read a Pursuit browser session. The generated `.app` and Swift
cache are local ignored artifacts. No assignment, completion, or conversation
writes are added by this sign-in feature.
