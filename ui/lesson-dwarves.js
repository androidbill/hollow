// Lesson: the Dwarves. Dig a tunnel, jump an army through it, destroy a mill, and next
// turn forge a stronghold. See tutorial-script.js for the step format.

import { createGame, legalMoves } from '../src/engine.js';
import { bldgs, placeBuilding, placeWarriors, ruler, wc } from '../src/helpers.js';
import { Df, f, isMove, lastBattle, lessonIntro, piecesAt, pic, plural, recap, totalWarriors, warrior } from './lesson-kit.js';

const ME = 'dwarves';
export const DWARF_SEED = 2; // the first fight rolls 2 and 1: 2 hits dealt, 1 taken back (scripts/lesson-seed.mjs)

// A normal game with the turn order rotated so the Dwarves go first, plus: a Dwarf scout
// alone in clearing 1, next to a Human warrior guarding a mill. Clearing 1 is far from
// the Dwarf home (11), which is what makes the tunnel worth digging.
export function dwarvesScenario(seed = DWARF_SEED) {
  const g = createGame({ seed, factions: ['dwarves', 'humans', 'orcs', 'elves'] });
  placeWarriors(g, 1, 'dwarves', 1);
  placeWarriors(g, 1, 'humans', 1);
  placeBuilding(g, 1, 'humans', 'mill');
  return g;
}

