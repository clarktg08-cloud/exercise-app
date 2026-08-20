// IndexedDB layer. All training data lives here until cloud sync exists —
// see CLAUDE.md before changing stores or DB_VERSION.
//
// Stores:
//   exercises: { id, name, muscles[], load ('weighted'|'unloaded'|'hold'),
//                increment, isCustom, createdAt, notes?, perSide?, restSec? }
//   restSec: the user's own rest target for this exercise, in seconds. Absent
//            means "use the suggested default from the reps just logged".
//   workouts:  { id, date 'YYYY-MM-DD', startedAt, endedAt|null, notes,
//                plannedExerciseIds? (from "repeat workout"; logged sets are
//                the source of truth — planned is just a to-do list) }
//   sets:      { id, workoutId, exerciseId, reps|null, weight|null, rpe|null,
//                durationSec|null, side|null, loggedAt }
// weight null = no load / not measured (bands, bodyweight). Not the same as 0.
// Hold-type sets (stretches, planks) use durationSec with reps/weight null.
// side: null   = not a one-side-at-a-time exercise (reps are the whole set)
//       'both' = per-side exercise, both sides trained (the normal case)
//       'left' | 'right' = only that side was trained
// Side lives on the SET, not derived from the exercise, so a past set keeps
// its meaning even if the exercise's perSide flag changes later. Sets logged
// before this field existed have side undefined and read as null.

import { SEED_EXERCISES } from './exercises.js';

const DB_NAME = 'exercise-app';
const DB_VERSION = 1;

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      const ex = db.createObjectStore('exercises', { keyPath: 'id' });
      ex.createIndex('name', 'name', { unique: false });
      const wo = db.createObjectStore('workouts', { keyPath: 'id' });
      wo.createIndex('date', 'date', { unique: false });
      const sets = db.createObjectStore('sets', { keyPath: 'id' });
      sets.createIndex('workoutId', 'workoutId', { unique: false });
      sets.createIndex('exerciseId', 'exerciseId', { unique: false });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const result = fn(t.objectStore(store));
    t.oncomplete = () => resolve(result.result !== undefined ? result.result : result);
    t.onerror = () => reject(t.error);
  });
}

function getAll(store) {
  return openDb().then((db) =>
    new Promise((resolve, reject) => {
      const req = db.transaction(store).objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    })
  );
}

export async function initDb() {
  const db = await openDb();
  const existing = await getAll('exercises');
  const byName = new Map(existing.map((e) => [e.name, e]));
  const now = Date.now();
  // Seed-sync: insert seed exercises that are missing, and update non-custom
  // ones whose definition changed (e.g. Plank became a timed hold). Custom
  // exercises are never touched.
  await tx(db, 'exercises', 'readwrite', (store) => {
    for (const e of SEED_EXERCISES) {
      const cur = byName.get(e.name);
      if (!cur) {
        store.put({
          id: crypto.randomUUID(),
          name: e.name,
          muscles: e.muscles,
          load: e.load,
          increment: e.increment ?? 2.5,
          perSide: e.perSide === true,
          isCustom: false,
          createdAt: now,
        });
      } else if (cur.perSide === undefined) {
        // One-time backfill for exercises stored before perSide existed.
        // Deliberately separate from the sync below: it fires only when the
        // field is absent, so a later edit to perSide is never clobbered.
        store.put({ ...cur, perSide: e.perSide === true });
      } else if (!cur.isCustom &&
                 (cur.load !== e.load ||
                  cur.muscles.join() !== e.muscles.join() ||
                  cur.increment !== (e.increment ?? 2.5))) {
        store.put({ ...cur, load: e.load, muscles: e.muscles,
                    increment: e.increment ?? 2.5 });
      }
    }
    return store.count();
  });
  await migrateSessions();
}

