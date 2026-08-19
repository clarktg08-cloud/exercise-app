import {
  initDb, listExercises, addExercise, updateExercise,
  todayKey, getWorkoutByDate, startWorkout, updateWorkout, listWorkouts,
  logSet, updateSet, deleteSet, setsForWorkout, lastSetForExercise,
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
  search: '',
  createName: '',          // prefill for the new-exercise form
  createLoad: 'weighted',
  createMuscles: new Set(),
  editSet: null,           // set being edited
  editReturn: 'today',     // screen to go back to after editing
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

  if (isHold) {
    // Stretches / planks: duration instead of reps × weight
    card.append(stepperRow('Hold', () => `${state.durationSec}<small> sec</small>`, (dir) => {
      state.durationSec = Math.max(5, state.durationSec + dir * 15);
    }, durationDirect()));
  } else {
    // Reps stepper
    card.append(stepperRow('Reps', () => String(state.reps), (dir) => {
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

// Time since the most recent set in today's workout, ticking every second.
let restTicker = null;

async function updateRestTimer(restEl) {
  clearInterval(restTicker);
  const sets = await setsForWorkout(state.workout.id);
  if (sets.length === 0) { restEl.hidden = true; return; }
  const lastAt = Math.max(...sets.map((s) => s.loggedAt));
  const tick = () => {
    const secs = Math.max(0, Math.floor((Date.now() - lastAt) / 1000));
    const m = Math.floor(secs / 60);
    const s = String(secs % 60).padStart(2, '0');
    restEl.textContent = `Rest: ${m}:${s}`;
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

  if (isHold) {
    card.append(stepperRow('Hold', () => `${state.durationSec}<small> sec</small>`, (dir) => {
      state.durationSec = Math.max(5, state.durationSec + dir * 15);
    }, durationDirect()));
  } else {
    card.append(stepperRow('Reps', () => String(state.reps), (dir) => {
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
      <div class="insight-sub">Week of ${weekLabel}. Each set counts toward every muscle its
        exercise is tagged with. Stretches and timed holds aren't counted — the research
        below is about resistance-training sets.</div>
      <div class="insight-rows"></div>
      <div class="insight-note">Research on muscle growth most consistently supports
        ~10–20 hard sets per muscle per week; strength can progress on less.</div>
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

  if (w.date !== todayKey() && sets.length > 0) {
    const repeatBtn = el(`<button class="btn" style="margin:10px 0">Repeat this workout today</button>`);
    repeatBtn.onclick = async () => {
      const ids = [...new Set(sets.map((s) => s.exerciseId))].filter((id) => byId[id]);
      let today = await getWorkoutByDate(todayKey());
      if (!today) {
        today = await startWorkout(todayKey(), ids);
      } else {
        today.plannedExerciseIds =
          [...new Set([...(today.plannedExerciseIds ?? []), ...ids])];
        await updateWorkout(today);
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
