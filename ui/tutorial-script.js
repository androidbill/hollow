// The tutorial: a scripted game you play on the real board, with the real engine.
//
// There is no pretend mode. The tutorial is an ordinary solo game, started from a
// hand-set position and a fixed seed (so the dice come out the same every time), in
// which you may only make the move the current step teaches. Each step says WHAT you
// are about to do and WHY, so you learn the reasoning and not just the buttons.
//
// This file is pure data and functions - no DOM - so scripts/tutorial-tests.mjs can
// walk the whole script against the engine and prove every step is playable.
//
// Step shape:
//   id, title
//   body      html string, or (ctx) => html. ctx = { g, hist, snap, facts }
//   type      'read'  - press Next
//             'move'  - you must make a move that passes expect(m, g)
//             'watch' - the bots play; ends when `faction` has finished its turn
//   hold      true: bots wait (used while a read step sits between turns)
//   focus     { clearings: [...], els: ['scores' | 'status' | 'faction-info' | 'actions'] }
//   hint      for 'move' steps: how to find the button
//   expect    for 'move' steps: (move, g) => boolean
//   after     for 'move' steps: (ctx) => html shown once the move has been made
//   skipIf    (g) => boolean: skip the step when it cannot be done
//   snapshot  true: remember the scores etc. when this step completes (ctx.snap)

import { createGame, legalMoves } from '../src/engine.js';
import { placeBuilding, placeWarriors, wc } from '../src/helpers.js';
import { Df, Ef, Hf, Of, f, isMove, lastBattle, pic, recap, warrior } from './lesson-kit.js';
import { DWARF_SEED, DWARF_STEPS, dwarvesScenario } from './lesson-dwarves.js';
import { ELF_SEED, ELF_STEPS, elvesScenario } from './lesson-elves.js';
import { ORC_SEED, ORC_STEPS, orcsScenario } from './lesson-orcs.js';

// Seed 4: the first fight rolls 3 and 1, so you destroy the scout and the warcamp and
// lose one warrior yourself - both sides' dice get explained. (scripts/tutorial-seed.mjs)
export const SEED = 4;

// The starting position: a normal four-faction game, plus an Orc scout guarding a
// warcamp in clearing 4, right next to the Human home.
export function scenario(seed = SEED) {
  const g = createGame({ seed });
  placeWarriors(g, 4, 'orcs', 1);
  placeBuilding(g, 4, 'orcs', 'warcamp');
  return g;
}

