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

## Agreed next (order not final)

1. **Deploy to phone** — GitHub repo + Cloudflare Pages. **Waits for Taylor's
   explicit go.** First deploy: bump sw.js CACHE_VERSION, test installed PWA,
   sample the live URL several times.
2. **Cloud sync (Cloudflare D1)** — local-first stays; D1 becomes the shared
   source of truth across phone/desktop. Auth token in Cloudflare secrets,
   never in the repo. Export/import (done) is the manual fallback.
3. **Insights v2** once real data accrues — per-exercise history charts,
   progressive-overload flags, RPE trends for unloadable work. Same science
   rules: evidence or it doesn't ship.

## Parked ideas (discussed, not scheduled)

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
