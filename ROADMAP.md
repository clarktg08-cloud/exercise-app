# Roadmap

What's built, what's agreed next, and ideas parked for later. Taylor decides
order and scope; this file just keeps sessions on the same page.

## Done

- **v0.1** — offline-first logging skeleton: exercises / workouts / sets in
  IndexedDB, seeded exercise library with muscle tags, steppers + optional RPE,
  band/bodyweight sets with `weight: null`, history, JSON export.
- **v0.2** — full 1–10 RPE scale, stretch/hold type (duration-based logging),
  always-visible new-exercise form (type + muscle tags), edit/delete any past
  set from History, visible APP_VERSION.
- **v0.3** — exercise form notes, rest timer (time since last set), repeat a
  past workout (planned-exercise list on Today), JSON import (merge by id),
  Insights tab v1: training sets per muscle/week (holds excluded on purpose),
  Epley est-1RM trends (loaded sets, 1–10 reps only), all-time totals.
- **v0.4** — picker filters by type + muscle, calves/shins and hip groups split,
  rest timer with a reps-based suggested target that goes quiet after a long gap.
- **v0.5** — sessions: a workout is a session, not a calendar day. Training day
  starts at 4am, a gap over 3 hours starts a new session, history groups
  sessions under their day.
- **v0.6** — calendar view for History: month grid marking training days, tap a
  day for its sessions (straight into the session when the day holds only one).
  Calendar / List toggle remembered per device.
- **v0.7** — pre-migration safety snapshots (`backups` store, DB_VERSION 2),
  restorable from History.
- **v0.8** — form photos on exercises (`exerciseImages`, DB_VERSION 3),
  downscaled to 1000px JPEG before storage.
- **v0.9** (deployed 2026-09-06) — the gaps, not new features:
  - **Durable storage requested at startup** (`navigator.storage.persist()`).
    Without it IndexedDB is evictable under storage pressure, and Safari drops
    it after about a week away — the one failure mode that loses everything.
  - **Data-safety line on History**: whether storage is durable on this device,
    how much it uses, and how long since this device last exported. Loud only
    when a real gap exists.
  - **"+ Same" on the Today cards** — one tap logs another set identical to the
    last one of that exercise. RPE is deliberately not copied: it is a
    judgement about the set you just finished, and copying it would store a
    number nobody assessed.
  - **`deleteWorkout`** — a session and its sets go together in one
    transaction, behind a confirm on the session screen. Closes the
    "mis-started sessions are permanent" gap below.
  - **Editable muscle tags / per-side flag** on the log screen, with a
    `tagsEdited` flag so `initDb`'s seed-sync stops putting the old tags back.
  - **Insights v2 (part)**: this week vs your own last week per muscle, and the
    est-1RM series drawn per exercise (the data `e1rmHistory` already
    computed and the UI was discarding).

## Agreed next (order not final)

1. ~~**Deploy to phone**~~ — **DONE 2026-08-19**, GitHub Pages instead of
   Cloudflare Pages (nothing to click through on a phone; `gh` was already
   authenticated). Live at https://clarktg08-cloud.github.io/exercise-app/.
   Cloudflare Pages remains an option if a custom domain is ever wanted, but
   the origin change would strand existing data — export/import first.
2. **Cloud backup to each user's own Google Drive** — decided 2026-09-08,
   REPLACING the Cloudflare D1 plan. Local-first stays: IndexedDB is the live
   store and logging never waits on a network. The app pushes a JSON snapshot
   to a folder in the signed-in user's OWN Drive and pulls on load, reusing
   the merge-by-id semantics `importAll()` already has (matching ids
   overwritten, nothing deleted), so two devices cannot destroy each other's
   sets. Export/import (done) stays as the manual fallback.
   Why Drive over D1: each person authenticates with their own Google account,
   so handing someone the link gives them isolated data with no accounts to
   build and no server holding anyone's training history. The OAuth client ID
   is public by design, so no secret enters the repo.
   Blocked on Taylor: create the Google Cloud OAuth client and hand over the
   client ID. Verify before promising frictionless sharing — current scope and
   verification rules (`drive.file` vs `drive.appdata`), and note that while
   the consent screen is unpublished only listed test users can sign in.
   This does NOT deliver the social features below: there is still no shared
   server, so friends/sharing would need its own layer.
   **Read before designing it:** the sibling `cannabis-tracker` PWA
   (`C:\Users\clark\Sessions App\cannabis-tracker`) already runs this exact
   pattern and its CLAUDE.md documents its sync rules and incident list. Four
   traps it hit, which this app would repeat as written today:
   - **Deletes resurrect.** "Nothing deleted" cuts both ways. `importAll()` is
     a union merge and `deleteSet` / `deleteWorkout` leave no tombstone, so a
     set deleted on the phone comes back the next time the desktop's snapshot
     is merged, and is then pushed to Drive again. Every record already has a
     UUID, which is half the fix. Still needed: `deletedAt` tombstones,
     `updatedAt`, and ETag / `If-Match` on the Drive write.
   - **An older copy can overwrite a newer edit.** `importAll()` does an
     unconditional `put` per id, so whichever snapshot is merged last wins,
     not whichever is newest. An edited set can be silently reverted. Same
     `updatedAt` fix. This one bears directly on "a logged set must persist
     exactly as entered".
   - **Namespace storage per account.** Global keys there let a second Google
     account inherit the first's file id and cached data, and the merge then
     copied one person's history into the other's file.
   - **Surface sync failure loudly.** A dead token silently stopped syncing
     there for about two days and real sessions were lost. Any non-2xx must
     throw; never mark synced on the optimistic path.
   (Their fourth incident, stats computed across people, only applies here if
   a combined-stats feature is ever built.)
   **Design input, 2026-10-13: the backup should be a file other tools can
   read.** Taylor's training desk (the Fitness Assistant on his Health &
   Fitness floor) already reads a nightly Garmin export for his runs. It has
   no view of strength work at all, because that lives only in this app's
   IndexedDB. A Drive snapshot written as an ordinary,
   visible JSON file would close that gap for free. That argues for the
   `drive.file` scope over `drive.appdata`: the app-data folder is hidden from
   the user and from every other app, so nothing else could ever read it.
   Open, and Taylor's to answer: which Google account he signs in with, since
   that floor lives in a different Drive from his personal one, and whether
   the file should land in that floor's folder or just be findable.
