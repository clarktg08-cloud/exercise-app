// Seed exercise library. Users can add their own; these just prevent a cold start.
// muscles: primary muscle groups the exercise trains (feeds volume-per-muscle analytics).
// load: 'weighted' shows the weight stepper by default; 'unloaded' (bands/bodyweight)
//       starts with no weight and leans on RPE; 'hold' (stretches, planks) logs
//       duration in seconds instead of reps × weight.
// Weight increment is a uniform 2.5 lb (the smallest plate jump Taylor can
// actually load); exercises keep an increment field in the DB for per-exercise
// overrides later, but seeds don't set one.
// perSide: the movement is trained one side at a time, so a logged rep count
//       means reps PER SIDE, not total. Sets on these exercises record which
//       side(s) were trained, defaulting to both. Volume still counts one
//       logged set as one set for the muscle — sides are not doubled.

// calves and shins are deliberately separate groups: plantarflexion
// (gastrocnemius / soleus) and dorsiflexion (tibialis anterior) are
// antagonists on opposite sides of the lower leg. Tagging both as "calves"
// would credit the calves for shin work and make the weekly set count
// meaningless for either.
// There is deliberately no 'hips' group: the hip is a joint, not a muscle
// group, and it overlapped 'glutes' (gluteus medius/minimus ARE the main hip
// abductors), so one band drill was counted twice under two names. The hip is
// split by the movement its muscles produce instead.
//
// Known, accepted overlap: gluteus medius is both a glute and an abductor.
// Convention here follows normal practice — 'glutes' means hip extension work
// (glute max dominant), 'abductors' means lateral hip work. The boundary is
// genuinely fuzzy in anatomy; naming it here beats pretending it is crisp.
export const MUSCLE_GROUPS = [
  'chest', 'back', 'shoulders', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'abductors', 'adductors', 'hip flexors',
  'calves', 'shins', 'core',
];

export const SEED_EXERCISES = [
  // Legs / hips
  { name: 'Squat',                muscles: ['quads', 'glutes'],        load: 'weighted' },
  { name: 'Leg Press',            muscles: ['quads', 'glutes'],        load: 'weighted' },
  { name: 'Deadlift',             muscles: ['hamstrings', 'glutes', 'back'], load: 'weighted' },
  { name: 'Romanian Deadlift',    muscles: ['hamstrings', 'glutes'],   load: 'weighted' },
  { name: 'Lunge',                muscles: ['quads', 'glutes'],        load: 'weighted', perSide: true },
  { name: 'Leg Extension',        muscles: ['quads'],                  load: 'weighted' },
  { name: 'Leg Curl',             muscles: ['hamstrings'],             load: 'weighted' },
  // Lower leg. Standing calf raise biases gastrocnemius (knee straight),
  // seated biases soleus (knee bent); tibialis raise is the dorsiflexion
  // antagonist, the one runners usually skip.
  { name: 'Calf Raise',           muscles: ['calves'],                 load: 'weighted' },
  { name: 'Seated Calf Raise',    muscles: ['calves'],                 load: 'weighted' },
  { name: 'Tibialis Raise',       muscles: ['shins'],                  load: 'unloaded' },
  { name: 'Hip Thrust',           muscles: ['glutes', 'hamstrings'],   load: 'weighted' },
  { name: 'Glute Bridge',         muscles: ['glutes'],                 load: 'unloaded' },
  // One set of 4-way hip is a set in each direction, so it credits one set to
  // each of the four muscle groups those directions train. Accurate volume
  // without splitting it into four exercises or costing extra taps.
  { name: '4-Way Hip (band)',     muscles: ['hip flexors', 'glutes', 'abductors', 'adductors'],
                                                                       load: 'unloaded', perSide: true },
  { name: 'Band Lateral Walk',    muscles: ['abductors', 'glutes'],    load: 'unloaded' },

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
  { name: 'Dumbbell Row',         muscles: ['back', 'biceps'],         load: 'weighted', perSide: true },
  { name: 'Face Pull',            muscles: ['shoulders', 'back'],      load: 'weighted' },
  { name: 'Band Pull-Apart',      muscles: ['shoulders', 'back'],      load: 'unloaded' },
  { name: 'Biceps Curl',          muscles: ['biceps'],                 load: 'weighted' },
  { name: 'Hammer Curl',          muscles: ['biceps'],                 load: 'weighted' },

  // Core
  { name: 'Plank',                muscles: ['core'],                   load: 'hold' },
  { name: 'Crunch',               muscles: ['core'],                   load: 'unloaded' },
  { name: 'Back Extension',       muscles: ['back', 'glutes'],         load: 'unloaded' },

  // Stretches (timed holds; band/wall variants welcome as custom exercises)
  { name: 'Hamstring Stretch',        muscles: ['hamstrings'],      load: 'hold', perSide: true },
  { name: 'Quad Stretch',             muscles: ['quads'],           load: 'hold', perSide: true },
  { name: 'Calf Stretch (wall)',      muscles: ['calves'],          load: 'hold', perSide: true },
  { name: 'Hip Flexor Stretch',       muscles: ['hip flexors'],     load: 'hold', perSide: true },
  { name: 'Figure-4 Glute Stretch',   muscles: ['glutes'],          load: 'hold', perSide: true },
  // Leg held straight out with the torso rotated away, so the leg crosses the
  // midline relative to the pelvis: gluteus medius/minimus, TFL and the
  // lateral hamstring (biceps femoris) lengthen. Taylor feels it on the
  // OUTSIDE of the leg, which is what settles it — a photo makes the hip look
  // abducted, but abduction would shorten these, not stretch them. No
  // adductor tag for that reason. Hold-type, so the tags stay out of the
  // weekly set math (see insights.js) and only drive the picker filter.
  { name: 'Seated Straight-Leg Abductor Stretch',
    muscles: ['abductors', 'hamstrings', 'glutes'], load: 'hold', perSide: true },
  { name: 'Chest Stretch (doorway)',  muscles: ['chest'],           load: 'hold' },
];
