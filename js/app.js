import {
  initDb, listExercises, addExercise, updateExercise,
  todayKey, trainingDayKey, getWorkoutByDate, getActiveWorkout, workoutsForDay,
  startWorkout, updateWorkout, listWorkouts,
  logSet, updateSet, deleteSet, setsForWorkout, lastSetForExercise,
  lastSessionForExercise,
  recentExerciseIds, listSets, exportAll, importAll,
} from './db.js';
import { MUSCLE_GROUPS } from './exercises.js';
import { APP_VERSION } from './version.js';
import { weekStart, weeklySetsPerMuscle, e1rmHistory } from './insights.js';

const view = document.getElementById('view');
const headerTitle = document.getElementById('header-title');
const headerDate = document.getElementById('header-date');

const state = {
  tab: 'today',            // 'today' | 'insights' | 'history'
  screen: 'today',         // 'today' | 'picker' | 'log' | 'create' | 'insights'
                           //   | 'history' | 'workout-detail' | 'edit-set'
  workout: null,           // today's workout, if started
  exercise: null,          // exercise being logged
  detailWorkout: null,     // workout opened from history
  reps: 10,
  weight: null,
  rpe: null,
  durationSec: 30,
  side: null,              // null | 'both' | 'left' | 'right' (see db.js)
  search: '',
  createName: '',          // prefill for the new-exercise form
  createLoad: 'weighted',
  createMuscles: new Set(),
  createPerSide: false,
  filterLoad: null,        // picker filter: null | 'weighted' | 'unloaded' | 'hold'
  filterMuscle: null,      // picker filter: null | a MUSCLE_GROUPS entry
  editSet: null,           // set being edited
  editReturn: 'today',     // screen to go back to after editing
};

function fmtDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' });
}

// What a set's `side` value adds to its description. null/undefined means the
// exercise isn't done one side at a time, so nothing is added.
const SIDE_NOTE = {
  both: ' per side',
  left: ' (left only)',
  right: ' (right only)',
};

