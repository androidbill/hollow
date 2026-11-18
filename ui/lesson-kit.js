// Shared helpers for the four lessons. Pure: no DOM, so the lessons can be tested in Node.

import { FACTIONS } from '../src/factions/index.js';
import { bldgs, toks, wc } from '../src/helpers.js';
import { COLORS, NAMES } from './render.js';

export const f = (id) => `<b style="color:${COLORS[id]}">${NAMES[id]}</b>`;
export const pic = (name) => `<img class="inline-piece" src="assets/piece-${name}.png" alt="${name}">`;
export const warrior = (id) => pic(`warrior-${id}`);

export const Hf = FACTIONS.humans.facts;
export const Of = FACTIONS.orcs.facts;
export const Ef = FACTIONS.elves.facts;
export const Df = FACTIONS.dwarves.facts;

export const isMove = (m, from, to, n) => m.type === 'move' && m.from === from && m.to === to && m.n === n;

// All of one faction's warriors on the board.
export const totalWarriors = (g, id) => g.board.reduce((n, cl) => n + (cl.w[id] || 0), 0);

// Everything of faction `id` in a clearing, warriors and buildings, for "what is left" lines.
export const piecesAt = (g, c, id) => wc(g, c, id) + bldgs(g, c, id) + toks(g, c, id);

// The most recent battle's dice and outcome, read from the engine's own log line.
// "orcs attacks humans at 2: dice 1,3 -> 4 hits / 1 hits back"
export function lastBattle(g) {
  const line = [...g.log].reverse().find((l) => / attacks /.test(l));
  const m = line && /(\w+) attacks (\w+) at (\d+): dice (\d),(\d) -> (\d+) hits \/ (\d+) hits back/.exec(line);
  if (!m) return null;
  const a = +m[4];
  const b = +m[5];
  return { att: m[1], def: m[2], at: +m[3], a, b, hi: Math.max(a, b), lo: Math.min(a, b), dealt: +m[6], back: +m[7] };
}

const s = (n, one = '', many = 's') => (n === 1 ? one : many);
export const plural = s;

// What a faction just did, from the room's history.
export function recap(ctx, faction) {
  const lines = (ctx.hist || []).filter((h) => h.who === faction).slice(-6).map((h) => h.text);
  if (!lines.length) return `<p>${f(faction)} didn't do anything you can see - sometimes a faction has nothing worth doing.</p>`;
  return `<ul class="tut-log">${lines.map((l) => `<li>${l}</li>`).join('')}</ul>`;
}

// The standard first card of a lesson that is NOT the Humans one: it tells the learner
// what is different (they go first) and what they will practise.
export function lessonIntro(id, blurb, willDo) {
  return `
    <p>You are about to play the ${f(id)}. ${blurb}</p>
    <p>This is a real game on the real board, but <b>you go first</b> (the turn order is rotated so you don't have to wait),
    and you can only make the move each step is about to teach. Every step says <b>what</b> and <b>why</b>.</p>
    <p>You'll practise:</p>
    <ul>${willDo.map((x) => `<li>${x}</li>`).join('')}</ul>
    <p>New to Hollow altogether? The <b>Humans</b> lesson explains ruling, dice and scoring. These lessons assume you've seen it,
    but each one repeats what it needs.</p>`;
}
