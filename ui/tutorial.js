// The tutorial controller: it sits between the script (tutorial-script.js) and the
// app. The app asks it three things - which moves are allowed right now, whether the
// bots should wait, and what to highlight - and tells it three things: a move was
// made, the room changed, and Next was pressed. It draws the "coach" panel.

import { currentFaction } from '../src/engine.js';
import { LESSONS, LESSON_ORDER } from './tutorial-script.js';

const PANEL_IDS = ['scores', 'status', 'faction-info', 'actions'];

export function createTutorial({ getState, onFinish, onComplete, redraw }) {
  const el = (id) => document.getElementById(id);
  let t = null; // { lesson, steps, i, mode: 'step' | 'after', snap, afterHtml }

  const ctx = () => {
    const s = getState();
    return { g: s.g, hist: s.history, snap: t?.snap };
  };
  const step = () => (t ? t.steps[t.i] : null);

  function enterStep(i) {
    t.i = i;
    t.mode = 'step';
    t.afterHtml = '';
    const s = getState();
    // skip a step that cannot be done (e.g. nowhere left to build)
    while (t.steps[t.i]?.skipIf?.(s.g)) t.i++;
    if (!t.steps[t.i]) t.i = t.steps.length - 1;
    if (t.steps[t.i].final) onComplete?.(t.lesson.id);
    render();
    redraw?.(); // the board's highlights and the allowed moves depend on the step
  }

  function render() {
    if (!t) return;
    const s = step();
    const total = t.steps.length;
    const body = typeof s.body === 'function' ? s.body(ctx()) : s.body;
    const canNext = s.type === 'read' || t.mode === 'after';
    let html = `<div class="coach-top"><span class="coach-count">Tutorial · step ${t.i + 1} of ${total}</span>
      ${s.final ? '' : '<button class="coach-skip" data-tut="skip">Skip tutorial</button>'}</div>
      <div class="coach-bar"><i style="width:${((t.i + (t.mode === 'after' ? 1 : 0)) / total) * 100}%"></i></div>
      <h3>${s.title}</h3>`;
    if (t.mode === 'after') {
      html += `<div class="coach-body coach-after">${t.afterHtml}</div>`;
    } else {
      html += `<div class="coach-body">${body}</div>`;
      if (s.type === 'move') html += `<div class="coach-hint"><b>Your move.</b> ${s.hint}</div>`;
      if (s.type === 'watch') html += `<div class="coach-hint watching">Watching…</div>`;
    }
    if (canNext) {
      if (s.final && t.mode === 'step') {
        const nextId = LESSON_ORDER[LESSON_ORDER.indexOf(t.lesson.id) + 1];
        html += `<div class="coach-buttons">
          <button class="go" data-tut="play">Play a real game as the ${t.lesson.label}</button>
          ${nextId ? `<button class="alt2" data-tut="lesson:${nextId}">Next lesson: ${LESSONS[nextId].label}</button>` : ''}
          <button class="alt2" data-tut="lessons">All lessons</button>
          <button class="ghost" data-tut="guide">Read the full guide</button>
          <button class="ghost" data-tut="finish">Close</button></div>`;
      } else {
        html += `<div class="coach-buttons"><button class="go" data-tut="next">Next</button></div>`;
      }
    }
    el('coach').innerHTML = html;
    el('coach').hidden = false;
    applyFocus();
  }

  function applyFocus() {
    const wanted = new Set(step()?.focus?.els || []);
    for (const id of PANEL_IDS) el(id)?.classList.toggle('tut-focus', t !== null && wanted.has(id));
  }

  function advance() {
    if (!t) return;
    enterStep(t.i + 1);
  }

  return {
    get active() { return t !== null; },

    get lessonId() { return t?.lesson.id ?? null; },

    // where the lesson is now (used by the tests that drive the controller)
    get current() {
      if (!t) return null;
      const s = step();
      return { id: s.id, type: s.type, mode: t.mode, faction: s.faction, final: !!s.final };
    },

    begin(lessonId = 'humans') {
      const lesson = LESSONS[lessonId];
      t = { lesson, steps: lesson.steps, i: 0, mode: 'step', snap: null, afterHtml: '' };
      enterStep(0);
    },

    stop() {
      t = null;
      el('coach').hidden = true;
      el('coach').innerHTML = '';
      applyFocus();
    },

    // which of the legal moves the player may make right now
    filterMoves(moves) {
      if (!t) return moves;
      const s = step();
      if (s.type !== 'move' || t.mode !== 'step') return [];
      return moves.filter((m) => s.expect(m, getState().g));
    },

    // bots only play during a "watch" step
    holdBots() {
      return t !== null && step().type !== 'watch';
    },

    focusClearings() {
      return t && t.mode === 'step' ? new Set(step().focus?.clearings || []) : new Set();
    },

    // The player has just made a move (the room already holds the result). `before` is
    // the game as it was when they chose it: a step's expect() is written against that
    // position ("move ALL the warriors from here"), and means something different on the
    // board the move has just changed.
    afterMove(move, before) {
      if (!t) return;
      const s = step();
      if (s.type !== 'move' || !s.expect(move, before ?? getState().g)) return;
      if (s.snapshot) {
        const g = getState().g;
        t.snap = { vp: { ...g.vp }, warriors: g.board.reduce((n, cl) => n + (cl.w[t.lesson.me] || 0), 0) };
      }
      const after = s.after?.(ctx());
      if (after) { t.mode = 'after'; t.afterHtml = after; render(); redraw?.(); } else advance();
    },

    // the room changed; a "watch" step ends when that faction has finished its turn
    onRoom() {
      if (!t) return;
      const s = step();
      const g = getState().g;
      if (s.type === 'watch' && g && (currentFaction(g) !== s.faction || g.winner)) advance();
      else render(); // keep the coach in step with the board (scores, chant, log)
    },

    // Next, Skip, and the closing buttons
    handle(action) {
      if (!t) return;
      const id = t.lesson.id;
      if (action === 'next') advance();
      else if (action === 'skip' || action === 'finish') { this.stop(); onFinish('finish', id); }
      else if (action === 'play') { this.stop(); onFinish('play', id); }
      else if (action === 'lessons') { this.stop(); onFinish('lessons', id); }
      else if (action.startsWith('lesson:')) { this.stop(); onFinish(action, id); }
      else if (action === 'guide') { onFinish('guide', id); }
    },

    // re-apply highlighting after the page re-draws
    refresh() {
      if (t) applyFocus();
    },
  };
}
