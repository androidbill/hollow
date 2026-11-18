// Lesson: the Orcs. Plan a war chant, carry it out, then walk into a frenzy on purpose so
// you know exactly what it is. See tutorial-script.js for the step format.

import { createGame } from '../src/engine.js';
import { onBoard, placeBuilding, placeWarriors, score, wc } from '../src/helpers.js';
import { Of, f, lastBattle, lessonIntro, piecesAt, pic, plural, recap, warrior } from './lesson-kit.js';

const ME = 'orcs';
export const ORC_SEED = 2; // the first battle rolls 2 and 1: 2 + the Orc bonus = 3 hits, 1 taken back (scripts/lesson-seed.mjs)

// A normal game with the turn order rotated so the Orcs go first, plus: a Human scout
// guarding a mill next door in clearing 2 (the target for the chant), and 3 points for
// the Orcs so that a frenzy's lost points are visible rather than clamped at zero.
export function orcsScenario(seed = ORC_SEED) {
  const g = createGame({ seed, factions: ['orcs', 'elves', 'dwarves', 'humans'] });
  placeWarriors(g, 2, 'humans', 1);
  placeBuilding(g, 2, 'humans', 'mill');
  score(g, ME, 3);
  return g;
}

const chantOf = (g) => {
  const fs = g.fs[ME];
  return fs.pending.length ? fs.pending : [...Of.baseChant, ...fs.extras];
};

