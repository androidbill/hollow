// Lesson: the Elves. Spread sympathy, spring a revolt, organize at dusk. There are no
// dice in this lesson: the Elves win by planning, not by rolling. See tutorial-script.js.

import { createGame } from '../src/engine.js';
import { FACTIONS } from '../src/factions/index.js';
import { onBoard, placeBuilding, placeWarriors, wc } from '../src/helpers.js';
import { Ef, f, lessonIntro, pic, plural, recap, warrior } from './lesson-kit.js';

const ME = 'elves';
export const ELF_SEED = 1;

// A normal game with the turn order rotated so the Elves go first, plus: a Human scout
// guarding a mill in clearing 4 (next door to the Elf home, 8), and a spare Elf scout in
// clearing 9 for the dusk "organize" lesson.
export function elvesScenario(seed = ELF_SEED) {
  const g = createGame({ seed, factions: ['elves', 'dwarves', 'humans', 'orcs'] });
  placeWarriors(g, 4, 'humans', 1);
  placeBuilding(g, 4, 'humans', 'mill');
  placeWarriors(g, 9, ME, 1);
  return g;
}

const supporters = (g) => g.fs[ME].supporters;

export const ELF_STEPS = [
  {
    id: 'welcome', type: 'read', title: 'Playing the Elves',
    body: () => lessonIntro(ME,
      `The Elves are <b>insurgents</b>. They are weak in a straight fight, but they win hearts first, and one well-timed revolt can flip a clearing.`,
      [
        `<b>supporters</b>, the currency of the Elves,`,
        `<b>spreading sympathy</b>, which scores points and weakens attackers,`,
        `<b>revolt</b>: wiping out a clearing and planting a stronghold,`,
        `<b>organizing</b> at dusk.`,
      ]),
  },
  {
    id: 'pieces', type: 'read', title: 'Your pieces', focus: { clearings: [8, 9], els: ['faction-info'] },
    body: (ctx) => `
      <p>Your home is the bottom-left clearing, 8:</p>
      <ul>
        <li>${warrior(ME)} <b>${wc(ctx.g, 8, ME)} warriors</b>, plus a spare scout in clearing 9.</li>
        <li>${pic('sympathy')} a <b>sympathy token</b>: the locals are on your side. You start with one for free.</li>
      </ul>
      <p>In the side panel: <b>${supporters(ctx.g)} supporters</b>. You began with ${Ef.startSupporters} and gain <b>${Ef.supportersPerDawn}</b> every dawn.
      Supporters are what you <em>spend</em> to spread sympathy and to revolt.</p>`,
  },
  {
    id: 'rhythm', type: 'read', title: 'Your turn', focus: { els: ['status', 'scores'] },
    body: () => `
      <p>Your turn has three phases: <b>dawn</b> (supporters, automatic), <b>day</b> (<b>${Ef.baseActions} actions</b>, plus 1 for every stronghold you own) and
      <b>dusk</b> (you may <b>organize</b> once).</p>
      <p>You score when you <b>place sympathy tokens</b> (more for later ones: ${Ef.spreadScore.join(', ')}), and, like everyone, for every enemy building you destroy.
      With just two actions a day, <b>every action has to count</b>.</p>`,
  },
  {
    id: 'target', type: 'read', title: 'The plan', focus: { clearings: [4, 8] },
    body: () => `
      <p>Clearing 4, right next to your home, holds a Human scout ${warrior('humans')} and a ${pic('mill')} <b>mill</b>.</p>
      <p>You could just attack, but the Elves are <b>weak in open battle</b>. The Elf way is:</p>
      <ol>
        <li><b>spread sympathy</b> to clearing 4 (the locals turn to you),</li>
        <li><b>revolt</b> there: the people rise up and destroy everything that isn't yours.</li>
      </ol>
      <p>Two actions: exactly what you have today.</p>`,
  },
  {
    id: 'spread', type: 'move', title: 'Action 1: spread sympathy',
    focus: { clearings: [4] }, hint: 'Tap clearing 4, then choose "Spread sympathy here".',
    expect: (m) => m.type === 'spread' && m.at === 4,
    body: (ctx) => `
      <p><b>What:</b> place a ${pic('sympathy')} sympathy token in clearing 4.</p>
      <p><b>Why:</b> you may spread only to a clearing <b>next to one that already has sympathy</b>, so your tokens grow as a connected web outward from home.
      It costs supporters: <b>${Ef.spreadCost[1]}</b> for this one (the price climbs: ${Ef.spreadCost.join(', ')} for the 1st to 10th token).
      And you need a token <em>here</em> to revolt here.</p>`,
    after: (ctx) => `
      <p>Done. You have <b>${supporters(ctx.g)}</b> supporters left. Clearing 4 now has sympathy even though it's full of Humans: attackers deal <b>one hit fewer</b> there.</p>`,
  },
  {
    id: 'revoltNote', type: 'read', title: 'Revolt', focus: { clearings: [4] },
    body: () => `
      <p>A <b>revolt</b> costs <b>${Ef.revoltCost} supporters</b>, and you can only do it in a clearing that has your sympathy. Then, all at once:</p>
      <ul>
        <li>every <b>enemy piece</b> in the clearing is destroyed: warriors, buildings, tokens. Each building or token scores you <b>1 point</b>;</li>
        <li>you plant a ${pic('stronghold-elves')} <b>stronghold</b> (you have ${FACTIONS.elves.pieces.stronghold} of them);</li>
        <li>you place warriors there: <b>1 + the number of neighbouring clearings with your sympathy</b>.</li>
      </ul>
      <p>It's the Elves' big move. It needs a <b>free slot</b> once the enemies are gone, which the destroyed mill provides.</p>`,
  },
  {
    id: 'revolt', type: 'move', title: 'Action 2: revolt!',
    focus: { clearings: [4] }, hint: 'Tap clearing 4, then choose "Revolt: wipe out everyone else, plant a stronghold".',
    expect: (m) => m.type === 'revolt' && m.at === 4,
    body: () => `
      <p><b>What:</b> start the revolt in clearing 4.</p>
      <p><b>Why:</b> you destroy the mill (a point), get rid of the Humans without a single roll of the dice, and win a stronghold, which will
      give you <b>an extra action every turn</b>. Revolts are how a weak-looking faction takes over.</p>`,
    after: (ctx) => `
      <p>The Humans are gone and the mill is destroyed: <b>+1 point</b> (you're on <b>${ctx.g.vp[ME]}</b>).</p>
      <p>Clearing 4 now holds your ${pic('stronghold-elves')} stronghold and <b>${wc(ctx.g, 4, ME)}</b> warriors: 1, plus 1 for the sympathetic clearing next to it.
      You have <b>${supporters(ctx.g)}</b> supporters left.</p>`,
  },
  {
    id: 'endDay', type: 'move', title: 'End your day',
    focus: { els: ['actions', 'status'] }, hint: 'Tap the gold "End day" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>Both actions are used (the bar says 0). End your day. Next comes <b>dusk</b>, where there's one more thing you can do.</p>`,
  },
  {
    id: 'duskNote', type: 'read', title: 'Dusk: organize', focus: { clearings: [9] },
    body: () => `
      <p>At dusk you may <b>organize</b>, once: <b>trade one warrior for a free sympathy token</b> in the clearing where it stands (a clearing with no token yet).</p>
      <p>Your spare scout is alone in clearing 9. Turning it into a token gives you <b>more sympathy for no supporters</b>, and it scores like any other token.
      It costs you a warrior, so it's a trade, but a good one for a scout that isn't doing anything.</p>`,
  },
  {
    id: 'organize', type: 'move', title: 'Organize',
    focus: { clearings: [9] }, hint: 'Tap clearing 9, then choose "Organize: trade a warrior for sympathy".',
    expect: (m) => m.type === 'organize' && m.at === 9,
    body: () => `<p><b>What:</b> trade the scout in clearing 9 for a sympathy token.</p>
      <p><b>Why:</b> more tokens means more points, a bigger web to spread from, and more ground where attackers are weakened.</p>`,
    after: (ctx) => `<p>Sympathy tokens on the board: <b>${onBoard(ctx.g, ME, 'sympathy')}</b>. You're on <b>${ctx.g.vp[ME]}</b> points.</p>`,
  },
  {
    id: 'endDusk', type: 'move', title: 'End your dusk',
    focus: { els: ['actions'] }, hint: 'Tap the gold "End dusk" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>Organizing is limited to once a turn, so you're done. End your dusk to pass the turn.</p>`,
  },
  { id: 'watchDwarves', type: 'watch', faction: 'dwarves', title: 'The Dwarves play', body: () => `<p>The others take their turns. Watch the board and the log.</p>` },
  { id: 'watchHumans', type: 'watch', faction: 'humans', title: 'The Humans play', body: () => `<p>Still watching: look at the log and the scores.</p>` },
  { id: 'watchOrcs', type: 'watch', faction: 'orcs', title: 'The Orcs play', body: () => `<p>Last to play this round. Watch the log for what they do.</p>` },
  {
    id: 'backToYou', type: 'read', hold: true, title: 'Back to you', focus: { els: ['faction-info', 'status'] },
    body: (ctx) => {
      const strongholds = onBoard(ctx.g, ME, 'stronghold');
      const actions = ctx.g.fs[ME].actions;
      return `
      <p><b>What the Orcs did:</b></p>${recap(ctx, 'orcs')}
      <p>Dawn has happened: you gained ${Ef.supportersPerDawn} supporters and now have <b>${supporters(ctx.g)}</b>.
      ${strongholds > 0
        ? `And thanks to your ${strongholds === 1 ? 'stronghold' : 'strongholds'} you have <b>${actions} actions</b> today instead of ${Ef.baseActions}.`
        : `Your stronghold didn't survive the other factions' turns, so you're back to <b>${actions} actions</b>: another reason to defend what you build.`}</p>
      <p>Spreading gets more expensive as your web grows (next token: <b>${Ef.spreadCost[onBoard(ctx.g, ME, 'sympathy')] ?? '?'}</b> supporter${plural(Ef.spreadCost[onBoard(ctx.g, ME, 'sympathy')])}),
      so it pays to keep <b>${Ef.revoltCost}</b> in reserve for your next revolt.</p>`;
    },
  },
  {
    id: 'spread2', type: 'move', title: 'Keep spreading', skipIf: (g) => !g.fs[ME] || supporters(g) < 1,
    focus: { els: ['actions'] }, hint: 'Tap a glowing clearing, then choose "Spread sympathy here".',
    expect: (m) => m.type === 'spread',
    body: (ctx) => `
      <p><b>What:</b> spread sympathy to any glowing clearing.</p>
      <p><b>Why:</b> each token <b>scores</b>, and the web is how you reach the next clearing to revolt in. You've ${supporters(ctx.g)} supporters, so keep
      ${Ef.revoltCost} back if you want a revolt next turn.</p>`,
    after: (ctx) => `<p>Placed. You're on <b>${ctx.g.vp[ME]}</b> points, with <b>${supporters(ctx.g)}</b> supporters left.</p>`,
  },
  {
    id: 'done', type: 'read', hold: true, final: true, title: 'You can play the Elves',
    body: () => `
      <p>What to remember:</p>
      <ul>
        <li><b>Sympathy first, revolt second.</b> Spread to a clearing, then rise up there. You need the token to revolt.</li>
        <li><b>Keep ${Ef.revoltCost} supporters in reserve</b>; a revolt is your only real weapon and it needs them.</li>
        <li><b>Defend on sympathetic ground</b>: attackers deal a hit fewer there. Avoid fights anywhere else.</li>
        <li><b>Strongholds are tempo</b>: each is an extra action every turn.</li>
        <li>Spend a spare warrior to <b>organize</b> at dusk when it's doing nothing.</li>
      </ul>`,
  },
];