function sideNote(side) {
  return SIDE_NOTE[side] ?? '';
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// A session that started after midnight belongs to the previous training day,
// so its clock time alone reads as though it came first. Naming the clock day
// removes the ambiguity: "12:49 AM Thu" under a Wednesday heading.
function sessionTime(w) {
  const t = fmtTime(w.startedAt);
  if (todayKey(new Date(w.startedAt)) === w.date) return t;
  return `${t} ${new Date(w.startedAt).toLocaleDateString(undefined, { weekday: 'short' })}`;
}

function setDesc(s) {
  const rpe = s.rpe === null || s.rpe === undefined ? '' : ` @ RPE ${s.rpe}`;
  const side = sideNote(s.side);
  if (s.durationSec !== null && s.durationSec !== undefined) {
    return `${s.durationSec}s hold${side}${rpe}`;
  }
  const w = s.weight === null ? '—' : `${s.weight} lb`;
  return `${s.reps} reps × ${w}${side}${rpe}`;
}

// One past session's sets, condensed for the "Last time" line. Same-weight
// sessions collapse to "135 lb × 10, 8, 6"; varied ones stay explicit.
// weight null (bands, bodyweight) shows reps only — never "0 lb".
function sessionDesc(sets) {
  const isHold = (s) => s.durationSec !== null && s.durationSec !== undefined;
  const reps = (list) => `${list.join(', ')} rep${list.length === 1 && list[0] === 1 ? '' : 's'}`;
  let body;
  if (sets.every(isHold)) {
    body = sets.map((s) => `${s.durationSec}s`).join(', ');
  } else if (sets.every((s) => !isHold(s))) {
    const w = sets[0].weight;
    if (sets.every((s) => s.weight === w)) {
      const list = sets.map((s) => s.reps);
      body = w === null ? reps(list) : `${w} lb × ${list.join(', ')}`;
    } else {
      body = sets.map((s) => s.weight === null
        ? reps([s.reps]) : `${s.weight} lb × ${s.reps}`).join(', ');
    }
  } else {
    body = sets.map(setDesc).join('; ');
  }
  // Side, when the whole session agrees. Mixed sides are called out rather
  // than silently dropped, since that changes what the reps mean.
  const sides = new Set(sets.map((s) => s.side ?? null));
  if (sides.size === 1) {
    body += sideNote([...sides][0]);
  } else {
    body += ' (sides vary)';
  }

  // RPE only when every set has one — a partial range would overstate it.
  const rpes = sets.map((s) => s.rpe).filter((r) => r !== null && r !== undefined);
  if (rpes.length > 0 && rpes.length === sets.length) {
    const lo = Math.min(...rpes);
    const hi = Math.max(...rpes);
    body += lo === hi ? ` · RPE ${lo}` : ` · RPE ${lo}–${hi}`;
  }
  return body;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- Today ----------

async function renderToday() {
  const dayKey = trainingDayKey();
  headerTitle.textContent = 'Today';
  headerDate.textContent = fmtDate(dayKey);
  view.innerHTML = '';

  // The live session, if one is still running. Sessions end by walking away:
  // after SESSION_GAP_MS the next set starts a new one.
  state.workout = await getActiveWorkout();
  const dayWorkouts = await workoutsForDay(dayKey);
  const earlier = dayWorkouts.filter((w) => w.id !== state.workout?.id);

  if (!state.workout) {
    view.append(el(`
      <div class="empty">
        <p>${earlier.length ? 'No session running right now.' : 'No workout yet today.'}</p>
        <button class="btn" id="start-workout">Start workout</button>
      </div>`));
    document.getElementById('start-workout').onclick = async () => {
      state.workout = await startWorkout(trainingDayKey());
      state.screen = 'picker';
      render();
    };
    await appendEarlierSessions(earlier);
    return;
  }

  const sets = await setsForWorkout(state.workout.id);
  const exercises = await listExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  const grouped = [];
  for (const s of sets) {
    let g = grouped.find((x) => x.exerciseId === s.exerciseId);
    if (!g) { g = { exerciseId: s.exerciseId, sets: [] }; grouped.push(g); }
    g.sets.push(s);
  }

  const addBtn = el(`<button class="btn" id="add-exercise">+ Add exercise</button>`);
  addBtn.onclick = () => { state.screen = 'picker'; state.search = ''; render(); };
  view.append(addBtn);

  const plannedIds = (state.workout.plannedExerciseIds ?? [])
    .filter((id) => byId[id] && !grouped.some((g) => g.exerciseId === id));

  if (grouped.length === 0 && plannedIds.length === 0) {
    view.append(el(`<div class="empty"><p>Workout started — add your first exercise.</p></div>`));
  }

  for (const g of grouped) {
    const ex = byId[g.exerciseId];
    const card = el(`
      <div class="card workout-ex" data-exercise-id="${g.exerciseId}">
        <div class="name"></div>
        <div class="sets"></div>
      </div>`);
    card.querySelector('.name').textContent = ex ? ex.name : '(deleted exercise)';
    card.querySelector('.sets').textContent =
      g.sets.map((s) => setDesc(s)).join('  ·  ');
    card.style.cursor = 'pointer';
    card.onclick = () => { if (ex) openLog(ex); };
    view.append(card);
  }

  if (plannedIds.length > 0) {
    view.append(el(`<div class="section-label">Planned — tap to log</div>`));
    for (const id of plannedIds) {
      const ex = byId[id];
      const card = el(`
        <div class="card workout-ex planned">
          <div class="name"></div>
          <div class="sets">No sets yet</div>
        </div>`);
      card.querySelector('.name').textContent = ex.name;
      card.onclick = () => openLog(ex);
      view.append(card);
    }
  }

  await appendEarlierSessions(earlier);
}

// Sessions already finished on this training day, shown as a summary rather
// than merged into the live one — two sessions are two sessions, even when
// they land on the same date.
async function appendEarlierSessions(earlier) {
  if (earlier.length === 0) return;
  const exercises = await listExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  view.append(el(`<div class="section-label">Earlier today</div>`));
  for (const w of earlier) {
    const sets = await setsForWorkout(w.id);
    const names = [];
    for (const s of sets) {
      const n = byId[s.exerciseId]?.name;
      if (n && !names.includes(n)) names.push(n);
    }
    const card = el(`
      <div class="card workout-ex session-past">
        <div class="name"></div>
        <div class="sets"></div>
      </div>`);
    card.querySelector('.name').textContent = sessionTime(w);
    card.querySelector('.sets').textContent = names.length
      ? `${sets.length} set${sets.length === 1 ? '' : 's'} — ${names.join(', ')}`
      : 'No sets logged';
    card.onclick = () => { state.detailWorkout = w; state.screen = 'workout-detail'; render(); };
    view.append(card);
  }
}

async function renderPicker() {
  headerTitle.textContent = 'Add exercise';
  headerDate.textContent = '';
  view.innerHTML = '';

  const back = el(`<button class="back-link">‹ Back to workout</button>`);
  back.onclick = () => { state.screen = 'today'; render(); };
  view.append(back);

  const search = el(`<input class="search-input" type="search" placeholder="Search exercises…" autocomplete="off">`);
  search.value = state.search;
  search.oninput = () => { state.search = search.value; renderPickerList(listEl, search.value); };
  view.append(search);

  const listEl = el(`<div id="picker-list"></div>`);
  view.append(pickerFilters(listEl));
  view.append(listEl);

  await renderPickerList(listEl, state.search);
  search.focus();
}

// Filter chips above the picker list: one row for how the exercise is loaded,
// one for muscle group. Both are single-select with an "All" escape, and they
// combine with the search box rather than replacing it.
function pickerFilters(listEl) {
  const wrap = el(`<div class="picker-filters"></div>`);

  const chipRow = (options, current, onPick) => {
    const rowEl = el(`<div class="chip-grid"></div>`);
    for (const o of options) {
      const chip = el(`<button class="pick-chip small"></button>`);
      chip.textContent = o.label;
      if (current === o.key) chip.classList.add('selected');
      chip.onclick = () => {
        onPick(o.key);
        for (const c of rowEl.children) c.classList.remove('selected');
        chip.classList.add('selected');
        renderPickerList(listEl, state.search);
      };
      rowEl.append(chip);
    }
    return rowEl;
  };

  wrap.append(chipRow(
    [{ key: null, label: 'All types' }, ...LOAD_TYPES],
    state.filterLoad,
    (k) => { state.filterLoad = k; }));

  wrap.append(chipRow(
    [{ key: null, label: 'All muscles' }, ...MUSCLE_GROUPS.map((m) => ({ key: m, label: m }))],
    state.filterMuscle,
    (k) => { state.filterMuscle = k; }));

  return wrap;
}

async function renderPickerList(listEl, query) {
  const [exercises, recents] = await Promise.all([listExercises(), recentExerciseIds()]);
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));
  const q = query.trim().toLowerCase();
  listEl.innerHTML = '';

  const row = (ex) => {
    const r = el(`
      <button class="ex-row">
        <span class="ex-name"></span>
        <span class="muscles"></span>
      </button>`);
    r.querySelector('.ex-name').textContent = ex.name;
    r.querySelector('.muscles').textContent = ex.muscles.join(', ');
    r.onclick = () => openLog(ex);
    return r;
  };

  const filtered = state.filterLoad !== null || state.filterMuscle !== null;

  // Recents are only useful as a shortcut on the unfiltered list; showing
  // them alongside a filter would contradict the filter.
  if (!q && !filtered && recents.length) {
    listEl.append(el(`<div class="section-label">Recent</div>`));
    for (const id of recents) if (byId[id]) listEl.append(row(byId[id]));
  }

  const matches = exercises.filter((e) => {
    if (state.filterLoad !== null && e.load !== state.filterLoad) return false;
    if (state.filterMuscle !== null && !e.muscles.includes(state.filterMuscle)) return false;
    return !q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q));
  });

  listEl.append(el(`<div class="section-label">${q || filtered ? 'Results' : 'All exercises'}</div>`));
  if (matches.length === 0) {
    listEl.append(el(`<div style="color:var(--text-dim);padding:6px 4px">Nothing matches those filters.</div>`));
  }
  for (const ex of matches) listEl.append(row(ex));

  const create = el(`<button class="btn secondary" style="margin-top:12px"></button>`);
  create.textContent = q && matches.length === 0
    ? `+ Create “${query.trim()}”`
    : '+ New exercise';
  create.onclick = () => {
    state.createName = query.trim();
    state.createLoad = 'weighted';
    state.createMuscles = new Set();
    state.screen = 'create';
    render();
  };
  listEl.append(create);
}

