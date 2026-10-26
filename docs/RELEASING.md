# Versioned releases for the shareable app

Canonical repository: <https://github.com/Jonathan-Gaal/pursuit-study-companion>.
This applies only to Pursuit Study Companion. The personal Pursuit Learning Agent
is a separate local application and is not published by this workflow.

## Version policy

`package.json` is the installed version. The root entries in `package-lock.json`
must match it. Stable releases use `major.minor.patch`, matching tags such as
`v0.1.0`, and a corresponding section in `CHANGELOG.md`.

- Patch (`0.1.0` → `0.1.1`): fixes that preserve existing behavior and data formats.
- Minor (`0.1.0` → `0.2.0`): new compatible study features.
- Major (`0.2.0` → `1.0.0`): breaking changes that need explicit migration guidance.

Never reuse or move a published tag. Publish a new patch release for corrections.
There is no automatic database migration system in this version; design and test
any data migration before releasing a schema change. Versions do not imply that
Pursuit completion verifies external work or learning mastery.

## First publication

The initial version is `0.1.0`. Review and commit the source and changelog on `main`.
Only source files belong in Git. Credentials, notes, SQLite, personal annotations,
review progress, generated apps, and runtime files must stay ignored.

Run checks, create the tag, and push:

```sh
npm test -- --dir tests
npm run dashboard:build
npm run typecheck
npm run release:check
npm run release:tag
git push origin main v0.1.0
```

On macOS, also run `node --import tsx scripts/start-macos.ts --build-only`.
The GitHub workflow checks Linux, Windows, and macOS, including the native macOS
build. Only after all checks pass does it publish the stable GitHub Release.
A pushed tag whose checks fail is not offered by the new updater. Inspect failed
checks and prepare a new version rather than moving a published release tag.

## Subsequent releases

Start with a clean `main` branch. Implement and commit the changes, then:

```sh
npm run release:prepare -- patch
```

Use `minor`, `major`, or an explicit higher version when appropriate. This changes
only package version metadata, lockfile version metadata, and a new changelog
section. It does not commit, tag, push, publish, or touch student data.

Replace the changelog placeholder with clear release notes. Run the checks above,
review and commit the version files, then:

```sh
npm run release:tag
git push origin main v0.1.1
```

Use the actual version printed by the tagging command. `release:tag` requires a
clean release branch, matching metadata, completed notes, no tracked personal data,
and an unused higher version. It creates only a local annotated tag. GitHub
publishing is triggered by explicitly pushing that tag.

## Student updates

Students clone the canonical repository and use its clean `main` branch. A fork's
origin is never implicitly treated as the update source. Downloaded source ZIPs
lack Git history and cannot use the Git updater.

The app reads the latest **published stable GitHub Release**, fetches its exact
tag from the canonical HTTPS repository, verifies the tag's package version and
its ancestry on `main`, and offers that commit. It rejects downgrades, mismatched
versions, dirty source trees, and divergent history. Clicking Update approves an
exact commit; a moved tag or changed source state stops the worker.

The worker fast-forwards source, installs locked dependencies without lifecycle
scripts, builds the dashboard and macOS helper (on macOS), restarts the server,
and records progress in `.runtime/update-state.json`. Reopen the native app to
load changes to native windows. Local notes, credentials, and review history are
preserved. Updates never stash, reset, discard, or push student code.

**Public visibility is required for credential-free release checks.** Private
repositories require authenticated GitHub access, which this student updater does
not collect or implement. GitHub may rate-limit unauthenticated checks; failed
checks leave the installed app unchanged.

## Current recovery limits

This is an exact-version source updater, not a side-by-side package installer.
A failed dependency install or build can happen after source has advanced. The
worker preserves data and reports recovery steps; it does not reset source or
promise automatic rollback. Recover in the app directory with:

```sh
npm ci --ignore-scripts
npm run dashboard:build
node --import tsx scripts/start-macos.ts --build-only
npm start
```

Run the macOS helper build only on macOS. Inspect the journal and verify no worker
is running before manually removing stale update/study locks. Staged installations
and switching between prebuilt versions remain future work.