export const HUMAN_STEPS = [
  {
    id: 'welcome', type: 'read', title: 'Welcome to Hollow',
    body: () => `
      <p>Hollow is a war for a forest, fought by <b>four factions that each play by different rules</b>.
      The ${f('humans')} build, the ${f('orcs')} raid, the ${f('elves')} win hearts, and the ${f('dwarves')} dig in.</p>
      <p>In this tutorial you'll play the <b>Humans</b>, on the real board, against the real bots. Each step tells you
      <b>what</b> you're doing and <b>why</b> it's a good idea, so by the end you'll know how to think about the game,
      not just which buttons to press.</p>
      <p>The first side to <b>30 victory points</b> wins. Press <b>Next</b> to begin.</p>`,
  },
  {
    id: 'forest', type: 'read', title: 'The forest', focus: { clearings: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    body: () => `
      <p>The board is twelve round <b>clearings</b> joined by brown <b>paths</b>. Pieces live in clearings and move
      along the paths from one clearing to a neighbouring one.</p>
      <p>Each clearing has some <b>building slots</b>: the dashed squares. A clearing with two slots can hold two buildings,
      no more, so slots are scarce and worth fighting over.</p>
      <p>The coloured ring around a clearing shows who <b>rules</b> it. You'll see why that matters in a moment.</p>`,
  },
  {
    id: 'yours', type: 'read', title: 'Your people', focus: { clearings: [0] },
    body: (ctx) => `
      <p>You are the ${f('humans')} (blue), in the top-left clearing. Look at what you start with:</p>
      <ul>
        <li>${warrior('humans')} <b>${wc(ctx.g, 0, 'humans')} warriors</b>. The number in the badge is how many are in the clearing.
        Warriors fight, and they are what let you <b>rule</b> a place.</li>
        <li>${pic('mill')} a <b>mill</b>: your engine for points and actions.</li>
        <li>${pic('barracks')} a <b>barracks</b>: it recruits a new warrior every dawn.</li>
      </ul>
      <p>Both of your slots here are full, which is why you can't build anything more at home.</p>`,
  },
  {
    id: 'rivals', type: 'read', title: 'Three rivals', focus: { clearings: [3, 8, 11] },
    body: () => `
      <p>The other three factions start in the other corners: ${f('orcs')} (green) top-right, ${f('elves')} (violet)
      bottom-left, ${f('dwarves')} (orange) bottom-right.</p>
      <p>Everyone takes turns clockwise: Humans, Orcs, Elves, Dwarves. Each faction has its <b>own rules for what a turn
      contains</b>, and its own way of scoring. You'll meet each of them as it takes a turn.</p>`,
  },
  {
    id: 'score', type: 'read', title: 'How you win', focus: { els: ['scores'] },
    body: (ctx) => `
      <p>This is the scoreboard. A bar fills toward <b>30</b> for each faction; first to 30 wins.</p>
      <p>You already have <b>${ctx.g.vp.humans} point</b>. The Humans score mainly from <b>mills</b>: each dawn you get points
      equal to a table that grows with your mills (${Hf.millScore.slice(1).join(', ')} for 1 to 6 mills).
      One mill pays 1 a turn; two pay 2; and so on. <b>More mills means points every single turn</b>, which is why Humans
      are a slow start and a strong finish.</p>
      <p>Every faction also scores <b>1 point for each enemy building or token it destroys</b>.</p>`,
  },
  {
    id: 'phases', type: 'read', title: 'Your turn: dawn, then day', focus: { els: ['status'] },
    body: (ctx) => `
      <p>A turn is split into <b>phases</b>, shown in the bar at the top. The Humans have two:</p>
      <ul>
        <li><b>Dawn</b> happens by itself: every barracks recruited a warrior (that's why you have 5) and your mills paid points.</li>
        <li><b>Day</b> is yours: it gives you <b>${Hf.baseActions} actions</b>, plus 1 extra for every 2 mills you own.</li>
      </ul>
      <p>Moving, attacking and building each cost <b>1 action</b>. The bar shows how many you have left. When you run out, or choose
      to stop, you end your day. Four actions is not much, so every one should count.</p>`,
  },
  {
    id: 'march', type: 'move', title: 'Action 1: spread out',
    focus: { clearings: [0, 1] }, hint: 'Tap clearing 0 (it glows), then choose "Move 1 to clearing 1".',
    expect: (m) => isMove(m, 0, 1, 1),
    body: () => `
      <p><b>What:</b> send <b>one</b> warrior from home to the neighbouring clearing 1.</p>
      <p><b>Why:</b> you can only build where you <b>rule</b>, and you rule a clearing when you have more pieces in it than
      anyone else (warriors and buildings both count). Clearing 1 is empty, so even one warrior makes it yours. We keep the
      other four at home to hold it.</p>
      <p>Tap the glowing clearing, then pick the move from the list.</p>`,
    after: () => `
      <p>Clearing 1 now has a <b>blue ring</b>: you rule it. Ruling is the idea behind most of the game:
      you may only <b>build</b> where you rule, and you may only <b>march</b> out of or into a clearing you rule.</p>`,
  },
  {
    id: 'mill', type: 'move', title: 'Action 2: build a mill',
    focus: { clearings: [1] }, hint: 'Tap clearing 1, then choose "Build a mill".',
    expect: (m) => m.type === 'build' && m.at === 1 && m.building === 'mill',
    body: () => `
      <p><b>What:</b> build a ${pic('mill')} mill in clearing 1.</p>
      <p><b>Why:</b> mills are the heart of the Humans. Each one raises the points you earn at every dawn, and every second
      mill gives you another action each turn. Building them <b>early</b> pays off every turn for the rest of the game.</p>
      <p>You may build here because you rule it, you have a warrior present, and a slot is free.</p>`,
    after: (ctx) => `
      <p>The mill is up. At the next dawn you'll score <b>${Hf.millScore[2]} points</b> instead of ${Hf.millScore[1]}.
      Two actions used; two left.</p>`,
  },
  {
    id: 'scout', type: 'read', title: 'A target next door', focus: { clearings: [4] },
    body: () => `
      <p>Look at clearing 4, just below your home. An ${f('orcs')} scout ${warrior('orcs')} has set up a
      ${pic('warcamp')} <b>warcamp</b> there.</p>
      <p>In Hollow you don't have to wait to be attacked. <b>Destroying an enemy building scores you a point</b>, and a warcamp
      is how the Orcs recruit <em>and</em> how they score, so hitting it hurts them twice. And it's one warrior against your
      four.</p>
      <p>To attack, you first need warriors in that clearing.</p>`,
  },
  {
    id: 'moveIn', type: 'move', title: 'Action 3: move in',
    focus: { clearings: [0, 4] }, hint: 'Tap clearing 0, then choose "Move all 4 to clearing 4".',
    expect: (m) => isMove(m, 0, 4, 4),
    body: () => `
      <p><b>What:</b> march <b>all four</b> warriors from home into clearing 4.</p>
      <p><b>Why:</b> you can only fight in a clearing where you have warriors, and more warriors means more hits.
      You can march into a clearing someone else holds, because you rule the one you're leaving.</p>
      <p>Is it safe to leave home empty? Here, yes: your <b>buildings still count toward ruling</b>, so home stays yours.
      In a real game, think twice before leaving a place unguarded.</p>`,
    after: () => `<p>Four of your warriors now face one Orc warrior and a warcamp.</p>`,
  },
  {
    id: 'fightRules', type: 'read', title: 'How a fight works', focus: { clearings: [4] },
    body: () => `
      <p>Before you attack, here's the whole combat rule:</p>
      <ol>
        <li>The attacker rolls <b>two dice</b> (each shows 0 to 3).</li>
        <li>The <b>higher</b> die is the number of hits the <b>attacker</b> deals. The <b>lower</b> die is the hits the
        <b>defender</b> deals back.</li>
        <li>Neither side can deal more hits than it has <b>warriors in the clearing</b>.</li>
        <li>Each hit removes one piece: <b>warriors first</b>, then buildings and tokens.</li>
        <li>A defender with <b>no warriors</b> takes one extra hit.</li>
      </ol>
      <p>You have 4 warriors; the Orcs have 1, so they can hit back at most once. Numbers beat luck over time.
      Each building or token you destroy scores you a point.</p>`,
  },
  {
    id: 'attack', type: 'move', title: 'Action 4: attack!',
    focus: { clearings: [4] }, hint: 'Tap clearing 4, then choose "Attack the Orcs here".',
    expect: (m) => m.type === 'battle' && m.at === 4 && m.target === 'orcs',
    body: () => `
      <p><b>What:</b> attack the Orcs in clearing 4.</p>
      <p><b>Why:</b> you outnumber them four to one, you can destroy a building worth a point, and you take the Orcs'
      way of scoring and recruiting away from them. This is your last action, so make it count.</p>`,
    after: (ctx) => {
      const d = lastBattle(ctx.g);
      const left = wc(ctx.g, 4, 'humans');
      const orcPieces = (ctx.g.board[4].w.orcs || 0) + ctx.g.board[4].b.filter((p) => p.f === 'orcs').length;
      const dice = d ? `<p>The dice showed <b>${d.a}</b> and <b>${d.b}</b>. The higher is yours, so you dealt <b>${d.dealt} hit${d.dealt === 1 ? '' : 's'}</b>;
        the lower is theirs, so they hit back <b>${d.back} time${d.back === 1 ? '' : 's'}</b>.</p>` : '';
      const result = orcPieces === 0
        ? `<p>The first hit killed the scout and the next destroyed the warcamp: <b>you scored 1 point</b> (you're on ${ctx.g.vp.humans}).</p>`
        : `<p>Some Orc pieces survived. Bad luck: you can attack again next turn.</p>`;
      return `${dice}${result}<p>You have <b>${left}</b> warrior${left === 1 ? '' : 's'} left in clearing 4.</p>`;
    },
  },
  {
    id: 'endDay', type: 'move', title: 'End your day', snapshot: true,
    focus: { els: ['actions', 'status'] }, hint: 'Tap the gold "End day" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `
      <p><b>What:</b> end your day.</p>
      <p><b>Why:</b> you're out of actions (the bar says 0), so there's nothing more to do. Ending your day passes the turn
      clockwise to the Orcs, then the Elves, then the Dwarves. You can also end early if you'd rather save nothing and move on;
      unused actions are simply lost.</p>`,
  },
  {
    id: 'meetOrcs', type: 'read', hold: true, title: 'Meet the Orcs', focus: { clearings: [3], els: ['faction-info'] },
    body: () => `
      <p>${warrior('orcs')} The ${f('orcs')} are a <b>warband</b>, and they play by a strict to-do list called the <b>war chant</b>
      (the green chips in the side panel).</p>
      <ul>
        <li>Each day they must do their orders <b>in order</b>: <b>${Of.baseChant.join(' then ')}</b>.</li>
        <li>At dawn they may add up to <b>${Of.maxExtraOrders}</b> more orders to the chant: more power, more risk.</li>
        <li>If an order <b>can't</b> be carried out, they fall into <b>frenzy</b>: the chant breaks, the extras are lost, and they
        lose up to <b>${Of.maxFrenzyLoss} points</b>.</li>
        <li>They hit harder: <b>+${Of.attackBonus} hit</b> whenever they attack.</li>
        <li>They score each dusk from their warcamps: ${Of.campScore.slice(1).join(', ')} points for 1 to 6 camps.</li>
      </ul>
      <p>Press <b>Next</b> and watch their turn play out.</p>`,
  },
  { id: 'watchOrcs', type: 'watch', faction: 'orcs', title: 'The Orcs take their turn', body: () => `<p>Watch the board and the log. Every action the Orcs take is a real move under the same rules you follow.</p>` },
  {
    id: 'meetElves', type: 'read', hold: true, title: 'Meet the Elves', focus: { clearings: [8] },
    body: (ctx) => `
      <p><b>What the Orcs just did:</b></p>${recap(ctx, 'orcs')}
      <hr>
      <p>${warrior('elves')} The ${f('elves')} are <b>insurgents</b>: they win hearts before battles.</p>
      <ul>
        <li>They gather <b>supporters</b> (${Ef.startSupporters} to start, +${Ef.supportersPerDawn} every dawn).</li>
        <li><b>Spread sympathy</b>: spend supporters to place a ${pic('sympathy')} token. Tokens <b>score points</b>, and attackers
        lose a hit where sympathy runs.</li>
        <li><b>Revolt</b> (${Ef.revoltCost} supporters): wipe out everyone else in a clearing that has sympathy and plant a
        ${pic('stronghold-elves')} stronghold there. A frightening move.</li>
        <li>They get ${Ef.baseActions} actions, +1 per stronghold. At dusk they can trade a warrior for a free token.</li>
      </ul>`,
  },
  { id: 'watchElves', type: 'watch', faction: 'elves', title: 'The Elves take their turn', body: () => `<p>See how the Elves spread out: quiet at first, then a revolt can flip a clearing in a single move.</p>` },
  {
    id: 'meetDwarves', type: 'read', hold: true, title: 'Meet the Dwarves', focus: { clearings: [11] },
    body: (ctx) => `
      <p><b>What the Elves just did:</b></p>${recap(ctx, 'elves')}
      <hr>
      <p>${warrior('dwarves')} The ${f('dwarves')} are a <b>tunnel fortress</b>.</p>
      <ul>
        <li>They <b>dig</b> ${pic('tunnel')} tunnels. Their warriors can then march <b>between any two tunnels</b> in one move,
        ignoring the paths <em>and</em> who rules either end.</li>
        <li>They <b>forge</b> ${pic('stronghold-dwarves')} strongholds by spending ${Df.forgeCost} warriors (+${Df.forgeScore} point).
        A stronghold <b>shrugs off one hit</b> when attacked.</li>
        <li>They recruit ${Df.recruitsPerDawn} warriors each dawn and get ${Df.actions} actions a day.</li>
        <li>At dusk they score <b>${Df.strongholdScore} point per stronghold they rule</b>.</li>
      </ul>`,
  },
  { id: 'watchDwarves', type: 'watch', faction: 'dwarves', title: 'The Dwarves take their turn', body: () => `<p>Watch for tunnels appearing on the map: dashed orange lines link them.</p>` },
  {
    id: 'backToYou', type: 'read', hold: true, title: 'Back to you', focus: { els: ['scores'] },
    body: (ctx) => {
      const before = ctx.snap?.vp?.humans;
      const now = ctx.g.vp.humans;
      const w = ctx.snap?.warriors;
      const nowW = ctx.g.board.reduce((n, cl) => n + (cl.w.humans || 0), 0);
      return `
      <p><b>What the Dwarves just did:</b></p>${recap(ctx, 'dwarves')}
      <hr>
      <p>It's your turn again, and <b>dawn has already happened</b>:</p>
      <ul>
        <li>Your barracks recruited: you have <b>${nowW}</b> warriors${w !== undefined ? ` (was ${w})` : ''}.</li>
        <li>Your two mills paid: your score went from <b>${before ?? '?'}</b> to <b>${now}</b>.</li>
      </ul>
      <p>That's the Humans' rhythm: <b>build, recruit, score, repeat</b>. Each mill makes the next dawn worth more.</p>`;
    },
  },
  {
    // if the bots left you with nowhere you can build, there is nothing to teach here
    id: 'buildMore', type: 'move', title: 'Keep building', skipIf: (g) => !legalMoves(g).some((m) => m.type === 'build'),
    focus: { els: ['actions'] }, hint: 'Tap a glowing clearing, then choose a "Build" option.',
    expect: (m) => m.type === 'build',
    body: () => `
      <p><b>What:</b> build something: a mill if you can, otherwise a barracks.</p>
      <p><b>Why:</b> every building grows your engine. A second mill gives you <b>an extra action each turn</b> from now on, and more points
      each dawn; barracks give you more warriors, which means more places to rule and more hits.</p>
      <p>Only clearings you rule, with a free slot and one of your warriors in them, will glow.</p>`,
    after: (ctx) => `<p>Built. You're on <b>${ctx.g.vp.humans}</b> points and growing.</p>`,
  },
  {
    id: 'endDay2', type: 'move', title: 'End your day',
    focus: { els: ['actions'] }, hint: 'Tap the gold "End day" button.',
    expect: (m) => m.type === 'endPhase',
    body: () => `<p>You have actions left, but there's nothing else you need to do this turn. Ending early is fine. Tap <b>End day</b>.</p>`,
  },
  {
    id: 'done', type: 'read', hold: true, final: true, title: 'You can play Hollow',
    body: () => `
      <p>You've played a full round. The big ideas to take with you:</p>
      <ul>
        <li><b>Rule</b> clearings (most warriors plus buildings). You can only build and march from places you rule.</li>
        <li><b>Buildings are your engine</b>, and enemy buildings are points: every one you destroy scores 1.</li>
        <li><b>Fights:</b> the higher die hurts them, the lower die hurts you, and numbers matter. Warriors die first.</li>
        <li>Each faction has its <b>own rhythm</b>: Humans build, Orcs follow a chant, Elves spread sympathy, Dwarves tunnel.</li>
        <li>First to <b>30 points</b> wins. Different factions score differently, so watch everyone's bar.</li>
      </ul>
      <p>The <b>How to Play</b> guide (the <b>?</b> button) has every rule and tips for each faction. When you're ready, start a solo game.</p>`,
  },
];

// ------------------------------------------------------------------ the lessons
// Order matters: it is the order the chooser recommends (easiest first). Each lesson is
// a normal solo game: `scenario(seed)` builds the starting position (turn order rotated
// so the learner goes first), `me` is the faction the learner plays, and `steps` is the
// script. Seeds are fixed so the dice in the scripted fight come out the same every time.
export const LESSONS = {
  humans: {
    id: 'humans', me: 'humans', label: 'Humans', seed: SEED, scenario, steps: HUMAN_STEPS,
    tagline: 'Start here. Ruling, building, dice and scoring: the ideas every faction shares.', minutes: 8,
  },
  dwarves: {
    id: 'dwarves', me: 'dwarves', label: 'Dwarves', seed: DWARF_SEED, scenario: dwarvesScenario, steps: DWARF_STEPS,
    tagline: 'Dig a tunnel, jump an army across the forest, and forge a stronghold.', minutes: 5,
  },
  orcs: {
    id: 'orcs', me: 'orcs', label: 'Orcs', seed: ORC_SEED, scenario: orcsScenario, steps: ORC_STEPS,
    tagline: 'Plan a war chant, hit hard, and learn what a frenzy costs.', minutes: 6,
  },
  elves: {
    id: 'elves', me: 'elves', label: 'Elves', seed: ELF_SEED, scenario: elvesScenario, steps: ELF_STEPS,
    tagline: 'Spread sympathy, spring a revolt, and organize at dusk.', minutes: 5,
  },
};

export const LESSON_ORDER = ['humans', 'dwarves', 'orcs', 'elves'];

// kept for the Humans-only callers written before there were four lessons
export const STEPS = HUMAN_STEPS;
