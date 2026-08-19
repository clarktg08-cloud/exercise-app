import {
  initDb, listExercises, addExercise,
  todayKey, getWorkoutByDate, startWorkout, listWorkouts,
  logSet, deleteSet, setsForWorkout, lastSetForExercise,
  recentExerciseIds, exportAll,
} from './db.js';
import { MUSCLE_GROUPS } from './exercises.js';

const view = document.getElementById('view');
const headerTitle = document.getElementById('header-title');
const headerDate = document.getElementById('header-date');

const state = {
  tab: 'today',            // 'today' | 'history'
  screen: 'today',         // 'today' | 'picker' | 'log' | 'create' | 'history' | 'workout-detail'
  workout: null,           // today's workout, if started
  exercise: null,          // exercise being logged
  detailWorkout: null,     // workout opened from history
  reps: 10,
  weight: null,
  rpe: null,
  durationSec: 30,
  search: '',
  createName: '',          // prefill for the new-exercise form
  createLoad: 'weighted',
  createMuscles: new Set(),
};

function fmtDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined,
    { weekday: 'short', month: 'short', day: 'numeric' });
}

function setDesc(s) {
  const rpe = s.rpe === null || s.rpe === undefined ? '' : ` @ RPE ${s.rpe}`;
  if (s.durationSec !== null && s.durationSec !== undefined) {
    return `${s.durationSec}s hold${rpe}`;
  }
  const w = s.weight === null ? '—' : `${s.weight} lb`;
  return `${s.reps} reps × ${w}${rpe}`;
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// ---------- Today ----------

async function renderToday() {
  headerTitle.textContent = 'Today';
  headerDate.textContent = fmtDate(todayKey());
  view.innerHTML = '';

  state.workout = await getWorkoutByDate(todayKey());

  if (!state.workout) {
    view.append(el(`
      <div class="empty">
        <p>No workout yet today.</p>
        <button class="btn" id="start-workout">Start workout</button>
      </div>`));
    document.getElementById('start-workout').onclick = async () => {
      state.workout = await startWorkout(todayKey());
      state.screen = 'picker';
      render();
    };
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

  if (grouped.length === 0) {
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
}

// ---------- Exercise picker ----------

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
  view.append(listEl);

  await renderPickerList(listEl, state.search);
  search.focus();
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

  if (!q && recents.length) {
    listEl.append(el(`<div class="section-label">Recent</div>`));
    for (const id of recents) if (byId[id]) listEl.append(row(byId[id]));
  }

  const matches = exercises.filter((e) =>
    !q || e.name.toLowerCase().includes(q) || e.muscles.some((m) => m.includes(q)));

  listEl.append(el(`<div class="section-label">${q ? 'Results' : 'All exercises'}</div>`));
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

  const saveBtn = el(`<button class="btn" style="margin-top:14px">Create exercise</button>`);
  saveBtn.onclick = async () => {
    const trimmed = state.createName.trim();
    if (!trimmed) { name.focus(); return; }
    const ex = await addExercise({
      name: trimmed,
      muscles: [...state.createMuscles],
      load: state.createLoad,
      increment: 5,
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

  const last = await lastSetForExercise(ex.id);
  const lastLine = el(`<div class="log-last"></div>`);
  lastLine.textContent = last
    ? `Last time: ${setDesc(last)}`
    : 'First time logging this exercise.';
  view.append(lastLine);

  const card = el(`<div class="card"></div>`);
  const isHold = ex.load === 'hold';

  if (isHold) {
    // Stretches / planks: duration instead of reps × weight
    card.append(stepperRow('Hold', () => `${state.durationSec}<small> sec</small>`, (dir) => {
      state.durationSec = Math.max(5, state.durationSec + dir * 15);
    }));
  } else {
    // Reps stepper
    card.append(stepperRow('Reps', () => String(state.reps), (dir) => {
      state.reps = Math.max(1, state.reps + dir);
    }));

    // Weight stepper (null = no load, shown as "—")
    const inc = ex.increment ?? 5;
    card.append(stepperRow('Weight', () => {
      return state.weight === null ? '—' : `${state.weight}<small> lb</small>`;
    }, (dir) => {
      if (state.weight === null) {
        state.weight = dir > 0 ? inc : null;
      } else {
        const next = state.weight + dir * inc;
        state.weight = next < 0 ? null : next;
      }
    }));
  }

  // RPE chips (optional) — full 1–10 scale
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
  card.append(rpeRow);

  const logBtn = el(`<button class="btn" id="log-set">Log set</button>`);
  logBtn.onclick = async () => {
    await logSet({
      workoutId: state.workout.id,
      exerciseId: ex.id,
      reps: isHold ? null : state.reps,
      weight: isHold ? null : state.weight,
      rpe: state.rpe,
      durationSec: isHold ? state.durationSec : null,
    });
    await renderLoggedSets(setList);
  };
  card.append(logBtn);
  view.append(card);

  const setList = el(`<div class="set-list card"></div>`);
  view.append(setList);
  await renderLoggedSets(setList);
}

function stepperRow(label, valueHtml, onStep) {
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
        <span class="desc"></span>
        <button class="del" aria-label="delete set">✕</button>
      </div>`);
    item.querySelector('.desc').textContent = `Set ${i + 1} — ${setDesc(s)}`;
    item.querySelector('.del').onclick = async () => {
      await deleteSet(s.id);
      await renderLoggedSets(container);
    };
    container.append(item);
  });
}

// ---------- History ----------

async function renderHistory() {
  headerTitle.textContent = 'History';
  headerDate.textContent = '';
  view.innerHTML = '';

  const exportBtn = el(`<button class="btn secondary" style="margin:12px 0">Export all data (JSON)</button>`);
  exportBtn.onclick = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `exercise-log-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  view.append(exportBtn);

  const workouts = await listWorkouts();
  if (workouts.length === 0) {
    view.append(el(`<div class="empty"><p>No workouts logged yet.</p></div>`));
    return;
  }

  const exercises = await listExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  for (const w of workouts) {
    const sets = await setsForWorkout(w.id);
    const names = [...new Set(sets.map((s) => byId[s.exerciseId]?.name).filter(Boolean))];
    const item = el(`
      <div class="card history-item">
        <div class="date"></div>
        <div class="summary"></div>
      </div>`);
    item.querySelector('.date').textContent = fmtDate(w.date);
    item.querySelector('.summary').textContent =
      sets.length === 0 ? 'No sets logged'
        : `${sets.length} sets — ${names.join(', ')}`;
    item.onclick = () => { state.detailWorkout = w; state.screen = 'workout-detail'; render(); };
    view.append(item);
  }
}

async function renderWorkoutDetail() {
  const w = state.detailWorkout;
  headerTitle.textContent = fmtDate(w.date);
  headerDate.textContent = '';
  view.innerHTML = '';

  const back = el(`<button class="back-link">‹ History</button>`);
  back.onclick = () => { state.screen = 'history'; render(); };
  view.append(back);

  const sets = await setsForWorkout(w.id);
  const exercises = await listExercises();
  const byId = Object.fromEntries(exercises.map((e) => [e.id, e]));

  const grouped = [];
  for (const s of sets) {
    let g = grouped.find((x) => x.exerciseId === s.exerciseId);
    if (!g) { g = { exerciseId: s.exerciseId, sets: [] }; grouped.push(g); }
    g.sets.push(s);
  }

  for (const g of grouped) {
    const card = el(`
      <div class="card workout-ex">
        <div class="name"></div>
        <div class="sets"></div>
      </div>`);
    card.querySelector('.name').textContent = byId[g.exerciseId]?.name ?? '(deleted exercise)';
    card.querySelector('.sets').textContent = g.sets.map(setDesc).join('  ·  ');
    view.append(card);
  }
}

// ---------- Shell ----------

function render() {
  if (state.tab === 'today') {
    if (state.screen === 'picker') return renderPicker();
    if (state.screen === 'log') return renderLog();
    if (state.screen === 'create') return renderCreate();
    state.screen = 'today';
    return renderToday();
  }
  if (state.screen === 'workout-detail') return renderWorkoutDetail();
  state.screen = 'history';
  return renderHistory();
}

document.querySelectorAll('.tab').forEach((tab) => {
  tab.onclick = () => {
    state.tab = tab.dataset.tab;
    state.screen = state.tab === 'today' ? 'today' : 'history';
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    render();
  };
});

initDb().then(render);
