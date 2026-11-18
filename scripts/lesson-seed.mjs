// Finds a good seed for a lesson's scripted fight. Usage: node scripts/lesson-seed.mjs dwarves
import { applyMove, legalMoves } from '../src/engine.js';
import { LESSONS } from '../ui/tutorial-script.js';
import { lastBattle } from '../ui/lesson-kit.js';

const id = process.argv[2];
const lesson = LESSONS[id];
if (!lesson) { console.log('lessons:', Object.keys(LESSONS).join(', ')); process.exit(1); }

// Play the lesson's own steps, taking the first allowed move, until the first battle.
function firstBattle(seed) {
  let g = lesson.scenario(seed);
  for (const step of lesson.steps) {
    if (step.type !== 'move') continue;
    if (step.skipIf?.(g)) continue;
    const m = legalMoves(g).find((x) => step.expect(x, g));
    if (!m) return null;
    g = applyMove(g, lesson.me, m).game;
    if (m.type === 'battle') return { g, b: lastBattle(g) };
  }
  return null;
}

for (let seed = 1; seed <= 60; seed++) {
  const r = firstBattle(seed);
  if (!r) { console.log(seed, 'no battle reached'); continue; }
  const { b, g } = r;
  console.log(seed, `dice ${b.a},${b.b} -> ${b.dealt} hits / ${b.back} back`, '| vp', g.vp[lesson.me]);
}