export const ORC_STEPS = [
  {
    id: 'welcome', type: 'read', title: 'Playing the Orcs',
    body: () => lessonIntro(ME,
      `The Orcs are a <b>warband</b>: aggressive, strong attackers, and ruled by a strict list of orders.`,
      [
        `<b>planning a war chant</b>, adding orders at dawn and carrying them out in order,`,
        `why a chant is a <b>plan</b>, where each order sets up the next,`,
        `<b>frenzy</b>: what breaks a chant, and what it costs. You'll cause one on purpose.`,
      ]),
  },
  {
    id: 'pieces', type: 'read', title: 'Your warband', focus: { clearings: [3], els: ['scores'] },
    body: (ctx) => `
      <p>Your home is the top-right clearing, 3:</p>
      <ul>
        <li>${warrior(ME)} <b>${wc(ctx.g, 3, ME)} warriors</b>.</li>
        <li>${pic('warcamp')} a <b>warcamp</b>. It's where you <b>recruit</b>, and every dusk you score for the warcamps you own:
        ${Of.campScore.slice(1).join(', ')} points for 1 to 6.</li>
      </ul>
      <p>For this lesson you start with <b>${ctx.g.vp[ME]} points</b>, so you can see them move.</p>`,
  },
  {
    id: 'chant', type: 'read', title: 'The war chant', focus: { els: ['faction-info'] },
    body: () => `
      <p>The green chips in the side panel are your <b>war chant</b>: <b>${Of.baseChant.join(', ')}</b>.</p>
      <p>Each day you must carry out the chant <b>in that order, one order at a time</b>. You choose <em>how</em> to do each one
      (which clearing to recruit in, where to march, whom to attack), but not <em>whether</em> or in what order.</p>
      <p>At dawn you may <b>add up to ${Of.maxExtraOrders} more orders</b> to the end of the list. More orders means more actions,
      and more ways for it to go wrong. If an order <b>can't be done</b>, the band falls into <b>frenzy</b> and loses points.</p>`,
  },
  {
    id: 'target', type: 'read', title: 'The plan', focus: { clearings: [3, 2] },
    body: () => `
      <p>Clearing 2, right next to your home, holds a Human scout ${warrior('humans')} and a ${pic('mill')} <b>mill</b>.</p>
      <p>A chant is a <b>plan</b>, so here is yours:</p>
      <ol>
        <li><b>recruit</b> a warrior at home,</li>
        <li><b>move</b> the warband next door,</li>
        <li><b>battle</b> the Humans there,</li>
        <li><b>build</b> a warcamp on the spot you've just taken.</li>
      </ol>
      <p>Notice how each order <b>sets up the next</b>. Moving puts you where the battle has a target, and winning lets you build.
      That is how to think about a chant.</p>`,
  },
  {
    id: 'add1', type: 'move', title: 'Dawn: add a safe order',
    focus: { els: ['faction-info', 'actions'] }, hint: 'Tap the button "Add "recruit" to the war chant".',
    expect: (m) => m.type === 'addOrder' && m.order === 'recruit',
    body: () => `
      <p><b>What:</b> add an extra <b>recruit</b> order to the end of the chant.</p>
      <p><b>Why:</b> extra orders are extra actions. <b>Recruit</b> is the safest one to add: it can almost never fail, because it
      only needs a camp to place a warrior at. It's free strength.</p>`,
    after: (ctx) => `<p>The chant is now: <b>${chantOf(ctx.g).join(', ')}</b>.</p>`,
  },
  {
    id: 'add2', type: 'move', title: 'Dawn: add a risky order (on purpose)',
    focus: { els: ['faction-info', 'actions'] }, hint: 'Tap the button "Add "battle" to the war chant".',
    expect: (m) => m.type === 'addOrder' && m.order === 'battle',
    body: () => `
      <p><b>What:</b> add a second <b>battle</b> order. <em>This is a deliberate mistake.</em></p>
      <p><b>Why we're doing it:</b> your first battle will wipe out everything in clearing 2. A second battle after that will have
      <b>nobody left to attack</b>, and you'll see what happens when an order can't be done. In a real game you'd only add a
      battle when you're sure there are enough enemies to hit.</p>`,
    after: (ctx) => `<p>The chant is now: <b>${chantOf(ctx.g).join(', ')}</b>. That's the most you can add (${Of.maxExtraOrders}), so the Add buttons are gone.</p>`,
  },
  {
    id: 'endDawn', type: 'move', title: 'End dawn',
    focus: { els: ['actions'] }, hint: 'Tap the gold "End dawn" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>Dawn is done: the chant is set. Ending dawn starts the <b>day</b>, when you have to carry it out.</p>`,
  },
  {
    id: 'dayIntro', type: 'read', title: 'The day: one order at a time', focus: { els: ['faction-info'] },
    body: () => `
      <p>The <b>lit chip</b> is the order you must do now. You can only do <em>that</em> order, and the game offers only legal ways to do it.</p>
      <p>When one is done, the next lights up. If the lit order has <b>no legal way</b> to be done, the only choice left is
      <b>Frenzy</b>. Keep an eye on the chips as we go.</p>`,
  },
  {
    id: 'recruit', type: 'move', title: 'Order 1: recruit',
    focus: { clearings: [3] }, hint: 'Tap clearing 3, then choose "Recruit a warrior here".',
    expect: (m) => m.type === 'recruit' && m.at === 3,
    body: () => `
      <p><b>What:</b> place a warrior at your warcamp.</p>
      <p><b>Why:</b> more warriors means more hits, and the numbers matter: you want to arrive next door with a big band.</p>`,
    after: (ctx) => `<p>Clearing 3 now has <b>${wc(ctx.g, 3, ME)}</b> warriors.</p>`,
  },
  {
    id: 'march', type: 'move', title: 'Order 2: move',
    focus: { clearings: [3, 2] }, hint: 'Tap clearing 3, then choose "Move all … to clearing 2".',
    expect: (m, g) => m.type === 'move' && m.from === 3 && m.to === 2 && m.n === wc(g, 3, ME),
    body: (ctx) => `
      <p><b>What:</b> march <b>all ${wc(ctx.g, 3, ME)}</b> warriors to clearing 2.</p>
      <p><b>Why:</b> the <em>next</em> order is a battle, and a battle needs enemies in a clearing where you have warriors. This move is what
      gives it a target. (The Orcs may march from anywhere: unlike the Humans, they don't need to rule a clearing to move.)</p>`,
    after: () => `<p>The warband is next door. The lit chip is now <b>battle</b>, and for the first time it has a target.</p>`,
  },
  {
    id: 'fightNote', type: 'read', title: 'Orc fighting', focus: { clearings: [2] },
    body: (ctx) => `
      <p>Fights work as for everyone: two dice, the <b>higher</b> is your hits and the <b>lower</b> is theirs, capped by warriors, killing warriors
      first and then buildings.</p>
      <p>The Orcs have a bonus: <b>+${Of.attackBonus} hit whenever they attack</b>. With <b>${wc(ctx.g, 2, ME)}</b> warriors against their 1, you should smash through.</p>`,
  },
  {
    id: 'battle', type: 'move', title: 'Order 3: battle',
    focus: { clearings: [2] }, hint: 'Tap clearing 2, then choose "Attack the Humans here".',
    expect: (m) => m.type === 'battle' && m.at === 2 && m.target === 'humans',
    body: () => `<p><b>What:</b> attack the Humans in clearing 2.</p>
      <p><b>Why:</b> destroy their mill (+1 point), clear the clearing so you can build there, and slow the Human economy.</p>`,
    after: (ctx) => {
      const d = lastBattle(ctx.g);
      const left = piecesAt(ctx.g, 2, 'humans');
      const dice = d ? `<p>The dice showed <b>${d.a}</b> and <b>${d.b}</b>. Your hits are the higher (<b>${d.hi}</b>) plus your Orc bonus (<b>+${Of.attackBonus}</b>) = <b>${d.dealt}</b>.
        They hit back <b>${d.back}</b> time${plural(d.back)}.</p>` : '';
      return `${dice}${left === 0
        ? `<p>The scout fell and the mill was destroyed: <b>+1 point</b> (you're on ${ctx.g.vp[ME]}).</p>`
        : `<p>Something survived. Bad luck: the next steps still work, but the frenzy later may not happen.</p>`}`;
    },
  },
  {
    id: 'build', type: 'move', title: 'Order 4: build',
    focus: { clearings: [2] }, hint: 'Tap clearing 2, then choose "Build a warcamp".',
    expect: (m) => m.type === 'build' && m.at === 2,
    body: () => `
      <p><b>What:</b> build a ${pic('warcamp')} warcamp in clearing 2.</p>
      <p><b>Why:</b> you may only build where you <b>rule</b>, and you rule clearing 2 now that the Humans are gone. A second warcamp means
      more points at dusk (${Of.campScore[1]} now, ${Of.campScore[2]} with two) and another place to recruit.
      This is the payoff of the whole plan.</p>`,
    after: (ctx) => `<p>Warcamps on the board: <b>${onBoard(ctx.g, ME, 'warcamp')}</b>.</p>`,
  },
  {
    id: 'recruit2', type: 'move', title: 'Order 5: the extra recruit', snapshot: true,
    focus: { clearings: [3, 2] }, hint: 'Tap a glowing clearing, then choose "Recruit a warrior here".',
    expect: (m) => m.type === 'recruit',
    body: () => `
      <p><b>What:</b> use the safe extra order you added: recruit another warrior, at either camp.</p>
      <p><b>Why:</b> exactly as planned: it can't fail, and it's one more warrior for free. (Putting it at the new camp in clearing 2 helps hold the ground you just took.)</p>`,
    after: () => `<p>One order left: the extra <b>battle</b> you added on purpose.</p>`,
  },
  {
    id: 'trap', type: 'read', title: 'The trap', focus: { clearings: [2, 3], els: ['faction-info'] },
    body: () => `
      <p>Look at the last lit chip: <b>battle</b>. Is there anything left to attack?</p>
      <p>No: you destroyed everything in clearing 2, and no enemy sits in a clearing where you have warriors. That means the
      order <b>cannot be carried out</b>, so the game offers only <b>Frenzy</b>.</p>
      <p>This is why extra battle orders are dangerous: you have to be certain there's still something to hit.</p>`,
  },
  {
    id: 'frenzy', type: 'move', title: 'Frenzy!',
    focus: { els: ['actions', 'faction-info'] }, hint: 'Tap the red "Frenzy! The chant breaks" button.',
    expect: (m) => m.type === 'frenzy',
    body: () => `
      <p><b>What:</b> accept the frenzy.</p>
      <p><b>What it costs:</b> <b>1 point</b> for each order still left (up to ${Of.maxFrenzyLoss}), and the <b>added orders are thrown away</b>. It's
      the price of a plan that outran the board.</p>`,
    after: (ctx) => {
      const before = ctx.snap?.vp?.[ME];
      const now = ctx.g.vp[ME];
      return `<p>Frenzy. Your score went from <b>${before ?? '?'}</b> to <b>${now}</b>.</p>
      <p>The chant resets to the plain four orders tomorrow. You lost one point, a cheap lesson. In a long chant it can cost up to ${Of.maxFrenzyLoss}.</p>`;
    },
  },
  {
    id: 'endDay', type: 'move', title: 'End your day',
    focus: { els: ['actions'] }, hint: 'Tap the gold "End day" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>The chant is finished (or broken), so there's nothing left to do. End your day. <b>Dusk</b> follows automatically and scores your warcamps.</p>`,
  },
  {
    id: 'dusk', type: 'read', hold: true, title: 'Dusk: scoring', focus: { els: ['scores'] },
    body: (ctx) => {
      const camps = onBoard(ctx.g, ME, 'warcamp');
      return `
      <p>Dusk has scored: you own <b>${camps}</b> warcamp${plural(camps)}, so you gained <b>${Of.campScore[camps]}</b> point${plural(Of.campScore[camps])}.
      You now have <b>${ctx.g.vp[ME]}</b>.</p>
      <p>That is the Orc rhythm: <b>plan the chant, hit hard, build camps, score at dusk</b>. Now the Elves, Dwarves and Humans take their turns.</p>`;
    },
  },
  { id: 'watchElves', type: 'watch', faction: 'elves', title: 'The Elves play', body: () => `<p>Watch the board and the log.</p>` },
  { id: 'watchDwarves', type: 'watch', faction: 'dwarves', title: 'The Dwarves play', body: () => `<p>Still watching: look at the log and the scores.</p>` },
  { id: 'watchHumans', type: 'watch', faction: 'humans', title: 'The Humans play', body: () => `<p>Last to play this round. Watch the log for what they do.</p>` },
  {
    id: 'again', type: 'read', hold: true, title: 'Back to you', focus: { els: ['faction-info'] },
    body: (ctx) => `
      <p><b>What the Humans did:</b></p>${recap(ctx, 'humans')}
      <p>It's your dawn again. Look at the chant: it's back to the plain <b>${Of.baseChant.join(', ')}</b>, because the frenzy threw the extras away
      (extra orders last only until the chant breaks).</p>
      <p>You have <b>${ctx.g.board.reduce((n, cl) => n + (cl.w[ME] || 0), 0)}</b> warriors and <b>${onBoard(ctx.g, ME, 'warcamp')}</b> warcamps, and
      ${Of.maxExtraOrders} orders you could add.</p>`,
  },
  {
    id: 'done', type: 'read', hold: true, final: true, title: 'You can play the Orcs',
    body: () => `
      <p>What to remember:</p>
      <ul>
        <li><b>A chant is a plan.</b> Use <em>move</em> to give <em>battle</em> a target, and win the battle to give <em>build</em> a place.</li>
        <li><b>Extra recruit orders are safe</b>. Extra battle or build orders are only worth it when you're sure they can be done.</li>
        <li><b>Frenzy costs up to ${Of.maxFrenzyLoss} points</b> and wipes your extras. Read the lit chip before every action.</li>
        <li>You hit <b>+${Of.attackBonus}</b> harder than anyone. Warcamps are your score and your recruiting: build more, and protect them.</li>
      </ul>`,
  },
];