// Bring stored workouts in line with the session model:
//   1. re-date each workout from its real start time using the 4am boundary
//   2. split any workout whose sets contain a gap longer than SESSION_GAP_MS
//      into separate sessions (a set logged, then sleep, then more sets)
// Runs on every startup by design: it is idempotent, because once a workout
// has been split it contains no oversized gaps and its date already matches.
// Nothing is deleted and no timestamp is altered — sets only ever change which
// session they point at.
async function migrateSessions() {
  const db = await openDb();
  const [workouts, sets] = await Promise.all([getAll('workouts'), getAll('sets')]);
  const byWorkout = {};
  for (const s of sets) (byWorkout[s.workoutId] ??= []).push(s);

  const changed = [];
  const created = [];
  const moved = [];

  for (const w of workouts) {
    const list = (byWorkout[w.id] ?? []).sort((a, b) => a.loggedAt - b.loggedAt);

    if (list.length === 0) {
      const date = trainingDayKey(w.startedAt);
      if (w.date !== date) changed.push({ ...w, date });
      continue;
    }

    const runs = [[list[0]]];
    for (let i = 1; i < list.length; i++) {
      if (list[i].loggedAt - list[i - 1].loggedAt > SESSION_GAP_MS) runs.push([list[i]]);
      else runs[runs.length - 1].push(list[i]);
    }

    // The original record keeps the first run, so its id and any notes survive.
    const firstDate = trainingDayKey(w.startedAt);
    if (w.date !== firstDate) changed.push({ ...w, date: firstDate });

    for (let i = 1; i < runs.length; i++) {
      const run = runs[i];
      const startedAt = run[0].loggedAt;
      const session = {
        id: crypto.randomUUID(),
        date: trainingDayKey(startedAt),
        startedAt,
        endedAt: run[run.length - 1].loggedAt,
        notes: '',
        plannedExerciseIds: [],
      };
      created.push(session);
      for (const s of run) moved.push({ ...s, workoutId: session.id });
    }
  }

  if (changed.length || created.length) {
    await tx(db, 'workouts', 'readwrite', (store) => {
      for (const w of [...changed, ...created]) store.put(w);
      return store.count();
    });
  }
  if (moved.length) {
    await tx(db, 'sets', 'readwrite', (store) => {
      for (const s of moved) store.put(s);
      return store.count();
    });
  }
  return { redated: changed.length, split: created.length, setsMoved: moved.length };
}

// --- exercises ---

export function listExercises() {
  return getAll('exercises').then((list) =>
    list.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function addExercise({ name, muscles, load, increment, perSide }) {
  const db = await openDb();
  const exercise = {
    id: crypto.randomUUID(),
    name,
    muscles,
    load,
    increment: increment ?? 2.5,
    perSide: perSide === true,
    isCustom: true,
    createdAt: Date.now(),
  };
  await tx(db, 'exercises', 'readwrite', (s) => s.put(exercise));
  return exercise;
}

export async function updateExercise(exercise) {
  const db = await openDb();
  await tx(db, 'exercises', 'readwrite', (s) => s.put(exercise));
  return exercise;
}

// --- workouts ---

// A training day starts at 4am, not midnight: a session logged at 1:25am
// belongs to the night before, which is how it is trained and remembered.
// loggedAt / startedAt are never rewritten — the day is DERIVED from them,
// so changing this boundary regroups history correctly instead of corrupting it.
export const DAY_START_HOUR = 4;

// A gap longer than this means you left and came back, so the next set starts
// a new session rather than joining the old one. Sleep clears it comfortably.
export const SESSION_GAP_MS = 3 * 60 * 60 * 1000;

function dateKeyOf(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Which training day a moment belongs to.
export function trainingDayKey(ts = Date.now()) {
  const d = new Date(ts);
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1);
  return dateKeyOf(d);
}

// Raw calendar date, for things that genuinely mean "today" (export filenames).
export function todayKey(d = new Date()) {
  return dateKeyOf(d);
}

export async function getWorkoutByDate(date) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('workouts').objectStore('workouts')
      .index('date').getAll(date);
    req.onsuccess = () => resolve(req.result[0] ?? null);
    req.onerror = () => reject(req.error);
  });
}

// Every workout on a training day, oldest session first.
export async function workoutsForDay(date) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('workouts').objectStore('workouts')
      .index('date').getAll(date);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.startedAt - b.startedAt));
    req.onerror = () => reject(req.error);
  });
}

// The session still in progress, or null. A session is live while its most
// recent set (or its start, if empty) is inside SESSION_GAP_MS.
export async function getActiveWorkout(now = Date.now()) {
  const [workouts, sets] = await Promise.all([getAll('workouts'), getAll('sets')]);
  if (workouts.length === 0) return null;
  const lastActivity = {};
  for (const s of sets) {
    lastActivity[s.workoutId] = Math.max(lastActivity[s.workoutId] ?? 0, s.loggedAt);
  }
  const candidates = workouts
    .map((w) => ({ w, at: lastActivity[w.id] ?? w.startedAt }))
    .sort((a, b) => b.at - a.at);
  const newest = candidates[0];
  return now - newest.at <= SESSION_GAP_MS ? newest.w : null;
}

