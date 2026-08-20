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

## Agreed next (order not final)

1. ~~**Deploy to phone**~~ — **DONE 2026-08-19**, GitHub Pages instead of
   Cloudflare Pages (nothing to click through on a phone; `gh` was already
   authenticated). Live at https://clarktg08-cloud.github.io/exercise-app/.
   Cloudflare Pages remains an option if a custom domain is ever wanted, but
   the origin change would strand existing data — export/import first.
2. **Cloud sync (Cloudflare D1)** — local-first stays; D1 becomes the shared
   source of truth across phone/desktop. Auth token in Cloudflare secrets,
   never in the repo. Export/import (done) is the manual fallback.
3. **Insights v2** once real data accrues — per-exercise history charts,
   progressive-overload flags, RPE trends for unloadable work. Same science
   rules: evidence or it doesn't ship.

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

- **Editing an exercise's muscle tags / per-side flag** — there is no UI for
  it, so a mis-tagged custom exercise cannot be fixed in the app.
- **Weight stepper passes through 0 on the way back to "—"**, so bodyweight
  work can end up logged as `0 lb` (Taylor did this on Push-Ups). Decide
  whether unloaded exercises should skip 0 entirely.

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
  mostly a runner; that data lives there).
- Body weight / measurements tracking.
- Google Drive backup export (Drive is backup only, never the live store).