// ---------- New exercise form ----------

const LOAD_TYPES = [
  { key: 'weighted', label: 'Weights' },
  { key: 'unloaded', label: 'Band / bodyweight' },
  { key: 'hold', label: 'Stretch / hold' },
];

function renderCreate() {
  headerTitle.textContent = 'New exercise';
  headerDate.textContent = '';
  view.innerHTML = '';

  const back = el(`<button class="back-link">‹ Back</button>`);
  back.onclick = () => { state.screen = 'picker'; render(); };
  view.append(back);

  const card = el(`<div class="card"></div>`);

  const name = el(`<input class="search-input" type="text" placeholder="Exercise name" autocomplete="off">`);
  name.value = state.createName;
  name.oninput = () => { state.createName = name.value; };
  card.append(name);

  card.append(el(`<div class="section-label">Type</div>`));
  const typeRow = el(`<div class="chip-grid"></div>`);
  for (const t of LOAD_TYPES) {
    const chip = el(`<button class="pick-chip"></button>`);
    chip.textContent = t.label;
    if (state.createLoad === t.key) chip.classList.add('selected');
    chip.onclick = () => {
      state.createLoad = t.key;
      for (const c of typeRow.children) c.classList.remove('selected');
      chip.classList.add('selected');
    };
    typeRow.append(chip);
  }
  card.append(typeRow);

  card.append(el(`<div class="section-label">Muscle groups (tap all that apply)</div>`));
  const muscleRow = el(`<div class="chip-grid"></div>`);
  for (const m of MUSCLE_GROUPS) {
    const chip = el(`<button class="pick-chip"></button>`);
    chip.textContent = m;
    if (state.createMuscles.has(m)) chip.classList.add('selected');
    chip.onclick = () => {
      if (state.createMuscles.has(m)) {
        state.createMuscles.delete(m);
        chip.classList.remove('selected');
      } else {
        state.createMuscles.add(m);
        chip.classList.add('selected');
      }
    };
    muscleRow.append(chip);
  }
  card.append(muscleRow);

  card.append(el(`<div class="section-label">Trained one side at a time?</div>`));
  const perSideRow = el(`<div class="chip-grid"></div>`);
  const perSideChip = el(`<button class="pick-chip">Yes — reps are per side</button>`);
  if (state.createPerSide) perSideChip.classList.add('selected');
  perSideChip.onclick = () => {
    state.createPerSide = !state.createPerSide;
    perSideChip.classList.toggle('selected', state.createPerSide);
  };
  perSideRow.append(perSideChip);
  card.append(perSideRow);

  const saveBtn = el(`<button class="btn" style="margin-top:14px">Create exercise</button>`);
  saveBtn.onclick = async () => {
    const trimmed = state.createName.trim();
    if (!trimmed) { name.focus(); return; }
    const ex = await addExercise({
      name: trimmed,
      muscles: [...state.createMuscles],
      load: state.createLoad,
      perSide: state.createPerSide,
    });
    openLog(ex);
  };
  card.append(saveBtn);

  view.append(card);
  if (!state.createName) name.focus();
}

// ---------- Logging ----------

async function openLog(exercise) {
  state.exercise = exercise;
  const last = await lastSetForExercise(exercise.id);
  state.reps = last?.reps ?? 10;
  state.weight = last ? last.weight : (exercise.load === 'weighted' ? 0 : null);
  state.durationSec = last?.durationSec ?? 30;
  state.rpe = null;
  // Both sides is the assumed default; only a deliberate tap says otherwise.
  state.side = exercise.perSide ? 'both' : null;
  state.screen = 'log';
  render();
}

