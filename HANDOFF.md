# Session handoff — 2026-09-08

For the next Claude session in this folder (likely remote-controlled from
Taylor's phone at the gym). Read CLAUDE.md (rules) and ROADMAP.md (plan)
first; this file is just the current state between them.

## v0.9.1 — DEPLOYED 2026-09-08 (current live version)

`master` is at b740891. `APP_VERSION` is 0.9.1, `sw.js` `CACHE_VERSION` is
v18. v0.9.0 (c611e66) deployed 2026-09-06 with a successful Pages build at
17:31 UTC; v0.9.1 followed on 2026-09-08.

**v0.9.1 fixes a false alarm found on the phone within minutes of the v0.9.0
deploy:** the data-safety line gated on `workouts.length`, but an empty
session — started and walked away from — is a workout with no sets, so a
device that had never logged anything got a red "Never exported from this
device" warning about data it did not have. It gates on `listSets()` now. The
lesson generalises: a warning that fires when nothing is at stake is a warning
that gets ignored when something is.

**Neither deploy was verified against the live URL from the deploying
session.** That container's network policy blocked
`clarktg08-cloud.github.io` outright (403 at the proxy on CONNECT), so the
post-deploy sampling CLAUDE.md asks for never ran. v0.9.0 was confirmed live
another way — Taylor sent a phone screenshot showing v0.9.0 in the header and
"Storage is marked durable", which is also how the false alarm above was
caught.

**v0.9.1's Pages BUILD is now confirmed** (checked 2026-09-08 from the
warning-explanation session): run 34178922636 for `b740891` completed
`success` at 02:07:20 UTC, and run 34178969442 for the `41bbc6e` docs commit
at 02:08:04 UTC. That closes the "not even the build was checked" gap.

**It is still NOT confirmed as actually serving.** The same egress block hit
this session too (`connect_rejected` on CONNECT to
`clarktg08-cloud.github.io:443`), so the live URL has never been sampled from
any container. A green Pages build is not an edge serving the new files —
which is exactly the distinction the CLAUDE.md sampling rule exists to catch.

**Loose thread worth chasing first:** every screenshot Taylor sent during the
2026-09-08 warning-explanation session showed **v0.9.0** in the History
header, and showed the pre-v0.9.1 banner behaviour (the red row rendering on
a device with 0 sets — impossible under v0.9.1, which gates on `listSets()`).
Those captures are stamped 9:53–10:03 in Taylor's local time; his UTC offset
was never established, so whether they predate or postdate the 02:07 UTC
build is genuinely unknown and should NOT be assumed either way. If they
postdate it, his phone was still being served v0.9.0 and the question is
edge lag vs. a stale service-worker cache. **First job next session:** get
Taylor to reload History and read the version line. v0.9.1 = confirmed;
v0.9.0 = a real staleness bug to chase, starting with `sw.js` (CACHE_VERSION
is v18 and the fetch handler is network-first, so a stale phone means either
the SW never updated or the edge is behind).

Note the v0.9.0 commit message body still says "NOT deployed" — written
before Taylor gave the go, stale rather than a second version.

## Sync direction DECIDED 2026-09-08: Google Drive, not Cloudflare D1

Taylor's two requirements, in his words: "not lose my saved data" and "give a
link to someone else so they can use that also and our data isn't shared,
it's per person." He pointed at his own smoking-tracker app, which creates a
Google Drive folder on first run, and asked whether that pattern fits here.
It does, and CLAUDE.md + ROADMAP have been rewritten accordingly — **do not
build D1.**

Why Drive wins for these two goals specifically:

- **Per-person separation is free.** Each user signs in with their own Google
  account and the file lands in their own Drive. No accounts to build, no
  server, and Taylor never becomes custodian of a friend's training log. D1
  would have meant building auth, sessions, and row-level ownership to reach
  the same place.
- **The OAuth client ID is public by design**, so the "no secrets in the
  repo" rule survives intact.
- **`importAll()`'s merge semantics are already the right shape** for it
  (`js/db.js:595` — match by id, overwrite same-id, never delete), so two
  devices syncing cannot destroy each other's sets.

**The design rule that must hold: IndexedDB stays the LIVE store.** Drive gets
snapshots. This is not caution for its own sake — the whole point of the app
is logging a set in the fewest taps, and that has to work in a basement with
no signal. Drive as the live store puts a network round-trip on every set
write.