export async function startWorkout(date, plannedExerciseIds = []) {
  const db = await openDb();
  const workout = {
    id: crypto.randomUUID(),
    date,
    startedAt: Date.now(),
    endedAt: null,
    notes: '',
    plannedExerciseIds,
  };
  await tx(db, 'workouts', 'readwrite', (s) => s.put(workout));
  return workout;
}

export async function updateWorkout(workout) {
  const db = await openDb();
  await tx(db, 'workouts', 'readwrite', (s) => s.put(workout));
  return workout;
}

export function listWorkouts() {
  return getAll('workouts').then((list) =>
    list.sort((a, b) => b.date.localeCompare(a.date)));
}

// --- sets ---

export async function logSet({ workoutId, exerciseId, reps, weight, rpe, durationSec, side }) {
  const db = await openDb();
  const set = {
    id: crypto.randomUUID(),
    workoutId,
    exerciseId,
    reps: reps ?? null,
    weight: weight ?? null,
    rpe: rpe ?? null,
    durationSec: durationSec ?? null,
    side: side ?? null,
    loggedAt: Date.now(),
  };
  await tx(db, 'sets', 'readwrite', (s) => s.put(set));
  return set;
}

export async function updateSet(set) {
  const db = await openDb();
  await tx(db, 'sets', 'readwrite', (s) => s.put(set));
  return set;
}

export async function deleteSet(id) {
  const db = await openDb();
  await tx(db, 'sets', 'readwrite', (s) => s.delete(id));
}

export async function setsForWorkout(workoutId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('sets').objectStore('sets')
      .index('workoutId').getAll(workoutId);
    req.onsuccess = () => resolve(req.result.sort((a, b) => a.loggedAt - b.loggedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function lastSetForExercise(exerciseId) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction('sets').objectStore('sets')
      .index('exerciseId').getAll(exerciseId);
    req.onsuccess = () => {
      const sets = req.result.sort((a, b) => b.loggedAt - a.loggedAt);
      resolve(sets[0] ?? null);
    };
    req.onerror = () => reject(req.error);
  });
}

// The most recent previous session that included this exercise: the workout
// plus every set of this exercise logged in it, oldest first. Pass today's
// workout id as excludeWorkoutId so "last time" means the last session, not
// the set logged a minute ago. Returns null if there is no earlier session.
export async function lastSessionForExercise(exerciseId, excludeWorkoutId = null) {
  const db = await openDb();
  const all = await new Promise((resolve, reject) => {
    const req = db.transaction('sets').objectStore('sets')
      .index('exerciseId').getAll(exerciseId);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const candidates = all.filter((s) => s.workoutId !== excludeWorkoutId);
  if (candidates.length === 0) return null;
  const latest = candidates.reduce((a, b) => (b.loggedAt > a.loggedAt ? b : a));
  const sets = candidates
    .filter((s) => s.workoutId === latest.workoutId)
    .sort((a, b) => a.loggedAt - b.loggedAt);
  const workout = await new Promise((resolve, reject) => {
    const req = db.transaction('workouts').objectStore('workouts').get(latest.workoutId);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
  return { workout, sets };
}

// Most recently used exercises, newest first.
export async function recentExerciseIds(limit = 8) {
  const all = await getAll('sets');
  all.sort((a, b) => b.loggedAt - a.loggedAt);
  const seen = [];
  for (const s of all) {
    if (!seen.includes(s.exerciseId)) seen.push(s.exerciseId);
    if (seen.length >= limit) break;
  }
  return seen;
}

export function listSets() {
  return getAll('sets');
}

// --- export / import ---

export async function exportAll() {
  const [exercises, workouts, sets] = await Promise.all([
    getAll('exercises'), getAll('workouts'), getAll('sets'),
  ]);
  return { exportedAt: new Date().toISOString(), version: DB_VERSION, exercises, workouts, sets };
}

// Restore from an exportAll() JSON file. Merge semantics: records are matched
// by id; imported records overwrite same-id records, everything else is kept.
// Never deletes anything.
export async function importAll(data) {
  const db = await openDb();
  const counts = { exercises: 0, workouts: 0, sets: 0 };
  for (const store of ['exercises', 'workouts', 'sets']) {
    const items = Array.isArray(data[store]) ? data[store] : [];
    if (items.length === 0) continue;
    await tx(db, store, 'readwrite', (s) => {
      for (const item of items) {
        if (item && typeof item.id === 'string') {
          s.put(item);
          counts[store]++;
        }
      }
      return s.count();
    });
  }
  return counts;
}