3. **Insights v2** once real data accrues — per-exercise history charts and
   week-over-week volume shipped in v0.9. Still open: progressive-overload
   flags and RPE trends for unloadable work. Same science rules: evidence or
   it doesn't ship.

## Decided (2026-08-20) — intensity, warm-ups, bands

- **Don't build the science layer on RPE.** Taylor's call: RPE stays in the
  app and stays optional, but he doesn't want to guess how hard a rubber band
  was, so no metric should depend on it. Any "hard set" rule keyed to an RPE
  threshold is out — that would be inventing a cutoff.
- **Warm-up sets get logged like any other set.** A warm-up is usually the
  same movement at lower intensity, "but not always", so it is real training
  data and not a separate category. A warm-up flag is *parked, not rejected* —
  Taylor sees it mainly as a way to fix a mis-tap, and is wary of adding a
  button that can itself be tapped wrong.
- **Consequence, already shipped in v0.3.5:** weekly sets-per-muscle counts
  every logged set, warm-ups included, so the card now says so and frames the
  10–20 hard-set research as an upper-bound comparison rather than like-for-like.
- **Band tension by colour is the preferred direction for band intensity**
  (hypothetical — he has not bought a set). See parked ideas for how to model
  it honestly.

## Agreed next — after v0.6.0

- ~~**No way to delete a session.**~~ **DONE in v0.9** — `deleteWorkout`
  removes a session and its sets in one transaction, from a confirmed control
  at the bottom of the session screen. It is NOT covered by the safety
  snapshot, and the confirm says so. Test data can now be imported and removed
  again, which was the blocker on seeing the calendar populated.
- ~~**Editing an exercise's muscle tags / per-side flag**~~ **DONE in v0.9** —
  editable from the log screen. Note the subtlety it exposed: `initDb`'s
  seed-sync rewrites `muscles` on every startup for non-custom exercises, so a
  correction to a seeded exercise would have silently undone itself. The
  `tagsEdited` flag is what stops that; don't remove it.
- **Weight stepper passes through 0 on the way back to "—"**, so bodyweight
  work can end up logged as `0 lb` (Taylor did this on Push-Ups). Decide
  whether unloaded exercises should skip 0 entirely.

## Raised 2026-10-13 — not yet agreed

- **The library cannot tag forearm / wrist or trap work.** `MUSCLE_GROUPS`
  has no group for either, so an exercise for them can only be mis-tagged or
  left untagged. Taylor's own stretching routine lists nine areas: hip
  flexors, hamstrings, triceps, upper traps, wrists, biceps, chest, back,
  glutes. Four have a seeded stretch (hip flexor, hamstring, chest, glute).
  Five do not: triceps, upper traps, wrists, biceps, back. Proposal: add
  `forearms` and `traps` groups and seed the five missing stretches as
  hold-type. Holds stay out of the weekly set math, so this changes the
  picker and nothing in Insights. His call on the grouping; he had firm views
  on how the hip was split.

## Parked ideas (discussed, not scheduled)

- **Bands with rated tension.** Replace "no load + RPE" with the band's stated
  resistance. Modelling rules if this happens: band resistance is a *range*,
  not a number — tension rises with elongation, and manufacturers publish a
  span (e.g. 15–35 lb). Store the band identity and its rated range, never a
  single invented poundage. Bands should stay OUT of Epley est-1RM, which
  assumes a constant external load; a rising-tension band breaks that
  assumption. What rated bands would buy honestly: progression tracking
  (green → blue is a real, recordable step up) and volume that isn't
  guesswork.

- **Social / friends** (Taylor is interested for "down the road, when it's
  more fully built"; requires accounts + server, so it rides on the sync
  layer). Concepts sketched:
  - Share a workout: a friend can view it and "repeat" it as their own plan.
  - Planned sessions on a calendar with invites — both log against the same
    planned workout ("train together, log together").
  - Fair comparisons: relative trends (percent change in est-1RM vs your own
    baseline, weekly-volume consistency) rather than absolute weights, so
    differently-strong friends compare meaningfully. No invented "fitness
    scores".
  - Accountability: streaks, "your buddy logged a workout" nudges.
- **Garmin/Strava import** for combined training-load picture (Taylor is
  mostly a runner; that data lives there). Note 2026-10-13: a nightly Garmin
  export already lands as CSV on his Health & Fitness floor and his training
  desk reads it. The cheaper route to a combined picture is getting strength
  data OUT to that desk (see "Agreed next" #2), not pulling Garmin in here.
- Body weight / measurements tracking.
- ~~Google Drive backup export~~ — promoted to "Agreed next" #2 on 2026-09-08.
