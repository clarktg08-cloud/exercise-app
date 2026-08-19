// IndexedDB layer. All training data lives here until cloud sync exists —
// see CLAUDE.md before changing stores or DB_VERSION.
//
// Stores:
//   exercises: { id, name, muscles[], load ('weighted'|'unloaded'|'hold'),
//                increment, isCustom, createdAt, notes? }
//   workouts:  { id, date 'YYYY-MM-DD', startedAt, endedAt|null, notes,
//                plannedExerciseIds? (from "repeat workout"; logged sets are
//                the source of truth — planned is just a to-do list) }
//   sets:      { id, workoutId, exerciseId, reps|null, weight|null, rpe|null,
//                durationSec|null, loggedAt }
// weight null = no load / not measured (bands, bodyweight). Not the same as 0.
// Hold-type sets (stretches, planks) use durationSec with reps/weight null.

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
          isCustom: false,
          createdAt: now,
        });
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
}

// --- exercises ---

export function listExercises() {
  return getAll('exercises').then((list) =>
    list.sort((a, b) => a.name.localeCompare(b.name)));
}

export async function addExercise({ name, muscles, load, increment }) {
  const db = await openDb();
  const exercise = {
    id: crypto.randomUUID(),
    name,
    muscles,
    load,
    increment: increment ?? 2.5,
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

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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

export async function logSet({ workoutId, exerciseId, reps, weight, rpe, durationSec }) {
  const db = await openDb();
  const set = {
    id: crypto.randomUUID(),
    workoutId,
    exerciseId,
    reps: reps ?? null,
    weight: weight ?? null,
    rpe: rpe ?? null,
    durationSec: durationSec ?? null,
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
