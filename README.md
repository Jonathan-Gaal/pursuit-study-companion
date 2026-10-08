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
- Assignment status and resource/deliverable links, with genuine work left to you.
- Obsidian Markdown previews and ZIP export, with no vault sync or overwrites.
- Saved import history and a bounded historical backfill command.

Study notes use offline curated concept material and preserved curriculum text.
They do not make paid AI calls. The catalog is finite; unfamiliar topics may
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

The maintainer sets `repository` in **updates.json** to the canonical HTTPS
GitHub repository before publishing; `branch` is `main`. It is currently
unconfigured because the GitHub destination has not yet been supplied.

Students can override the update source locally in Settings. Use the original
maintainer repository, not your fork. On opening, the app fetches the configured
upstream branch and checks whether an update is available. Fetching changes Git
metadata, but does not replace source files.

When an update appears, **Update & restart** approves the displayed commit. The
app rechecks Git state, stops the running server, applies that exact commit with
`git merge --ff-only`, runs `npm ci --ignore-scripts`, rebuilds, and restarts. The
browser reconnects after restart. The ignored `.env`, `state/`, `study-notes/` and
`.runtime/` directories are retained. Updates that would start tracking those
personal-data paths are blocked.

Local code edits, untracked source files, a different branch, a divergent fork,
or a changed upstream target block the update. Resolve those changes manually;
the app does not stash or reset them. An update does not push to your GitHub fork.

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
