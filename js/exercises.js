// Seed exercise library. Users can add their own; these just prevent a cold start.
// muscles: primary muscle groups the exercise trains (feeds volume-per-muscle analytics).
// load: 'weighted' shows the weight stepper by default; 'unloaded' (bands/bodyweight)
//       starts with no weight and leans on RPE; 'hold' (stretches, planks) logs
//       duration in seconds instead of reps × weight.
// Weight increment is a uniform 2.5 lb (the smallest plate jump Taylor can
// actually load); exercises keep an increment field in the DB for per-exercise
// overrides later, but seeds don't set one.

export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'hips', 'core',
];

export const SEED_EXERCISES = [
  // Legs / hips
  { name: 'Squat',                muscles: ['quads', 'glutes'],        load: 'weighted' },
  { name: 'Leg Press',            muscles: ['quads', 'glutes'],        load: 'weighted' },
  { name: 'Deadlift',             muscles: ['hamstrings', 'glutes', 'back'], load: 'weighted' },
  { name: 'Romanian Deadlift',    muscles: ['hamstrings', 'glutes'],   load: 'weighted' },
  { name: 'Lunge',                muscles: ['quads', 'glutes'],        load: 'weighted' },
  { name: 'Leg Extension',        muscles: ['quads'],                  load: 'weighted' },
  { name: 'Leg Curl',             muscles: ['hamstrings'],             load: 'weighted' },
  { name: 'Calf Raise',           muscles: ['calves'],                 load: 'weighted' },
  { name: 'Hip Thrust',           muscles: ['glutes', 'hamstrings'],   load: 'weighted' },
  { name: 'Glute Bridge',         muscles: ['glutes'],                 load: 'unloaded' },
  { name: '4-Way Hip (band)',     muscles: ['hips', 'glutes'],         load: 'unloaded' },
  { name: 'Band Lateral Walk',    muscles: ['hips', 'glutes'],         load: 'unloaded' },

  // Push
  { name: 'Bench Press',          muscles: ['chest', 'triceps', 'shoulders'], load: 'weighted' },
  { name: 'Incline Press',        muscles: ['chest', 'shoulders', 'triceps'], load: 'weighted' },
  { name: 'Overhead Press',       muscles: ['shoulders', 'triceps'],   load: 'weighted' },
  { name: 'Dumbbell Chest Fly',   muscles: ['chest'],                  load: 'weighted' },
  { name: 'Lateral Raise',        muscles: ['shoulders'],              load: 'weighted' },
  { name: 'Push-Up',              muscles: ['chest', 'triceps', 'shoulders'], load: 'unloaded' },
  { name: 'Dip',                  muscles: ['chest', 'triceps'],       load: 'unloaded' },
  { name: 'Triceps Pushdown',     muscles: ['triceps'],                load: 'weighted' },

  // Pull
  { name: 'Pull-Up',              muscles: ['back', 'biceps'],         load: 'unloaded' },
  { name: 'Lat Pulldown',         muscles: ['back', 'biceps'],         load: 'weighted' },
  { name: 'Seated Row',           muscles: ['back', 'biceps'],         load: 'weighted' },
  { name: 'Dumbbell Row',         muscles: ['back', 'biceps'],         load: 'weighted' },
  { name: 'Face Pull',            muscles: ['shoulders', 'back'],      load: 'weighted' },
  { name: 'Band Pull-Apart',      muscles: ['shoulders', 'back'],      load: 'unloaded' },
  { name: 'Biceps Curl',          muscles: ['biceps'],                 load: 'weighted' },
  { name: 'Hammer Curl',          muscles: ['biceps'],                 load: 'weighted' },

  // Core
  { name: 'Plank',                muscles: ['core'],                   load: 'hold' },
  { name: 'Crunch',               muscles: ['core'],                   load: 'unloaded' },
  { name: 'Back Extension',       muscles: ['back', 'glutes'],         load: 'unloaded' },

  // Stretches (timed holds; band/wall variants welcome as custom exercises)
  { name: 'Hamstring Stretch',        muscles: ['hamstrings'],      load: 'hold' },
  { name: 'Quad Stretch',             muscles: ['quads'],           load: 'hold' },
  { name: 'Calf Stretch (wall)',      muscles: ['calves'],          load: 'hold' },
  { name: 'Hip Flexor Stretch',       muscles: ['hips'],            load: 'hold' },
  { name: 'Figure-4 Glute Stretch',   muscles: ['glutes', 'hips'],  load: 'hold' },
  { name: 'Chest Stretch (doorway)',  muscles: ['chest'],           load: 'hold' },
];