async function renderLog() {
  const ex = state.exercise;
  headerTitle.textContent = ex.name;
  headerDate.textContent = '';
  view.innerHTML = '';

  const back = el(`<button class="back-link">‹ Back to workout</button>`);
  back.onclick = () => { state.screen = 'today'; render(); };
  view.append(back);

  // "Last time" = the last session that included this exercise, today's
  // in-progress workout excluded, so the line stays put while you log.
  const prev = await lastSessionForExercise(ex.id, state.workout.id);
  const lastLine = el(`<div class="log-last"></div>`);
  if (prev) {
    const when = prev.workout ? ` (${fmtDate(prev.workout.date)})` : '';
    lastLine.textContent = `Last time${when}: ${sessionDesc(prev.sets)}`;
  } else {
    lastLine.textContent = 'First time logging this exercise.';
  }
  view.append(lastLine);

  // Optional form notes on the exercise (e.g. "wrap strap under arms, rotate away")
  const notesWrap = el(`<div class="ex-notes"></div>`);
  view.append(notesWrap);
  renderExerciseNotes(notesWrap, ex);

  // Rest timer: time since the last set logged anywhere in today's workout
  const restEl = el(`<div class="rest-timer" hidden></div>`);
  view.append(restEl);
  await updateRestTimer(restEl);

  const card = el(`<div class="card"></div>`);
  const isHold = ex.load === 'hold';
  // Spell out what the number counts, so "10" is never ambiguous.
  const per = ex.perSide ? ' (per side)' : '';

  if (ex.perSide) card.append(sideChipRow());

  if (isHold) {
    // Stretches / planks: duration instead of reps × weight
    card.append(stepperRow(`Hold${per}`, () => `${state.durationSec}<small> sec</small>`, (dir) => {
      state.durationSec = Math.max(5, state.durationSec + dir * 15);
    }, durationDirect()));
  } else {
    // Reps stepper
    card.append(stepperRow(`Reps${per}`, () => String(state.reps), (dir) => {
      state.reps = Math.max(1, state.reps + dir);
    }, repsDirect()));

    // Weight stepper (null = no load, shown as "—")
    const inc = ex.increment ?? 2.5;
    card.append(stepperRow('Weight', () => {
      return state.weight === null ? '—' : `${state.weight}<small> lb</small>`;
    }, (dir) => {
      if (state.weight === null) {
        state.weight = dir > 0 ? inc : null;
      } else {
        const next = state.weight + dir * inc;
        state.weight = next < 0 ? null : next;
      }
    }, weightDirect()));
  }

  card.append(rpeChipRow());

  const logBtn = el(`<button class="btn" id="log-set">Log set</button>`);
  logBtn.onclick = async () => {
    await logSet({
      workoutId: state.workout.id,
      exerciseId: ex.id,
      reps: isHold ? null : state.reps,
      weight: isHold ? null : state.weight,
      rpe: state.rpe,
      durationSec: isHold ? state.durationSec : null,
      side: state.side,
    });
    await renderLoggedSets(setList);
    await updateRestTimer(restEl);
  };
  card.append(logBtn);
  view.append(card);

  const setList = el(`<div class="set-list card"></div>`);
  view.append(setList);
  await renderLoggedSets(setList);
}

// Rest target suggested from the reps just performed. This is a coaching rule
// of thumb, not a measurement — assuming working sets, reps track load, and
// heavier work needs longer to recover. Ranges behind these numbers: roughly
// 3–5 min for heavy low-rep work, 2–3 min for moderate. Shorter rest is only
// appropriate when local endurance is the actual goal; it does not help
// hypertrophy, which is where the old 30–90 s advice went wrong.
// Any value the user sets on an exercise wins over this.
function suggestedRestSec(ex, lastSet) {
  if (ex?.load === 'hold') return 30;
  const reps = lastSet?.reps;
  if (!reps) return 150;
  if (reps <= 5) return 180;
  if (reps <= 12) return 150;
  return 120;
}

function restTargetSec(ex, lastSet) {
  return ex?.restSec ?? suggestedRestSec(ex, lastSet);
}

