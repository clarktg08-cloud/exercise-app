// Seed exercise library. Users can add their own; these just prevent a cold start.
// muscles: primary muscle groups the exercise trains (feeds volume-per-muscle analytics).
// load: 'weighted' shows the weight stepper by default; 'unloaded' (bands/bodyweight)
//       hides it and leans on RPE instead. increment = weight stepper step in lb.

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'hips', 'core',
];

export const SEED_EXERCISES = [
  // Legs / hips
  { name: 'Squat',                muscles: ['quads', 'glutes'],        load: 'weighted', increment: 10 },
  { name: 'Leg Press',            muscles: ['quads', 'glutes'],        load: 'weighted', increment: 10 },
  { name: 'Deadlift',             muscles: ['hamstrings', 'glutes', 'back'], load: 'weighted', increment: 10 },
  { name: 'Romanian Deadlift',    muscles: ['hamstrings', 'glutes'],   load: 'weighted', increment: 10 },
  { name: 'Lunge',                muscles: ['quads', 'glutes'],        load: 'weighted', increment: 5 },
  { name: 'Leg Extension',        muscles: ['quads'],                  load: 'weighted', increment: 5 },
  { name: 'Leg Curl',             muscles: ['hamstrings'],             load: 'weighted', increment: 5 },
  { name: 'Calf Raise',           muscles: ['calves'],                 load: 'weighted', increment: 10 },
  { name: 'Hip Thrust',           muscles: ['glutes', 'hamstrings'],   load: 'weighted', increment: 10 },
  { name: 'Glute Bridge',         muscles: ['glutes'],                 load: 'unloaded' },
  { name: '4-Way Hip (band)',     muscles: ['hips', 'glutes'],         load: 'unloaded' },
  { name: 'Band Lateral Walk',    muscles: ['hips', 'glutes'],         load: 'unloaded' },

  // Push
  { name: 'Bench Press',          muscles: ['chest', 'triceps', 'shoulders'], load: 'weighted', increment: 5 },
  { name: 'Incline Press',        muscles: ['chest', 'shoulders', 'triceps'], load: 'weighted', increment: 5 },
  { name: 'Overhead Press',       muscles: ['shoulders', 'triceps'],   load: 'weighted', increment: 5 },
  { name: 'Dumbbell Chest Fly',   muscles: ['chest'],                  load: 'weighted', increment: 5 },
  { name: 'Lateral Raise',        muscles: ['shoulders'],              load: 'weighted', increment: 5 },
  { name: 'Push-Up',              muscles: ['chest', 'triceps', 'shoulders'], load: 'unloaded' },
  { name: 'Dip',                  muscles: ['chest', 'triceps'],       load: 'unloaded' },
  { name: 'Triceps Pushdown',     muscles: ['triceps'],                load: 'weighted', increment: 5 },

  // Pull
  { name: 'Pull-Up',              muscles: ['back', 'biceps'],         load: 'unloaded' },
  { name: 'Lat Pulldown',         muscles: ['back', 'biceps'],         load: 'weighted', increment: 5 },
  { name: 'Seated Row',           muscles: ['back', 'biceps'],         load: 'weighted', increment: 5 },
  { name: 'Dumbbell Row',         muscles: ['back', 'biceps'],         load: 'weighted', increment: 5 },
  { name: 'Face Pull',            muscles: ['shoulders', 'back'],      load: 'weighted', increment: 5 },
  { name: 'Band Pull-Apart',      muscles: ['shoulders', 'back'],      load: 'unloaded' },
  { name: 'Biceps Curl',          muscles: ['biceps'],                 load: 'weighted', increment: 5 },
  { name: 'Hammer Curl',          muscles: ['biceps'],                 load: 'weighted', increment: 5 },

  // Core
  { name: 'Plank',                muscles: ['core'],                   load: 'unloaded' },
  { name: 'Crunch',               muscles: ['core'],                   load: 'unloaded' },
  { name: 'Back Extension',       muscles: ['back', 'glutes'],         load: 'unloaded' },
];