export const DWARF_STEPS = [
  {
    id: 'welcome', type: 'read', title: 'Playing the Dwarves',
    body: () => lessonIntro(ME,
      `The Dwarves are a <b>tunnel fortress</b>: hard to dislodge and able to strike anywhere.`,
      [
        `<b>digging a tunnel</b>, and why it matters,`,
        `<b>jumping a whole army</b> through it in a single move,`,
        `<b>forging a stronghold</b> and what it does for you.`,
      ]),
  },
  {
    id: 'pieces', type: 'read', title: 'Your pieces', focus: { clearings: [11, 1] },
    body: (ctx) => `
      <p>Your home is the bottom-right clearing, 11. It holds:</p>
      <ul>
        <li>${warrior(ME)} <b>${wc(ctx.g, 11, ME)} warriors</b>: you recruit <b>${Df.recruitsPerDawn}</b> every dawn, at your strongholds and tunnels.</li>
        <li>${pic('stronghold-dwarves')} a <b>stronghold</b>: it scores for you every dusk, and it shrugs off one hit.</li>
        <li>${pic('tunnel')} a <b>tunnel</b>: the start of your network.</li>
      </ul>
      <p>You also have a lone scout ${warrior(ME)} in clearing 1, far across the forest. Hold that thought.</p>`,
  },
  {
    id: 'rhythm', type: 'read', title: 'Your turn', focus: { els: ['status', 'scores'] },
    body: () => `
      <p>Your turn has three phases: <b>dawn</b> (recruit, automatic), <b>day</b> (<b>${Df.actions} actions</b>) and <b>dusk</b>
      (score, automatic).</p>
      <p>At dusk you score <b>${Df.strongholdScore} point for every stronghold you <em>rule</em></b>, and ${Df.forgeScore} more each time you forge one.
      So you earn points by <b>building strongholds and keeping them</b>, which makes tunnels, mobility and numbers the tools of the Dwarves.</p>`,
  },
  {
    id: 'target', type: 'read', title: 'A target across the forest', focus: { clearings: [1] },
    body: () => `
      <p>Clearing 1 holds a Human warrior ${warrior('humans')} guarding a ${pic('mill')} <b>mill</b>, and your scout.</p>
      <p>Destroying a building scores a point. But clearing 1 is a long march from home, and your army is at 11.
      A normal march moves <b>one step along a path</b>. You'd need many turns to get there.</p>
      <p>The Dwarves have a better way.</p>`,
  },
  {
    id: 'dig', type: 'move', title: 'Action 1: dig a tunnel',
    focus: { clearings: [1] }, hint: 'Tap clearing 1, then choose "Dig a tunnel".',
    expect: (m) => m.type === 'dig' && m.at === 1,
    body: () => `
      <p><b>What:</b> dig a ${pic('tunnel')} tunnel in clearing 1, where your scout is.</p>
      <p><b>Why:</b> you can only dig where you already have a warrior, which is exactly why a scout out in the field is useful.
      Once two clearings both hold one of your tunnels, they are <b>linked</b>.</p>`,
    after: () => `<p>A dashed orange line now links clearings 11 and 1. That line is a road only the Dwarves can use.</p>`,
  },
  {
    id: 'hop', type: 'move', title: 'Action 2: jump through the tunnel',
    focus: { clearings: [11, 1] }, hint: 'Tap clearing 11, then choose "Move all … to clearing 1 by tunnel".',
    expect: (m, g) => m.type === 'move' && m.from === 11 && m.to === 1 && m.n === wc(g, 11, ME),
    body: (ctx) => `
      <p><b>What:</b> send <b>all ${wc(ctx.g, 11, ME)}</b> warriors from home to clearing 1 in one move.</p>
      <p><b>Why:</b> a march between two tunnels <b>ignores the paths</b> and <b>ignores who rules either end</b>.
      The Humans have to walk; you arrive at once. That is the Dwarves' great strength: a whole army can appear
      anywhere you have dug.</p>`,
    after: (ctx) => `
      <p>${wc(ctx.g, 1, ME)} Dwarf warriors now stand in clearing 1.</p>
      <p>You left home empty, but your <b>stronghold still counts toward ruling</b> there, so it's still yours.
      In a real game, think before leaving a stronghold unguarded: armour helps, but a determined attacker can still take it.</p>`,
  },
  {
    id: 'fightPreview', type: 'read', title: 'Before you attack', focus: { clearings: [1] },
    body: (ctx) => `
      <p>The fight rules are the same for everyone: you roll two dice, the <b>higher</b> is your hits and the <b>lower</b> is theirs, each capped by
      the warriors on that side. Hits kill <b>warriors first</b>, then buildings.</p>
      <p>You have <b>${wc(ctx.g, 1, ME)}</b> warriors to their 1. The Dwarves get no attack bonus (the Orcs do), but they don't need one:
      <b>numbers do the work</b>, and your <b>stronghold armour</b> matters when others attack <em>you</em>.</p>`,
  },
  {
    id: 'attack', type: 'move', title: 'Action 3: attack',
    focus: { clearings: [1] }, hint: 'Tap clearing 1, then choose "Attack the Humans here".',
    expect: (m) => m.type === 'battle' && m.at === 1 && m.target === 'humans',
    body: () => `
      <p><b>What:</b> attack the Humans in clearing 1.</p>
      <p><b>Why:</b> the mill is worth a point and it's the Humans' engine. Fewer mills means a slower Human economy. And you can only do this
      cheaply because you got here by tunnel.</p>`,
    after: (ctx) => {
      const d = lastBattle(ctx.g);
      const left = piecesAt(ctx.g, 1, 'humans');
      const dice = d ? `<p>The dice showed <b>${d.a}</b> and <b>${d.b}</b>: you dealt <b>${d.dealt}</b> hit${plural(d.dealt)}, they hit back <b>${d.back}</b>.</p>` : '';
      return `${dice}${left === 0
        ? `<p>The first hit killed the guard, the next destroyed the mill: <b>+1 point</b> (you're on ${ctx.g.vp[ME]}).</p>`
        : `<p>Some Human pieces survived. You can attack again next turn.</p>`}`;
    },
  },
  {
    id: 'endDay', type: 'move', title: 'End your day',
    focus: { els: ['actions', 'status'] }, hint: 'Tap the gold "End day" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>You've used all ${Df.actions} actions. End your day. Dusk is automatic: you'll score for every stronghold you still rule.</p>`,
  },
  {
    id: 'others', type: 'read', hold: true, title: 'The others play', focus: { clearings: [11] },
    body: (ctx) => `
      <p>Dusk has scored: you now have <b>${ctx.g.vp[ME]}</b> point${plural(ctx.g.vp[ME])}, including the <b>${Df.strongholdScore}</b> for your home stronghold.</p>
      <p>Now the Humans, Orcs and Elves take their turns. While you wait, notice two things:</p>
      <ul>
        <li>Your home is <b>empty of warriors</b> (it only has the stronghold). That's a gamble. See whether anyone takes it.</li>
        <li>If someone does attack your stronghold, <b>they deal one hit fewer</b>: that's the armour.</li>
      </ul>`,
  },
  { id: 'watchHumans', type: 'watch', faction: 'humans', title: 'The Humans play', body: () => `<p>Watch the board and the log.</p>` },
  { id: 'watchOrcs', type: 'watch', faction: 'orcs', title: 'The Orcs play', body: () => `<p>Still watching: look at the log and the scores.</p>` },
  { id: 'watchElves', type: 'watch', faction: 'elves', title: 'The Elves play', body: () => `<p>Last to play this round. Watch the log for what they do.</p>` },
  {
    id: 'backToYou', type: 'read', hold: true, title: 'Back to you', focus: { els: ['scores'] },
    body: (ctx) => {
      const strongholds = ctx.g.board.reduce((n, cl, c) => n + (bldgs(ctx.g, c, ME, 'stronghold') > 0 && ruler(ctx.g, c) === ME ? 1 : 0), 0);
      return `
      <p><b>What the Humans did:</b></p>${recap(ctx, 'humans')}
      <p>Dawn has happened: you recruited ${Df.recruitsPerDawn} more warriors, split between your strongholds and tunnels. You have <b>${totalWarriors(ctx.g, ME)}</b> warriors in all
      and rule <b>${strongholds}</b> stronghold${plural(strongholds)}.</p>
      <p>Now to turn clearing 1 into somewhere you actually own.</p>`;
    },
  },
  {
    id: 'forge', type: 'move', title: 'Forge a stronghold',
    skipIf: (g) => !legalMoves(g).some((m) => m.type === 'forge'),
    focus: { clearings: [1] }, hint: 'Tap clearing 1, then choose "Forge a stronghold".',
    expect: (m) => m.type === 'forge',
    body: (ctx) => `
      <p><b>What:</b> forge a ${pic('stronghold-dwarves')} stronghold where you hold a tunnel.</p>
      <p><b>Why:</b> a stronghold scores <b>${Df.strongholdScore}</b> every dusk while you rule it, scores <b>${Df.forgeScore}</b> now, and is <b>armour</b> against attackers.
      It costs <b>${Df.forgeCost} warriors</b> (you need at least ${Df.forgeMinWarriors} there, so someone is left to hold it) and a free slot, which the
      mill you destroyed left behind.</p>`,
    after: (ctx) => `<p>Forged! With two strongholds ruled you'll score <b>${Df.strongholdScore * 2}</b> every dusk. You're on <b>${ctx.g.vp[ME]}</b>.</p>`,
  },
  {
    id: 'endDay2', type: 'move', title: 'End your day',
    focus: { els: ['actions'] }, hint: 'Tap the gold "End day" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>That's enough for this turn. You don't have to spend every action. Tap <b>End day</b>.</p>`,
  },
  {
    id: 'done', type: 'read', hold: true, final: true, title: 'You can play the Dwarves',
    body: () => `
      <p>Remember the Dwarf plan:</p>
      <ul>
        <li><b>Scouts dig, armies jump.</b> A tunnel is only useful if you can get to it: keep a warrior out in the field to dig.</li>
        <li><b>Strongholds are your income and your armour.</b> They score only while you <em>rule</em> them: keep warriors there.</li>
        <li><b>Forging costs ${Df.forgeCost} warriors</b>: don't strip yourself bare.</li>
        <li>Your tunnel hops ignore paths <em>and</em> ruling, so you can strike where nobody expects.</li>
      </ul>`,
  },
];
