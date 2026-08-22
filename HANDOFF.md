# Session handoff — 2026-08-20

For the next Claude session in this folder (likely remote-controlled from
Taylor's phone at the gym). Read CLAUDE.md (rules) and ROADMAP.md (plan)
first; this file is just the current state between them.

## Where things stand

- **App version v0.7.0**, on `master`.
- **DEPLOYED 2026-08-19 (evening) to GitHub Pages:**
  https://clarktg08-cloud.github.io/exercise-app/ — Taylor gave explicit go.
  Verified live: service worker registers and activates, all 9 assets cached
  under the `/exercise-app/` scope, correct MIME types.
  **Pushing to `master` redeploys**, so treat any push as a deploy and get
  Taylor's go first.
- Real training data lives in **browser storage per device**. The phone and the
  desktop each hold their OWN IndexedDB at the same URL — there is no sync yet,
  so they diverge the moment both are used. JSON export/import is the only
  bridge. Changing hosts would strand data the same way. Never advise clearing
  storage.
- Taylor now also uses it on desktop (installable PWA via Chrome/Edge). Ask
  which device a report of "missing data" came from before assuming a bug.
- Built so far: logging (weighted / band-bodyweight / stretch-hold types,
  1–10 RPE, 2.5 lb steps, tap-to-type values), edit/delete any past set,
  exercise form notes, rest timer, repeat past workout (planned list),
  JSON export + import, Insights tab (weekly sets/muscle, Epley e1RM),
  "Last time" line showing the full previous session with its date,
  per-side sets (both/left/right), picker filters by type + muscle,
  rest timer with a reps-based suggested target, **sessions**, and a
  **History calendar**.
- **Sessions (v0.5.0)** — a workout is a SESSION, not a calendar day.
  Training day starts at **4am** (`trainingDayKey`), a gap over **3 hours**
  (`SESSION_GAP_MS`) starts a new session, and `getActiveWorkout()` returns
  the live one. Timestamps are never rewritten; the day is derived, so the
  boundary can be changed later without corrupting history.
  `migrateSessions()` runs on every startup and is idempotent by design.
- **History calendar (v0.6.0)** — History has a Calendar / List toggle, stored
  in localStorage under `historyView` (per device, defaults to Calendar). The
  month grid marks a day from `workout.date`, the DERIVED training day, so a
  1:25am session marks the night before, exactly as it reads everywhere else.
  Dots appear only when a day holds more than one session. Tapping a day with
  one session opens that session directly; two or more opens a day screen
  first, and the session's back link then returns there. Month navigation is
  clamped between the earliest session and the current month.

- **v0.6.1 fixed a dead control from v0.5.0:** the "Earlier today" cards on the
  Today screen set `state.screen = 'workout-detail'`, but `render()` forces the
  screen back to `'today'` for that tab, so tapping one did nothing at all.
  The Today branch now routes to the session detail and `detailReturn` resolves
  against a map ('today' | 'day-detail' | 'history'). Lesson for next time: a
  click handler that only sets `state.screen` is dead unless `render()`'s branch
  for the current TAB handles that screen.

- **Safety snapshots (v0.7.0)** — `DB_VERSION` is now **2** and a `backups`
  store holds a pre-migration snapshot of workouts + sets. `migrateSessions()`
  calls `saveBackup()` BEFORE its first write, and only when that run would
  actually change something. Bounded to the newest 3. History shows a Restore
  control when a snapshot exists.
  - Restore uses **merge semantics** like import: matching ids overwritten,
    nothing deleted. An undone split therefore leaves an empty session behind.
  - Restore is **not permanent on its own** — the migration re-runs on the next
    load. The guarantee is that pre-migration data survives while a fix ships.
- **Fixed a landmine in the same change:** `onupgradeneeded` called
  `createObjectStore` unguarded, so the FIRST ever `DB_VERSION` bump would have
  thrown ConstraintError on every existing install, failing `openDb()` and
  locking users out of their own data. All creations are now guarded with
  `objectStoreNames.contains()`. Verified by building a real v1 database with
  data and upgrading it.

## Running / testing

- Preview: `.claude/launch.json` entry `exercise-app` (npx serve, port 8123).
- The in-app Browser pane wipes IndexedDB whenever the pane restarts —
  fine for testing, but it means test data disappears and **the pane is
  never where real training data lives.** Real data lives on Taylor's phone
  and desktop browsers at the deployed URL.
- Follow CLAUDE.md testing rules: null-weight band sets, weight 0,
  apostrophe names, getComputedStyle for visibility.

## Small open questions Taylor hasn't decided (ask only if relevant)

- **Stepper prefill on the log screen** (v0.3.2): still prefills from the
  *last* set of your previous session, which is usually your most fatigued
  one, so the default drifts low over time. Candidates: best set of that
  session, or first set. Taylor is deciding by feel once he's using the app
  for real — don't change it unprompted.
- **Warm-up flag** — parked, not rejected (see ROADMAP "Decided"). Taylor logs
  warm-ups as normal sets; a flag would mainly be for fixing a mis-tap.
- **Bands with rated tension** — his preferred fix for band intensity instead
  of RPE. Not bought yet. Model as a range, never a single invented number,
  and keep bands out of est-1RM (see ROADMAP).
- Rest timer: currently counts up forever; option to hide after long gaps.
- Calendar cells mark a trained day but say nothing about what was trained.
  Colour-coding by muscle group or session volume was NOT built — it would
  need a rule for what a colour means, and inventing one is exactly what
  CLAUDE.md forbids. Worth asking him what he would want a colour to say.
- Planks are excluded from weekly sets-per-muscle (they're hold-type);
  arguably they should count toward core. Flagged to him, undecided.
- He'll send a better photo of his single-loop stretch strap sometime
  (loop around foot, strap wrapped under/around arms, rotate away with
  opposite leg back — leverage, not pulling).

## Gym-session etiquette (phone-driven changes)

- Keep changes small and self-contained; he's between sets.
- Bump `APP_VERSION` in js/version.js on every user-visible change.
- Commit locally anytime; never push/deploy/publish without explicit go.
- Once a remote exists (not yet): `git fetch` before editing — he runs
  concurrent sessions from multiple devices.
- Model advice already given: routine iteration on Opus 5 + fast mode,
  medium effort; raise effort for the D1 sync-layer design when it comes.
