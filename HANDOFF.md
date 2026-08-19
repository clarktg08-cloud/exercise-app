# Session handoff — 2026-08-19

For the next Claude session in this folder (likely remote-controlled from
Taylor's phone at the gym). Read CLAUDE.md (rules) and ROADMAP.md (plan)
first; this file is just the current state between them.

## Where things stand

- **App version v0.3.2**, all work committed locally on `master`
  (latest: `013110a`). Working tree clean. **No git remote exists yet.**
- Nothing has ever been pushed or deployed. **Deploy (GitHub + Cloudflare
  Pages) is agreed as the next big step but WAITS for Taylor's explicit
  "go" — do not create the remote or deploy without it.**
- Built so far: logging (weighted / band-bodyweight / stretch-hold types,
  1–10 RPE, 2.5 lb steps, tap-to-type values), edit/delete any past set,
  exercise form notes, rest timer, repeat past workout (planned list),
  JSON export + import, Insights tab (weekly sets/muscle, Epley e1RM),
  "Last time" line showing the full previous session with its date.

## Running / testing

- Preview: `.claude/launch.json` entry `exercise-app` (npx serve, port 8123).
- The in-app Browser pane wipes IndexedDB whenever the pane restarts —
  fine for testing, but it means test data disappears and **the pane is
  never where real training data lives.** Real data will live on the
  deployed phone app (or a normal desktop browser) once deployed.
- Follow CLAUDE.md testing rules: null-weight band sets, weight 0,
  apostrophe names, getComputedStyle for visibility.

## Small open questions Taylor hasn't decided (ask only if relevant)

- **Stepper prefill on the log screen** (v0.3.2): still prefills from the
  *last* set of your previous session, which is usually your most fatigued
  one, so the default drifts low over time. Candidates: best set of that
  session, or first set. Taylor is deciding by feel once he's using the app
  for real — don't change it unprompted.
- Rest timer: currently counts up forever; option to hide after long gaps.
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
