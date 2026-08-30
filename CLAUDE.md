# Exercise App — project rules

Personal gym-logging PWA for Taylor. Goal: log a set in the fewest possible
taps, then compute science-based insights (est. 1RM trends, weekly sets per
muscle group, progressive-overload checks) from clean set-level data.

## Stack and how to run it

- **No build step.** Plain HTML/CSS/JS ES modules in the repo root. Don't
  introduce a bundler/framework without asking — future sessions and quick
  phone-driven edits depend on it staying simple.
- Local preview: `npx serve -l 8123 .` (or the `exercise-app` entry in
  `.claude/launch.json`). Nothing needs installing globally.
- **Deployed: GitHub Pages at https://clarktg08-cloud.github.io/exercise-app/**
  (public repo `clarktg08-cloud/exercise-app`, served from branch `master`,
  root). Pushing to `master` rebuilds the live site within a minute or two —
  **a push IS a deploy here.** Cloudflare Pages was the original plan and is
  still an option later; moving hosts changes the origin, which means Taylor's
  IndexedDB data does NOT follow and must be moved by JSON export/import.
- **`git fetch` before editing** — Taylor works from desktop + phone
  concurrently and sessions have collided on other projects.
- **Never push without Taylor explicitly saying go.** Local commits are fine
  anytime. Since push = deploy, this rule now protects the live app too.
- Service worker (`sw.js`) registers only on non-localhost, so dev never fights
  stale caches. **When deploying, bump `CACHE_VERSION` in sw.js** or phones will
  serve the old app. In practice every commit that touches app files bumps it
  along with `APP_VERSION`, so it is already staged when the go comes. The
  fetch handler is network-first, so an online phone gets updates even without
  the bump; the bump is what protects a phone that was offline.
- **Bump `APP_VERSION` in `js/version.js` with every user-visible change.**
  It shows in the History tab; Taylor uses it to confirm which build he's
  looking at across devices. (Separate from sw.js CACHE_VERSION, which only
  changes on deploys.)

## Where the data lives (danger zone)

- All workout data is in **IndexedDB in the browser** (`js/db.js`, database
  name `exercise-app`). Until cloud sync exists, clearing site data = deleting
  Taylor's training history. Never advise clearing storage as a fix; use the
  JSON export (History tab) first.
- **Form photos are NOT in the JSON export.** They live as blobs in the
  `exerciseImages` store; the export is JSON and stays that way on purpose, so
  the backup protecting irreplaceable training history doesn't balloon to tens
  of MB for pictures that can be re-taken in ten seconds. A restore brings back
  every set and no photos. The History tab says so next to the export button.
- Photos are downscaled to 1000px on the long edge and re-encoded as JPEG
  before storage (~100-200KB each). Never store a raw camera file: they run
  3-12MB and would put the training history at real risk of eviction.
- Planned future: local-first with sync to Cloudflare D1. Google Drive is
  backup/export only, never the live store.
- Schema changes must migrate existing data (bump `DB_VERSION`, write an
  upgrade path). Don't rename/repurpose object stores casually.

## The high-stakes logic

The "money math" here is **logging integrity and the science layer**:

- A logged set must persist exactly as entered. `weight: null` means
  "no load / not measured" (bands, bodyweight) and is NOT the same as 0.
  RPE is optional; null means "not recorded", never a guessed value.
- Science rules: only compute metrics with real evidence (Epley est. 1RM,
  sets-per-muscle-per-week volume, RPE for unloadable exercises). Where
  research gives a range, show the range. **Never invent thresholds or
  dress up guesses as science.** Taylor has an exercise science degree —
  he will catch it.

## Testing rules (from bugs that already shipped elsewhere)

- "It rendered" is not "it's visible": assert with `getComputedStyle()` /
  `getBoundingClientRect()`, not `innerText`.
- Test logging with more than one shape: band exercise with null weight,
  weight 0, reps 1, a custom exercise name with an apostrophe.
- After any future deploy, sample the live URL several times (CDN edges lag).

## Private

This is Taylor's personal training data. The app and repo have no secrets in
them and must stay that way; when sync arrives, tokens go in Cloudflare
secrets / env vars, never in the repo.