function mmss(total) {
  const m = Math.floor(Math.abs(total) / 60);
  const s = String(Math.abs(total) % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function agoLabel(secs) {
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Last set ${mins} min ago`;
  const h = Math.floor(mins / 60);
  const rem = mins % 60;
  return `Last set ${h}h${rem ? ` ${rem}m` : ''} ago`;
}

// Past this gap you are not resting, you have just come back — so the clock
// stops being a rest clock and becomes a plain "when did I last lift" note.
// A presentation rule only; nothing about the logged data changes. Scales
// with the target so a long deliberate rest is never cut off early.
function restIsStale(secs, target) {
  return secs > Math.max(600, target * 3);
}

// Counts UP, the way a rest clock normally reads, with the suggested target
// shown beside it. Reaching the target changes how it looks rather than
// interrupting anything; the optional alert is a vibration, never a sound,
// because a phone beeping in a gym is its own problem.
const alarmOn = () => localStorage.getItem('restAlarm') === '1';

let restTicker = null;

async function updateRestTimer(restEl) {
  clearInterval(restTicker);
  const sets = await setsForWorkout(state.workout.id);
  if (sets.length === 0) { restEl.hidden = true; return; }
  const last = sets.reduce((a, b) => (b.loggedAt > a.loggedAt ? b : a));
  const ex = state.exercise;

  restEl.innerHTML = '';
  const main = el(`<div class="rest-main"></div>`);
  const time = el(`<span class="rest-time"></span>`);
  main.append(el(`<span class="rest-label">Rest</span>`), time);

  const ctl = el(`<div class="rest-target-ctl"></div>`);
  const alarm = el(`<button class="rest-alarm" aria-label="toggle rest alert"></button>`);
  const down = el(`<button class="rest-adj" aria-label="shorter rest">−</button>`);
  const targetLabel = el(`<button class="rest-target" aria-label="reset rest target to suggested"></button>`);
  const up = el(`<button class="rest-adj" aria-label="longer rest">+</button>`);
  const stale = el(`<span class="rest-stale"></span>`);
  ctl.append(alarm, down, targetLabel, up);
  restEl.append(main, ctl, stale);

  const paintAlarm = () => {
    alarm.textContent = alarmOn() ? '🔔' : '🔕';
    alarm.classList.toggle('on', alarmOn());
  };
  alarm.onclick = () => {
    localStorage.setItem('restAlarm', alarmOn() ? '0' : '1');
    paintAlarm();
  };
  paintAlarm();

  const adjust = async (delta) => {
    const next = Math.min(600, Math.max(15, restTargetSec(ex, last) + delta));
    const updated = await updateExercise({ ...ex, restSec: next });
    state.exercise = updated;
    await updateRestTimer(restEl);
  };
  down.onclick = () => adjust(-15);
  up.onclick = () => adjust(15);
  // Tapping the target clears your override and returns to the suggestion,
  // so a mis-tap on an exercise isn't permanent.
  targetLabel.onclick = async () => {
    if (state.exercise?.restSec === undefined) return;
    const { restSec, ...rest } = state.exercise;
    state.exercise = await updateExercise(rest);
    await updateRestTimer(restEl);
  };

  let alerted = false;
  const tick = () => {
    const target = restTargetSec(state.exercise, last);
    const secs = Math.max(0, Math.floor((Date.now() - last.loggedAt) / 1000));

    if (restIsStale(secs, target)) {
      restEl.classList.add('stale');
      restEl.classList.remove('ready');
      stale.textContent = agoLabel(secs);
      return;
    }
    restEl.classList.remove('stale');

    time.textContent = mmss(secs);
    const ready = secs >= target;
    restEl.classList.toggle('ready', ready);
    targetLabel.textContent = ready ? `${mmss(target)} · ready` : `target ${mmss(target)}`;
    if (ready && !alerted) {
      alerted = true;
      // Vibration only fires while the page is actually in front — if the
      // screen is off or the app is backgrounded, the OS drops it.
      if (alarmOn() && navigator.vibrate) navigator.vibrate([180, 110, 180]);
    }
  };
  tick();
  restEl.hidden = false;
  restTicker = setInterval(tick, 1000);
}

// Notes block on the log screen: view / edit / add.
function renderExerciseNotes(wrap, ex) {
  wrap.innerHTML = '';
  const notes = ex.notes ?? '';

  const startEditing = () => {
    wrap.innerHTML = '';
    const ta = el(`<textarea class="notes-input" rows="3" placeholder="Form cues, setup, how it should feel…"></textarea>`);
    ta.value = notes;
    const save = el(`<button class="btn small">Save note</button>`);
    save.onclick = async () => {
      const updated = await updateExercise({ ...ex, notes: ta.value.trim() });
      state.exercise = updated;
      renderExerciseNotes(wrap, updated);
    };
    const cancel = el(`<button class="btn small secondary" style="margin-left:6px">Cancel</button>`);
    cancel.onclick = () => renderExerciseNotes(wrap, ex);
    wrap.append(ta, save, cancel);
    ta.focus();
  };

  if (notes) {
    const noteEl = el(`<button class="note-text"></button>`);
    noteEl.textContent = `📝 ${notes}`;
    noteEl.title = 'Tap to edit note';
    noteEl.onclick = startEditing;
    wrap.append(noteEl);
  } else {
    const addBtn = el(`<button class="note-add">+ Add form note</button>`);
    addBtn.onclick = startEditing;
    wrap.append(addBtn);
  }
}

// Tap-to-type handlers for the three stepper kinds. Invalid input keeps the
// old value; an empty weight means "no load" (null), never 0.
function repsDirect() {
  return {
    get: () => state.reps,
    set: (v) => {
      if (v !== null && Number.isFinite(v) && v >= 1) state.reps = Math.round(v);
    },
  };
}

function weightDirect() {
  return {
    get: () => state.weight,
    set: (v) => {
      if (v === null) { state.weight = null; return; }
      if (Number.isFinite(v) && v >= 0) state.weight = v;
    },
  };
}

function durationDirect() {
  return {
    get: () => state.durationSec,
    set: (v) => {
      if (v !== null && Number.isFinite(v) && v >= 5) state.durationSec = Math.round(v);
    },
  };
}

// Side chips, shown only for one-side-at-a-time exercises. Defaults to Both,
// so the normal case costs no extra taps; picking Left/Right records that
// only that side was trained.
const SIDES = [
  { key: 'both', label: 'Both' },
  { key: 'left', label: 'Left only' },
  { key: 'right', label: 'Right only' },
];

function sideChipRow() {
  const row = el(`
    <div class="rpe-row">
      <span class="label" style="color:var(--text-dim)">Sides trained</span>
      <div class="rpe-chips"></div>
    </div>`);
  const chips = row.querySelector('.rpe-chips');
  for (const s of SIDES) {
    const chip = el(`<button class="rpe-chip wide"></button>`);
    chip.textContent = s.label;
    if (state.side === s.key) chip.classList.add('selected');
    chip.onclick = () => {
      state.side = s.key;
      for (const c of chips.children) c.classList.remove('selected');
      chip.classList.add('selected');
    };
    chips.append(chip);
  }
  return row;
}

// RPE chips (optional) — full 1–10 scale, toggling state.rpe
function rpeChipRow() {
  const rpeRow = el(`
    <div class="rpe-row">
      <span class="label" style="color:var(--text-dim)">Effort (RPE, optional)</span>
      <div class="rpe-chips"></div>
    </div>`);
  const chips = rpeRow.querySelector('.rpe-chips');
  for (const val of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const chip = el(`<button class="rpe-chip">${val}</button>`);
    if (state.rpe === val) chip.classList.add('selected');
    chip.onclick = () => {
      state.rpe = state.rpe === val ? null : val;
      for (const c of chips.children) c.classList.remove('selected');
      if (state.rpe === val) chip.classList.add('selected');
    };
    chips.append(chip);
  }
  return rpeRow;
}

// direct (optional): { get: () => number|null, set: (number|null) => void }
// makes the value tappable — tap, type the number, Enter/blur to commit.
// An empty input commits null (meaningful for weight: "no load").
function stepperRow(label, valueHtml, onStep, direct) {
  const row = el(`
    <div class="stepper-row">
      <span class="label">${label}</span>
      <div class="stepper">
        <button class="minus" aria-label="decrease">−</button>
        <span class="value"></span>
        <button class="plus" aria-label="increase">+</button>
      </div>
    </div>`);
  const value = row.querySelector('.value');
  const update = () => { value.innerHTML = valueHtml(); };
  row.querySelector('.minus').onclick = () => { onStep(-1); update(); };
  row.querySelector('.plus').onclick = () => { onStep(1); update(); };
  if (direct) {
    value.classList.add('typable');
    value.title = 'Tap to type';
    value.onclick = () => {
      if (value.querySelector('input')) return;
      const input = el(`<input class="value-input" type="number" inputmode="decimal" step="any">`);
      const cur = direct.get();
      input.value = cur === null || cur === undefined ? '' : cur;
      value.replaceChildren(input);
      let done = false;
      const finish = (commit) => {
        if (done) return;
        done = true;
        if (commit) {
          const raw = input.value.trim();
          direct.set(raw === '' ? null : Number(raw));
        }
        update();
      };
      input.onblur = () => finish(true);
      input.onkeydown = (e) => {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      };
      input.focus();
      input.select();
    };
  }
  update();
  return row;
}

async function renderLoggedSets(container) {
  const sets = (await setsForWorkout(state.workout.id))
    .filter((s) => s.exerciseId === state.exercise.id);
  container.innerHTML = '';
  if (sets.length === 0) {
    container.append(el(`<div style="color:var(--text-dim);padding:4px">No sets yet today.</div>`));
    return;
  }
  sets.forEach((s, i) => {
    const item = el(`
      <div class="set-item">
        <button class="desc editable" aria-label="edit set"></button>
        <button class="del" aria-label="delete set">✕</button>
      </div>`);
    item.querySelector('.desc').textContent = `Set ${i + 1} — ${setDesc(s)}`;
    item.querySelector('.desc').onclick = () => openEditSet(s, 'log');
    item.querySelector('.del').onclick = async () => {
      await deleteSet(s.id);
      await renderLoggedSets(container);
    };
    container.append(item);
  });
}

// ---------- Edit a logged set (from today or from history) ----------

function openEditSet(set, returnTo) {
  state.editSet = set;
  state.editReturn = returnTo;
  state.reps = set.reps ?? 10;
  state.weight = set.weight;
  state.durationSec = set.durationSec ?? 30;
  state.rpe = set.rpe;
  state.side = set.side ?? null;
  state.screen = 'edit-set';
  render();
}

async function renderEditSet() {
  const s = state.editSet;
  const exercises = await listExercises();
  const ex = exercises.find((e) => e.id === s.exerciseId);
  headerTitle.textContent = ex ? ex.name : 'Edit set';
  headerDate.textContent = 'editing';
  view.innerHTML = '';

  const goBack = () => { state.screen = state.editReturn; render(); };

  const back = el(`<button class="back-link">‹ Cancel</button>`);
  back.onclick = goBack;
  view.append(back);

  const card = el(`<div class="card"></div>`);
  const isHold = s.durationSec !== null && s.durationSec !== undefined;
  // Editable when the set already records a side, or the exercise is per-side
  // (so a set logged before the flag existed can be corrected).
  const showSides = state.side !== null || ex?.perSide === true;
  const per = showSides ? ' (per side)' : '';
  if (showSides) {
    if (state.side === null) state.side = 'both';
    card.append(sideChipRow());
  }

  if (isHold) {
    card.append(stepperRow(`Hold${per}`, () => `${state.durationSec}<small> sec</small>`, (dir) => {
      state.durationSec = Math.max(5, state.durationSec + dir * 15);
    }, durationDirect()));
  } else {
    card.append(stepperRow(`Reps${per}`, () => String(state.reps), (dir) => {
      state.reps = Math.max(1, state.reps + dir);
    }, repsDirect()));
    const inc = ex?.increment ?? 2.5;
    card.append(stepperRow('Weight', () => {
      return state.weight === null ? '—' : `${state.weight}<small> lb</small>`;
    }, (dir) => {
      if (state.weight === null) {
        state.weight = dir > 0 ? inc : null;
      } else {
        const next = state.weight + dir * inc;
        state.weight = next < 0 ? null : next;
      }
    }, weightDirect()));
  }

  card.append(rpeChipRow());

  const saveBtn = el(`<button class="btn" id="save-set">Save changes</button>`);
  saveBtn.onclick = async () => {
    await updateSet({
      ...s,
      reps: isHold ? null : state.reps,
      weight: isHold ? null : state.weight,
      rpe: state.rpe,
      durationSec: isHold ? state.durationSec : null,
      side: state.side,
    });
    goBack();
  };
  card.append(saveBtn);

  const delBtn = el(`<button class="btn danger" id="delete-set">Delete this set</button>`);
  delBtn.onclick = async () => {
    if (!confirm('Delete this set? This cannot be undone.')) return;
    await deleteSet(s.id);
    goBack();
  };
  card.append(delBtn);

  view.append(card);
}

// ---------- Insights (the science layer's UI) ----------

async function renderInsights() {
  headerTitle.textContent = 'Insights';
  headerDate.textContent = '';
  view.innerHTML = '';

  const [sets, workouts, exercises] = await Promise.all([
    listSets(), listWorkouts(), listExercises(),
  ]);
  const workoutsById = Object.fromEntries(workouts.map((w) => [w.id, w]));
  const exercisesById = Object.fromEntries(exercises.map((e) => [e.id, e]));

  if (sets.length === 0) {
    view.append(el(`<div class="empty"><p>Log some workouts and the numbers show up here.</p></div>`));
    return;
  }

  // --- This week ---
  const monday = weekStart();
  const weekCounts = weeklySetsPerMuscle(sets, workoutsById, exercisesById, monday);
  const weekLabel = monday.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

  const weekCard = el(`
    <div class="card">
      <div class="insight-title">Training sets per muscle group this week</div>
      <div class="insight-sub">Week of ${weekLabel}. Every logged set counts once toward each
        muscle its exercise is tagged with. Stretches and timed holds are excluded — the
        research below is about resistance-training sets.</div>
      <div class="insight-rows"></div>
      <div class="insight-note">Research on muscle growth most consistently supports
        ~10–20 <strong>hard</strong> sets per muscle per week — sets taken close to failure.
        This count includes every set logged, warm-ups included, so read it as an upper
        bound rather than a like-for-like comparison. Strength can progress on less.</div>
    </div>`);
  const rows = weekCard.querySelector('.insight-rows');
  const entries = Object.entries(weekCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    rows.append(el(`<div class="insight-empty">No sets logged this week yet.</div>`));
  } else {
    for (const [muscle, count] of entries) {
      const row = el(`
        <div class="insight-row">
          <span class="k"></span><span class="v"></span>
        </div>`);
      row.querySelector('.k').textContent = muscle;
      row.querySelector('.v').textContent = `${count} ${count === 1 ? 'set' : 'sets'}`;
      rows.append(row);
    }
  }
  view.append(weekCard);

  // --- Strength trends (est. 1RM) ---
  const history = e1rmHistory(sets, workoutsById);
  const trendCard = el(`
    <div class="card">
      <div class="insight-title">Strength trend (estimated 1RM)</div>
      <div class="insight-sub">Best set per workout, Epley formula: weight × (1 + reps/30).
        Only computed for loaded sets of 1–10 reps — bands and holds are tracked by RPE and time instead.</div>
      <div class="insight-rows"></div>
    </div>`);
  const trendRows = trendCard.querySelector('.insight-rows');
  const trendEntries = Object.entries(history)
    .map(([exerciseId, points]) => ({ ex: exercisesById[exerciseId], points }))
    .filter((t) => t.ex)
    .sort((a, b) => b.points[b.points.length - 1].e1rm - a.points[a.points.length - 1].e1rm);

  if (trendEntries.length === 0) {
    trendRows.append(el(`<div class="insight-empty">No loaded sets of 1–10 reps yet — log some weighted work to see strength estimates.</div>`));
  } else {
    for (const { ex, points } of trendEntries) {
      const latest = points[points.length - 1];
      const prev = points.length > 1 ? points[points.length - 2] : null;
      const row = el(`
        <div class="insight-row">
          <span class="k"></span><span class="v"></span>
        </div>`);
      row.querySelector('.k').textContent = ex.name;
      let delta = '';
      if (prev) {
        const diff = latest.e1rm - prev.e1rm;
        delta = diff === 0 ? '  (no change)' :
          diff > 0 ? `  (▲ +${diff})` : `  (▼ ${diff})`;
      }
      row.querySelector('.v').textContent = `~${latest.e1rm} lb${delta}`;
      trendRows.append(row);
    }
  }
  view.append(trendCard);

  // --- Totals ---
  const totalCard = el(`
    <div class="card">
      <div class="insight-title">All time</div>
      <div class="insight-rows">
        <div class="insight-row"><span class="k">Workouts</span><span class="v">${workouts.length}</span></div>
        <div class="insight-row"><span class="k">Sets logged</span><span class="v">${sets.length}</span></div>
      </div>
    </div>`);
  view.append(totalCard);
}

// ---------- History ----------

async function renderHistory() {
  headerTitle.textContent = 'History';
  headerDate.textContent = `v${APP_VERSION}`;
  view.innerHTML = '';

  const dataRow = el(`<div class="top-actions"></div>`);

  const exportBtn = el(`<button class="btn secondary">Export (JSON)</button>`);
  exportBtn.onclick = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exercise-log-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  dataRow.append(exportBtn);

  const fileInput = el(`<input type="file" accept=".json,application/json" hidden>`);
  const importBtn = el(`<button class="btn secondary">Import (JSON)</button>`);
  importBtn.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const n = (k) => (Array.isArray(data[k]) ? data[k].length : 0);
      const total = n('exercises') + n('workouts') + n('sets');
      if (total === 0) { alert('No app data found in that file.'); return; }
      const ok = confirm(
        `Import ${n('exercises')} exercises, ${n('workouts')} workouts, ` +
        `${n('sets')} sets?\n\nExisting records with matching IDs are ` +
        `overwritten; nothing is deleted.`);
      if (!ok) return;
      const counts = await importAll(data);
      alert(`Imported ${counts.exercises} exercises, ${counts.workouts} workouts, ${counts.sets} sets.`);
      render();
    } catch {
      alert('Could not read that file as an export JSON.');
    } finally {
      fileInput.value = '';
    }
  };
  dataRow.append(importBtn, fileInput);
  view.append(dataRow);

  const workouts = await listWorkouts();
  if (workouts.length === 0) {
    view.append(el(`<div class="empty"><p>No workouts logged yet.</p></div>`));
    return;
  }

  const exercises = await listExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  // Group by training day so two sessions on one day read as two sessions
  // under one date, rather than two unexplained entries with the same header.
  const byDay = [];
  for (const w of workouts) {
    let d = byDay.find((x) => x.date === w.date);
    if (!d) { d = { date: w.date, sessions: [] }; byDay.push(d); }
    d.sessions.push(w);
  }
  for (const d of byDay) d.sessions.sort((a, b) => a.startedAt - b.startedAt);

  for (const day of byDay) {
    view.append(el(`<div class="section-label">${fmtDate(day.date)}</div>`));
    for (const w of day.sessions) {
      await appendHistoryItem(w, byId, day.sessions.length > 1);
    }
  }
}

async function appendHistoryItem(w, byId, showTime) {
    const sets = await setsForWorkout(w.id);
    const names = [...new Set(sets.map((s) => byId[s.exerciseId]?.name).filter(Boolean))];
    const item = el(`
      <div class="card history-item">
        <div class="date"></div>
        <div class="summary"></div>
      </div>`);
    // The clock time is what makes a 1:25am session obviously last night's,
    // so it is always shown when a day holds more than one session.
    item.querySelector('.date').textContent =
      showTime ? sessionTime(w) : `${fmtDate(w.date)} · ${sessionTime(w)}`;
    item.querySelector('.summary').textContent =
      sets.length === 0 ? 'No sets logged'
        : `${sets.length} set${sets.length === 1 ? '' : 's'} — ${names.join(', ')}`;
    item.onclick = () => { state.detailWorkout = w; state.screen = 'workout-detail'; render(); };
    view.append(item);
}

async function renderWorkoutDetail() {
  const w = state.detailWorkout;
  headerTitle.textContent = `${fmtDate(w.date)} · ${sessionTime(w)}`;
  headerDate.textContent = '';
  view.innerHTML = '';

  const back = el(`<button class="back-link">‹ History</button>`);
  back.onclick = () => { state.screen = 'history'; render(); };
  view.append(back);

  const sets = await setsForWorkout(w.id);
  const exercises = await listExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  if (w.date !== trainingDayKey() && sets.length > 0) {
    const repeatBtn = el(`<button class="btn" style="margin:10px 0">Repeat this workout today</button>`);
    repeatBtn.onclick = async () => {
      const ids = [...new Set(sets.map((s) => s.exerciseId))].filter((id) => byId[id]);
      // Plan into the live session if one is running, otherwise open a new one.
      let target = await getActiveWorkout();
      if (!target) {
        target = await startWorkout(trainingDayKey(), ids);
      } else {
        target.plannedExerciseIds =
          [...new Set([...(target.plannedExerciseIds ?? []), ...ids])];
        await updateWorkout(target);
      }
      switchTab('today');
    };
    view.append(repeatBtn);
  }

  const grouped = [];
  for (const s of sets) {
    let g = grouped.find((x) => x.exerciseId === s.exerciseId);
    if (!g) { g = { exerciseId: s.exerciseId, sets: [] }; grouped.push(g); }
    g.sets.push(s);
  }

  if (grouped.length === 0) {
    view.append(el(`<div class="empty"><p>No sets in this workout.</p></div>`));
  }

  for (const g of grouped) {
    const card = el(`
      <div class="card workout-ex">
        <div class="name"></div>
        <div class="set-list"></div>
      </div>`);
    card.querySelector('.name').textContent = byId[g.exerciseId]?.name ?? '(deleted exercise)';
    const list = card.querySelector('.set-list');
    g.sets.forEach((s, i) => {
      const item = el(`
        <div class="set-item">
          <button class="desc editable" aria-label="edit set"></button>
          <span class="edit-hint">✎</span>
        </div>`);
      item.querySelector('.desc').textContent = `Set ${i + 1} — ${setDesc(s)}`;
      item.querySelector('.desc').onclick = () => openEditSet(s, 'workout-detail');
      list.append(item);
    });
    view.append(card);
  }
}

// ---------- Shell ----------

function render() {
  clearInterval(restTicker);
  if (state.screen === 'edit-set') return renderEditSet();
  if (state.tab === 'today') {
    if (state.screen === 'picker') return renderPicker();
    if (state.screen === 'log') return renderLog();
    if (state.screen === 'create') return renderCreate();
    state.screen = 'today';
    return renderToday();
  }
  if (state.tab === 'insights') {
    state.screen = 'insights';
    return renderInsights();
  }
  if (state.screen === 'workout-detail') return renderWorkoutDetail();
  state.screen = 'history';
  return renderHistory();
}

function switchTab(name) {
  state.tab = name;
  state.screen = name === 'today' ? 'today' : name;
  document.querySelectorAll('.tab').forEach((t) =>
    t.classList.toggle('active', t.dataset.tab === name));
  render();
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => switchTab(tab.dataset.tab);
});

initDb().then(render);