Known costs, none of them dealbreakers but none of them hand-waved:

- Google Cloud console setup is Taylor's to do (project, consent screen,
  `https://clarktg08-cloud.github.io` as authorised origin). **Blocked on him
  handing over the client ID.**
- While the consent screen is unpublished, only listed test users can sign
  in — so "share the link" is gated until it's published. Confirm current
  scope/verification rules (`drive.file` vs `drive.appdata`) before promising
  otherwise; this was flagged as unverified, not researched.
- Conflict handling needs a real answer, since Taylor runs phone + desktop
  concurrently.
- His data leaves the device. Mild, and he accepted it knowingly.

**Also established this session:** sharing the app *already* works with zero
work. There is no `fetch()` anywhere in `js/`, no server, no accounts, and
IndexedDB is per-origin/per-browser/per-device, so anyone handed the URL gets
their own empty database today. No "Taylor" appears in the UI either (only in
code comments). He can send the link now; Drive is about durability, not
about making sharing possible.

## Still open from the 2026-09-08 session (not fixed)

- **Empty sessions render as normal training days on the calendar.** Tapping
  "Start workout" writes the workout record immediately (`js/app.js:174` →
  `startWorkout`, `js/db.js:442`), before any set exists. v0.9.1 stopped the
  *data-safety banner* from firing on that state, but the calendar still
  paints a filled "trained" cell for a day with 0 sets — Sept 6 is one. Fix
  is either not persisting the workout until the first set lands, or styling
  zero-set days differently. Taylor has not chosen; don't pick for him.
- **The data-safety row styles the whole box red** when any one of its three
  lines is a gap (`js/app.js`, `row.classList.toggle('warn', stale)`), so a
  reassuring "storage is durable" sentence gets rendered in alarm red beside
  the one real warning. Cosmetic, and much rarer since v0.9.1, but still wrong.

What changed, and the reasoning that is not obvious from the diff:

- **`requestPersistence()` runs after the first render.** IndexedDB is
  "best effort" by default; a browser may evict it, and Safari discards it
  after roughly seven days without a visit. This was the single largest
  unguarded risk to the training history and it cost one call. A refusal is
  not an error — it just means the export is the only safety net, which the
  new data-safety line on History now says out loud.
- **`repeatLastSet()` never copies RPE.** Everything measurable is copied
  exactly (reps, weight including a real 0 and a null for no load, duration,
  side), but RPE is a judgement about the set you just finished. Copying it
  forward would store a number nobody assessed, which CLAUDE.md forbids.
  If a future session "fixes" this by carrying RPE over, that is a regression.
- **`deleteWorkout()` deletes the workout and its sets in ONE transaction.**
  Deleting the workout alone would leave orphan sets that still feed weekly
  volume and est-1RM while being invisible and unreachable. It is deliberately
  the only bulk delete in the app, and is NOT covered by the safety snapshot.
- **`tagsEdited` exists because of a landmine.** `initDb`'s seed-sync rewrites
  `muscles` on every startup for any non-custom exercise whose tags differ
  from the seed. Without the flag, correcting a mis-tagged seeded exercise
  would have silently reverted on the next load — the fix would have looked
  like it worked, then quietly undone itself. Don't drop the flag.
- **Insights**: weekly card now compares against the user's own previous week
  (measured data on both sides, no threshold invented), and the est-1RM series
  is drawn per exercise. The sparkline spaces points **by session, not by
  date**, so it shows the shape of the progression and not a rate — the label
  under it carries the real dates for exactly that reason.

**Tests:** `tests/e2e.mjs` drives the real app in Chromium (34 checks, all
passing). It is dev-only, adds no package.json, and needs
`npm i --no-save playwright` plus `npx serve -l 8123 .`. If the local
Playwright and the installed browser revision disagree, set `CHROME_PATH`.
It covers the shapes CLAUDE.md asks for: null weight, weight 0, one rep, a
timed hold, and a custom name with an apostrophe.

**Deliberately NOT done, because they are Taylor's calls:**
- The stepper prefill still comes from the LAST set of the previous session
  (the most fatigued one), so the default drifts down over time. Candidates
  remain best set or first set. Untouched on purpose.
- The weight stepper still passes through 0 on the way back to "—".
- Calendar colour-coding: still needs a rule for what a colour would mean.

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
