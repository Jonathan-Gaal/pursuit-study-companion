# Pursuit Study Companion

This is a standalone, shareable study app, not an assignment automation agent.

- Keep Pursuit access behind `src/pursuit/`. Allow only the existing verified GET
  contracts. Do not guess new endpoints or response envelopes.
- Never implement Pursuit submission, conversation, completion-write, browser
  automation (except the user-authorized native macOS sign-in session capture), or AI answer-generation paths. Local annotations and review ratings
  are allowed; they are never sent to Pursuit.
- Assessments and weekly surveys stay manual. Exclude their bodies from storage,
  extraction, generated notes, reviews and exports. Detect protection from titles,
  type/mode/intent, assessment IDs and explicit metadata before provider calls.
- Completion is what Pursuit reports, not proof that external work exists.
- Keep per-student credentials, notes, annotations, SQLite state and runtime data
  local and ignored by Git. Never copy one student's data into the shared repo.
- Default study generation uses offline curated material. Be explicit about its
  limits; don't describe it as exhaustive LLM-generated teaching.
- User-requested “Tell me more” uses optional, confirmed-free study providers
  only. Keep this separate from assignment answering. Include existing eligible
  notes and expansions for deduplication, exclude protected content, bound calls
  and output, and never submit anything to Pursuit. Preserve original notes.
- Shared updates come from a configured canonical HTTPS GitHub repository,
  never implicitly from a student's fork. Check on startup, apply only a clicked
  exact-commit update, require a clean release branch and a fast-forward history.
- Updates must never reset, discard, stash, overwrite or publish student source
  changes. Preserve local data, journal progress, stop on errors, and report
  manual recovery steps if dependency installation or building fails.
- Tests run offline. Test parsing, protected content, GET-only enforcement,
  local API permissions, credential redaction, notes preservation and update
  behavior. Run typecheck and production build before release.
- A native macOS sign-in wrapper is supported; a desktop installer is deferred. This version is the cross-platform local
  browser app started with `npm start` after installing Node and Git.
