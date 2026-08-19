// Science layer — pure functions over set-level data.
// Rules (CLAUDE.md): only evidence-based metrics, show ranges where research
// gives ranges, never invent thresholds. Weight null (no load) is excluded
// from strength math, never treated as 0.

// Epley estimated 1RM: weight × (1 + reps/30).
// Returns null when the estimate isn't defensible: no measurable load,
// or reps outside 1–10 (the formula degrades badly at high reps).
export function epley1RM(weight, reps) {
  if (weight === null || weight === undefined || weight <= 0) return null;
  if (!reps || reps < 1 || reps > 10) return null;
  return Math.round(weight * (1 + reps / 30));
}

// Local Monday 00:00 of the week containing d.
export function weekStart(d = new Date()) {
  const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return monday;
}

function workoutDateToLocal(dateKey) {
  const [y, m, day] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, day);
}

// Training sets per muscle group in the week starting at weekStartDate.
// Each logged set counts once toward every muscle group its exercise is
// tagged with. Hold-type exercises (stretches, planks) are excluded: the
// sets-per-week evidence is about resistance-training sets, and counting a
// 45s stretch as a hamstring "set" would dress up a guess as science.
// Returns { muscle: count } for muscles with ≥1 set.
export function weeklySetsPerMuscle(sets, workoutsById, exercisesById, weekStartDate) {
  const weekEnd = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(),
    weekStartDate.getDate() + 7);
  const counts = {};
  for (const s of sets) {
    const w = workoutsById[s.workoutId];
    const ex = exercisesById[s.exerciseId];
    if (!w || !ex) continue;
    if (ex.load === 'hold') continue;
    const d = workoutDateToLocal(w.date);
    if (d < weekStartDate || d >= weekEnd) continue;
    for (const m of ex.muscles ?? []) {
      counts[m] = (counts[m] ?? 0) + 1;
    }
  }
  return counts;
}

// Per-exercise estimated-1RM history: best defensible e1RM per workout date.
// Returns { exerciseId: [{ date, e1rm }] } sorted by date ascending,
// only for exercises with at least one valid estimate.
export function e1rmHistory(sets, workoutsById) {
  const byExerciseDate = {};
  for (const s of sets) {
    const w = workoutsById[s.workoutId];
    if (!w) continue;
    const est = epley1RM(s.weight, s.reps);
    if (est === null) continue;
    const key = s.exerciseId;
    byExerciseDate[key] ??= {};
    byExerciseDate[key][w.date] = Math.max(byExerciseDate[key][w.date] ?? 0, est);
  }
  const out = {};
  for (const [exerciseId, dates] of Object.entries(byExerciseDate)) {
    out[exerciseId] = Object.entries(dates)
      .map(([date, e1rm]) => ({ date, e1rm }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
  return out;
}
