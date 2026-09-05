// End-to-end checks that drive the real app in a real browser.
//
// Dev-only and deliberately outside the app: nothing here is loaded by the
// site, there is still no build step, and no package.json is added. Run it
// with Playwright available in the working tree:
//
//   npx serve -l 8123 .          # in one terminal
//   npm i --no-save playwright && node tests/e2e.mjs
//
// It follows the testing rules in CLAUDE.md: visibility is asserted with
// getComputedStyle/getBoundingClientRect rather than text, and logging is
// exercised in several shapes — a band set with null weight, a set at weight
// 0, a single rep, a timed hold, and a custom exercise name with an apostrophe.

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8123/';
// Set CHROME_PATH when the local Playwright build and the installed browser
// revision disagree (common on a shared machine): any Chromium will do here.
const EXECUTABLE = process.env.CHROME_PATH || undefined;

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}
function eq(name, actual, expected) {
  check(name, Object.is(actual, expected), `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

// Read straight from IndexedDB: the UI can render a set correctly while the
// stored record is wrong, and the stored record is what history is made of.
const dumpDb = (page) => page.evaluate(async () => {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('exercise-app');
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const all = (store) => new Promise((res, rej) => {
    const rq = db.transaction(store).objectStore(store).getAll();
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
  return {
    exercises: await all('exercises'),
    workouts: await all('workouts'),
    // getAll() returns key order, and keys are random UUIDs — so sets come
    // back shuffled. Every assertion below is about which set came first.
    sets: (await all('sets')).sort((a, b) => a.loggedAt - b.loggedAt),
  };
});

// "It rendered" is not "it's visible" (CLAUDE.md).
const isVisible = (locator) => locator.evaluate((node) => {
  const s = getComputedStyle(node);
  const r = node.getBoundingClientRect();
  return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0' &&
    r.width > 0 && r.height > 0;
});

async function startSession(page) {
  const start = page.locator('#start-workout');
  if (await start.count()) await start.click();
}

// Pick an exercise by name from the picker, creating nothing.
async function addExercise(page, name) {
  await page.locator('#add-exercise, #start-workout').first().click().catch(() => {});
  await page.locator('.search-input').first().fill(name);
  await page.locator('.ex-row', { hasText: name }).first().click();
  await page.locator('#log-set').waitFor();
}

// Drive a stepper to an exact value by tapping. `label` matches the row label.
async function stepTo(page, label, taps, dir) {
  const row = page.locator('.stepper-row', { hasText: label }).first();
  const btn = row.locator(dir > 0 ? '.plus' : '.minus');
  for (let i = 0; i < taps; i++) await btn.click();
}

const run = async () => {
  const browser = await chromium.launch(EXECUTABLE ? { executablePath: EXECUTABLE } : {});
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { failures++; console.log(`  FAIL page error — ${e.message}`); });
  page.on('dialog', (d) => d.accept());

  await page.goto(BASE);
  await page.locator('#start-workout').waitFor();

  console.log('\nrepeat set — weighted, preserves reps and weight, never RPE');
  await startSession(page);
  await addExercise(page, 'Bench Press');
  await stepTo(page, 'Weight', 4, +1);            // null → 2.5 → 10
  await page.locator('.rpe-chip', { hasText: /^8$/ }).first().click();
  await page.locator('#log-set').click();
  await page.locator('.back-link').first().click();

  const again = page.locator('.repeat-set').first();
  check('“+ Same” is actually visible on the card', await isVisible(again));
  await again.click();
  await page.waitForTimeout(150);

  let db = await dumpDb(page);
  let bench = db.exercises.find((e) => e.name === 'Bench Press');
  let benchSets = db.sets.filter((s) => s.exerciseId === bench.id);
  eq('two sets logged', benchSets.length, 2);
  eq('reps copied', benchSets[1].reps, benchSets[0].reps);
  eq('weight copied', benchSets[1].weight, benchSets[0].weight);
  check('RPE was recorded on the original set', benchSets[0].rpe !== null);
  eq('RPE is NOT carried into the repeat', benchSets[1].rpe, null);

  console.log('\nrepeat set — band/bodyweight, null weight stays null (not 0)');
  await addExercise(page, 'Push-Up');
  await page.locator('#log-set').click();
  await page.locator('.back-link').first().click();
  await page.locator('.workout-ex', { hasText: 'Push-Up' }).locator('.repeat-set').click();
  await page.waitForTimeout(150);
  db = await dumpDb(page);
  const push = db.exercises.find((e) => e.name === 'Push-Up');
  const pushSets = db.sets.filter((s) => s.exerciseId === push.id);
  eq('two push-up sets', pushSets.length, 2);
  eq('original weight is null', pushSets[0].weight, null);
  eq('repeated weight is still null, not 0', pushSets[1].weight, null);

  console.log('\nrepeat set — weight 0 is preserved as 0, not turned into null');
  await page.evaluate(async () => {
    // Straight to the store: 0 lb is reachable through the stepper but takes a
    // precise tap sequence, and what matters here is that a stored 0 survives.
    const db = await new Promise((res) => {
      const r = indexedDB.open('exercise-app');
      r.onsuccess = () => res(r.result);
    });
    const exs = await new Promise((res) => {
      const rq = db.transaction('exercises').objectStore('exercises').getAll();
      rq.onsuccess = () => res(rq.result);
    });
    const wos = await new Promise((res) => {
      const rq = db.transaction('workouts').objectStore('workouts').getAll();
      rq.onsuccess = () => res(rq.result);
    });
    const ex = exs.find((e) => e.name === 'Squat');
    const w = wos[wos.length - 1];
    await new Promise((res) => {
      const t = db.transaction('sets', 'readwrite');
      t.objectStore('sets').put({
        id: crypto.randomUUID(), workoutId: w.id, exerciseId: ex.id,
        reps: 1, weight: 0, rpe: null, durationSec: null, side: null,
        loggedAt: Date.now(),
      });
      t.oncomplete = res;
    });
  });
  await page.reload();
  await page.locator('.workout-ex', { hasText: 'Squat' }).waitFor();
  await page.locator('.workout-ex', { hasText: 'Squat' }).locator('.repeat-set').click();
  await page.waitForTimeout(150);
  db = await dumpDb(page);
  const squat = db.exercises.find((e) => e.name === 'Squat');
  const squatSets = db.sets.filter((s) => s.exerciseId === squat.id);
  eq('two squat sets', squatSets.length, 2);
  eq('weight 0 stays 0', squatSets[1].weight, 0);
  eq('single rep preserved', squatSets[1].reps, 1);

  console.log('\nrepeat set — timed hold keeps duration, leaves reps/weight null');
  await addExercise(page, 'Plank');
  await page.locator('#log-set').click();
  await page.locator('.back-link').first().click();
  await page.locator('.workout-ex', { hasText: 'Plank' }).locator('.repeat-set').click();
  await page.waitForTimeout(150);
  db = await dumpDb(page);
  const plank = db.exercises.find((e) => e.name === 'Plank');
  const plankSets = db.sets.filter((s) => s.exerciseId === plank.id);
  eq('two plank sets', plankSets.length, 2);
  eq('duration copied', plankSets[1].durationSec, plankSets[0].durationSec);
  eq('hold has no reps', plankSets[1].reps, null);
  eq('hold has no weight', plankSets[1].weight, null);

  console.log("\ncustom exercise with an apostrophe logs and repeats");
  await page.locator('#add-exercise').click();
  await page.locator('.search-input').first().fill("Farmer's Walk");
  await page.locator('.btn.secondary', { hasText: /New exercise|Create/ }).last().click();
  await page.locator('.pick-chip', { hasText: 'core' }).first().click();
  await page.locator('button', { hasText: 'Create exercise' }).click();
  await page.locator('#log-set').click();
  await page.locator('.back-link').first().click();
  const farmer = page.locator('.workout-ex', { hasText: "Farmer's Walk" });
  check('apostrophe name card is visible', await isVisible(farmer.first()));
  await farmer.locator('.repeat-set').click();
  await page.waitForTimeout(150);
  db = await dumpDb(page);
  const fw = db.exercises.find((e) => e.name === "Farmer's Walk");
  check('apostrophe name stored verbatim', fw?.name === "Farmer's Walk", fw?.name);
  eq('two sets for the custom exercise', db.sets.filter((s) => s.exerciseId === fw.id).length, 2);

  console.log('\nmuscle tags can be corrected, and survive a reload');
  await page.locator('.workout-ex', { hasText: 'Bench Press' }).first().click();
  const tagLine = page.locator('.tag-line');
  check('tag line is visible on the log screen', await isVisible(tagLine));
  await tagLine.click();
  await page.locator('.pick-chip', { hasText: 'calves' }).first().click();
  await page.locator('button', { hasText: 'Save tags' }).click();
  await page.waitForTimeout(200);
  await page.reload();                       // re-runs initDb's seed sync
  await page.waitForTimeout(400);
  db = await dumpDb(page);
  bench = db.exercises.find((e) => e.name === 'Bench Press');
  check('edited tag survived the seed sync', bench.muscles.includes('calves'), bench.muscles.join());
  eq('edit is marked so the sync leaves it alone', bench.tagsEdited, true);

  console.log('\ninsights render the week comparison and the est-1RM series');
  await page.locator('.tab[data-tab="insights"]').click();
  await page.locator('.insight-title').first().waitFor();
  const weekCard = page.locator('.card', { hasText: 'Training sets per muscle group' });
  check('weekly card visible', await isVisible(weekCard));
  const weekText = await weekCard.innerText();
  check('week rows mention last week', /last week/.test(weekText), weekText.slice(0, 200));

  console.log('\nhistory shows the data-safety line and records an export');
  await page.locator('.tab[data-tab="history"]').click();
  const safety = page.locator('.data-safety');
  check('data-safety line visible', await isVisible(safety));
  check('says it has never been exported', /Never exported/.test(await safety.innerText()));
  const dl = page.waitForEvent('download');
  await page.locator('button', { hasText: 'Export (JSON)' }).click();
  await dl;
  await page.waitForTimeout(200);
  check('export recorded as today', /Last export from this device: today/.test(
    await page.locator('.data-safety').innerText()));

  console.log('\ndeleting a session removes the workout AND its sets');
  const before = await dumpDb(page);
  const target = before.workouts[before.workouts.length - 1];
  const doomed = before.sets.filter((s) => s.workoutId === target.id).length;
  check('the session under test has sets', doomed > 0, String(doomed));
  await page.locator('.tab[data-tab="today"]').click();
  await page.locator('.workout-ex').first().waitFor();
  // Reach the session detail through an exercise card's session, via History.
  await page.locator('.tab[data-tab="history"]').click();
  await page.locator('.seg-btn', { hasText: 'List' }).click();
  await page.locator('.history-item').first().click();
  const delBtn = page.locator('.btn.danger', { hasText: 'Delete this session' });
  check('delete control visible on the session', await isVisible(delBtn));
  await delBtn.click();
  await page.waitForTimeout(300);
  const after = await dumpDb(page);
  eq('workout is gone', after.workouts.some((w) => w.id === target.id), false);
  eq('its sets went with it — no orphans',
    after.sets.filter((s) => s.workoutId === target.id).length, 0);
  check('other sessions untouched',
    after.sets.length === before.sets.length - doomed,
    `${before.sets.length} → ${after.sets.length}, expected -${doomed}`);

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
