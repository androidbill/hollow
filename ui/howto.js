// The How to Play guide. Every number in it is read from the rules (the factions'
// `facts`, their piece counts, a freshly dealt game for the starting positions, the
// map, the win score) so it cannot drift away from the game when the rules are tuned.
// scripts/tutorial-tests.mjs checks the guide renders and quotes the live numbers.

import { createGame, MAX_ROUNDS, WIN_VP } from '../src/engine.js';
import { FACTIONS } from '../src/factions/index.js';
import { CLEARINGS } from '../src/map.js';
import { bldgs, toks, wc } from '../src/helpers.js';
import { COLORS, NAMES } from './render.js';

const f = (id) => `<b style="color:${COLORS[id]}">${NAMES[id]}</b>`;
const pic = (name) => `<img class="inline-piece" src="assets/piece-${name}.png" alt="${name}">`;
const crest = (id) => `<img class="guide-crest" src="assets/crest-${id}.png" alt="">`;
const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join('')}</ul>`;
const nums = (a) => a.join(', ');

export const SECTIONS = [
  ['goal', 'Goal'], ['board', 'The forest'], ['turn', 'A turn'], ['rule', 'Ruling'],
  ['fight', 'Fighting'], ['score', 'Scoring'], ['humans', 'Humans'], ['orcs', 'Orcs'],
  ['elves', 'Elves'], ['dwarves', 'Dwarves'], ['ui', 'The screen'], ['online', 'Rooms'], ['faq', 'FAQ'],
];

export function guideHtml() {
  const g = createGame({ seed: 1 });
  const H = FACTIONS.humans;
  const O = FACTIONS.orcs;
  const E = FACTIONS.elves;
  const D = FACTIONS.dwarves;
  const home = (id) => FACTIONS[id].home;
  const E0 = FACTIONS.elves;
  const slotsTotal = CLEARINGS.reduce((n, c) => n + c.slots, 0);

  return `
<section id="g-goal">
  <h2>Goal</h2>
  <p>Hollow is a war for a forest between <b>four factions</b>, each of which follows <b>different rules</b>. Be the first to reach
  <b>${WIN_VP} victory points (VP)</b> and you win. If nobody gets there, the leader after round <b>${MAX_ROUNDS}</b> wins.</p>
  <p>Points come from different places for each faction, and from one source they all share: <b>destroying enemy buildings and
  tokens scores 1 VP each</b>. Watch the scoreboard; a faction you ignore can win quietly.</p>
</section>

<section id="g-board">
  <h2>The forest</h2>
  ${list([
    `The board is <b>${CLEARINGS.length} clearings</b> joined by <b>paths</b>. Pieces move along a path from a clearing to a neighbouring one.`,
    `Each clearing has <b>building slots</b> (the dashed squares); the whole forest has only <b>${slotsTotal}</b>. A building fills a slot, so
    slots are contested. <b>Tokens</b> (Elf sympathy, Dwarf tunnels) do <em>not</em> use slots.`,
    `Each faction begins in its own corner: ${f('humans')} top-left, ${f('orcs')} top-right, ${f('elves')} bottom-left, ${f('dwarves')} bottom-right.`,
    `<b>Warriors</b> are the pieces that fight and that give you control. A number badge on a token shows how many warriors are there.`,
    `Turns go <b>clockwise</b>: Humans, Orcs, Elves, Dwarves. A <b>round</b> is one turn for each faction.`,
  ])}
  <h3>Where everyone starts</h3>
  <table class="guide-table"><tr><th>Faction</th><th>Home clearing</th><th>Warriors at the start</th><th>Starting pieces</th></tr>
  ${['humans', 'orcs', 'elves', 'dwarves'].map((id) => {
    const h = home(id);
    const kinds = [...g.board[h].b, ...g.board[h].k].filter((p) => p.f === id).map((p) => p.t);
    return `<tr><td>${f(id)}</td><td>${h}</td><td>${wc(g, h, id)}</td><td>${kinds.join(', ')}</td></tr>`;
  }).join('')}</table>
  <p class="note">The Humans show one more than they begin with because their first dawn has already recruited a warrior. The Elves also begin with ${E0.facts.startSupporters} supporters. Each faction has more in reserve than it starts with: ${['humans', 'orcs', 'elves', 'dwarves'].map((id) => `${NAMES[id]} ${FACTIONS[id].pieces.warriors}`).join(', ')} warriors in all.</p>
</section>

<section id="g-turn">
  <h2>A turn</h2>
  <p>A turn is made of <b>phases</b>, shown in the bar above the board. Each faction has its own phases, but they are always some of
  <b>dawn</b> (set-up and income), <b>day</b> (your actions) and <b>dusk</b> (scoring and clean-up).</p>
  ${list([
    `Some phases happen <b>by themselves</b> (such as the Humans' dawn recruiting). You only choose in the others.`,
    `<b>Actions</b> are the choices you make in your day: a move, an attack, a build. The bar says how many you have left. Unused actions are lost.`,
    `When you are done, press the gold <b>End</b> button to finish the phase. You may end early.`,
    `If a faction has a forced step (the Orc war chant) the game only offers legal choices, and if there are none it tells you what happens.`,
  ])}
</section>

<section id="g-rule">
  <h2>Ruling</h2>
  <p>You <b>rule</b> a clearing when you have <b>more pieces in it than any other faction</b>, counting <b>warriors and buildings</b>
  (not tokens). A tie, or an empty clearing, is ruled by nobody. A coloured ring shows who rules each clearing.</p>
  <p>Ruling matters because of what it lets you do:</p>
  ${list([
    `<b>Build</b>: Humans and Orcs may only build in a clearing they rule (and have a warrior in). Elves build only by <b>revolting</b> in a clearing with their sympathy; Dwarves <b>forge</b> only where they hold a tunnel and enough warriors.`,
    `<b>March</b>: Humans and Elves may only move out of or into a clearing they rule. Orcs may march from anywhere. Dwarves can hop between tunnels whatever rules either end.`,
    `<b>Score</b>: the Dwarves score only for strongholds they still rule at dusk.`,
  ])}
  <p>Buildings count toward ruling, so a clearing with your building in it is hard for an enemy to take even if your warriors have left.</p>
</section>

<section id="g-fight">
  <h2>Fighting</h2>
  <p>You may attack a faction that has pieces in a clearing where <b>you have at least one warrior</b>. It costs an action (for the Orcs, a
  battle order). Combat is the same for everyone, with a few faction twists:</p>
  <ol>
    <li>The attacker rolls <b>two dice</b>, each showing 0 to 3.</li>
    <li>The <b>higher</b> die is the number of hits the <b>attacker</b> deals; the <b>lower</b> die is the number the <b>defender</b> deals back.</li>
    <li>Each side's hits are capped by how many <b>warriors it has in the clearing</b>.</li>
    <li>If the defender has <b>no warriors</b> there, the attacker deals <b>one extra hit</b>.</li>
    <li>Each hit removes one piece: <b>warriors first, then buildings, then tokens</b>. Removed pieces go back to their owner's reserve.</li>
    <li>Every <b>building or token</b> destroyed scores its destroyer <b>1 VP</b>. Warriors do not score.</li>
  </ol>
  <h3>Faction twists</h3>
  ${list([
    `${f('orcs')}: <b>+${O.facts.attackBonus} hit</b> when they attack.`,
    `${f('elves')}: an attacker deals <b>1 fewer hit</b> in a clearing where the Elves have a sympathy token.`,
    `${f('dwarves')}: an attacker deals <b>1 fewer hit</b> in a clearing where the Dwarves have a stronghold.`,
  ])}
  <p><b>Rule of thumb:</b> more warriors means more hits <em>and</em> fewer hits taken, so bring numbers. Attacking a lone building with a big force is the safest way to score.</p>
</section>

<section id="g-score">
  <h2>Scoring</h2>
  <table class="guide-table"><tr><th>Faction</th><th>Where the points come from</th></tr>
    <tr><td>${f('humans')}</td><td>Each <b>dawn</b>, by mills on the board: ${nums(H.facts.millScore.slice(1))} VP for 1 to 6 mills.</td></tr>
    <tr><td>${f('orcs')}</td><td>Each <b>dusk</b>, by warcamps on the board: ${nums(O.facts.campScore.slice(1))} VP for 1 to 6. A frenzy costs up to ${O.facts.maxFrenzyLoss}.</td></tr>
    <tr><td>${f('elves')}</td><td>When they <b>place sympathy tokens</b>: ${nums(E.facts.spreadScore)} VP for the 1st to 10th (by tokens already out).</td></tr>
    <tr><td>${f('dwarves')}</td><td>${D.facts.strongholdScore} VP per <b>stronghold they rule</b> each dusk, plus ${D.facts.forgeScore} VP when they forge one.</td></tr>
    <tr><td>Everyone</td><td><b>1 VP</b> for each enemy building or token destroyed.</td></tr>
  </table>
</section>

<section id="g-humans">
  <h2>${crest('humans')} Humans: the engine</h2>
  <p>Slow to start and strong late. Everything the Humans do feeds their economy of mills and warriors.</p>
  <h3>Their turn</h3>
  ${list([
    `<b>Dawn (automatic):</b> every barracks recruits <b>1 warrior</b> into its own clearing, then you score for your mills.`,
    `<b>Day:</b> <b>${H.facts.baseActions} actions</b>, plus <b>1 more for every 2 mills</b> on the board.`,
  ])}
  <h3>Actions (1 each)</h3>
  ${list([
    `<b>Move</b> warriors one step along a path. You must rule the clearing you leave or the one you enter.`,
    `<b>Attack</b> in a clearing where you have a warrior.`,
    `${pic('mill')} <b>Build a mill</b> or ${pic('barracks')} <b>a barracks</b> in a clearing you <b>rule</b>, where you have a <b>warrior</b> and a <b>free slot</b>, and which has none of that building already. You have ${H.pieces.mill} of each.`,
  ])}
  <h3>Strategy</h3>
  ${list([
    `<b>Mills first.</b> Each one raises your income every dawn and every second one is another action. The earlier they go up, the more they pay.`,
    `You need a warrior <em>and</em> rule to build, so spread single warriors to empty clearings, then build behind them.`,
    `Barracks are your warrior supply. Without them you run dry; with too many you have no points. Aim for a mix.`,
    `Your weakness is speed: Orcs and Dwarves can out-fight you early. Keep warriors near buildings, and hit exposed enemy buildings for points while you grow.`,
  ])}
</section>

<section id="g-orcs">
  <h2>${crest('orcs')} Orcs: the warband</h2>
  <p>The Orcs are aggressive and chaotic. They follow a strict list of orders every day, and get into trouble if they cannot follow it.</p>
  <h3>Their turn</h3>
  ${list([
    `<b>Dawn:</b> you may <b>add up to ${O.facts.maxExtraOrders} orders</b> to the war chant (recruit, move, battle or build). Added orders stay until the chant breaks.`,
    `<b>Day:</b> carry out the chant <b>in order</b>: <b>${nums(O.facts.baseChant)}</b>, then any extras you added, one action each. The green chips in the side panel show it, with the current order lit.`,
    `<b>Dusk (automatic):</b> you score for your warcamps.`,
  ])}
  <h3>The orders</h3>
  ${list([
    `<b>Recruit:</b> place a warrior at a warcamp (if you have none, wherever you have warriors, or at home).`,
    `<b>Move:</b> march warriors one step <b>from anywhere</b>: the Orcs ignore the ruling restriction.`,
    `<b>Battle:</b> attack in a clearing where you have a warrior. Your attackers get <b>+${O.facts.attackBonus} hit</b>.`,
    `${pic('warcamp')} <b>Build:</b> a warcamp in a clearing you rule where you have a warrior, a free slot and no warcamp of yours. You have ${O.pieces.warcamp}.`,
  ])}
  <h3>Frenzy</h3>
  <p>If the next order has <b>no legal way to be done</b> (a battle with no enemy in reach, a build with nowhere to build), the band falls into
  <b>frenzy</b>: you lose points (up to ${O.facts.maxFrenzyLoss}, one for each order left), the added orders are thrown away, and the chant resets.
  The game shows a red "Frenzy" button when there is no other choice.</p>
  <h3>Strategy</h3>
  ${list([
    `<b>Plan the whole chant, not one order.</b> Use <em>move</em> to put your warriors next to an enemy so the <em>battle</em> after it has a target, and keep a free slot where you rule for the final <em>build</em>.`,
    `Extra <b>recruit</b> orders are the safe way to lengthen the chant: they can almost never fail. Extra battle and build orders raise the risk of frenzy.`,
    `Warcamps are your score and your recruiting: protect them, and build more when you can. Every one is worth more dusk points.`,
    `Your +1 hit makes you the best attacker in the forest. Use it on buildings.`,
  ])}
</section>

<section id="g-elves">
  <h2>${crest('elves')} Elves: the insurgency</h2>
  <p>The Elves win hearts before they win battles. They are weak in open combat but score steadily and can flip a clearing in one move.</p>
  <h3>Their turn</h3>
  ${list([
    `<b>Dawn (automatic):</b> gain <b>${E.facts.supportersPerDawn} supporters</b> (you start with ${E.facts.startSupporters}). Supporters are the currency of the Elves and are shown in the side panel.`,
    `<b>Day:</b> <b>${E.facts.baseActions} actions</b>, plus <b>1 per stronghold</b> on the board.`,
    `<b>Dusk:</b> you may <b>organize</b> once: trade one warrior for a free sympathy token in a clearing without one.`,
  ])}
  <h3>Actions (1 each)</h3>
  ${list([
    `${pic('sympathy')} <b>Spread sympathy:</b> place a token in a clearing next to one that already has one (you begin with one at home, free and unscored). It costs supporters by how many tokens you have out: ${nums(E.facts.spreadCost)} for the 1st to 10th. Each one <b>scores</b> by the same count: ${nums(E.facts.spreadScore)}.`,
    `${pic('stronghold-elves')} <b>Revolt</b> (${E.facts.revoltCost} supporters): in a clearing with your sympathy, <b>destroy every enemy piece</b> (each building or token scores you 1), plant a stronghold, and place warriors equal to 1 plus the sympathetic clearings next to it. You have ${E.pieces.stronghold} strongholds.`,
    `<b>Move</b> and <b>attack</b>, as the Humans do (you must rule one end of a move).`,
  ])}
  <h3>Strategy</h3>
  ${list([
    `<b>Spread early.</b> Cheap tokens come first and the cost climbs: ${nums(E.facts.spreadCost.slice(0, 3))} then more. Points per token also rise, so the later ones are worth the price.`,
    `A <b>revolt</b> is your weapon: wait until an enemy has built heavily next to your sympathy, then wipe it out for points and a stronghold. Keep ${E.facts.revoltCost} supporters in reserve.`,
    `Attackers are weakened wherever you have sympathy, so <b>defend on sympathetic ground</b> and avoid fights elsewhere.`,
    `Strongholds give extra actions: they are your tempo as well as your threat.`,
  ])}
</section>

<section id="g-dwarves">
  <h2>${crest('dwarves')} Dwarves: the tunnel fortress</h2>
  <p>The Dwarves are hard to dislodge and very mobile. They dig tunnels to strike anywhere and fortify what they hold.</p>
  <h3>Their turn</h3>
  ${list([
    `<b>Dawn (automatic):</b> recruit <b>${D.facts.recruitsPerDawn} warriors</b> at your strongholds and tunnels.`,
    `<b>Day:</b> <b>${D.facts.actions} actions</b>.`,
    `<b>Dusk (automatic):</b> <b>${D.facts.strongholdScore} VP</b> for each stronghold you rule.`,
  ])}
  <h3>Actions (1 each)</h3>
  ${list([
    `${pic('tunnel')} <b>Dig:</b> place a tunnel where you have a warrior (you have ${D.pieces.tunnel}). Warriors may then <b>march between any two tunnels</b> in one move, ignoring paths and ruling.`,
    `${pic('stronghold-dwarves')} <b>Forge:</b> in a clearing with your tunnel, a free slot and at least <b>${D.facts.forgeMinWarriors} warriors</b>, spend <b>${D.facts.forgeCost}</b> of them to build a stronghold (+${D.facts.forgeScore} VP). You have ${D.pieces.stronghold}.`,
    `<b>Move</b> by path (you must rule one end, as for the Humans) or by tunnel (no ruling needed), and <b>attack</b>.`,
  ])}
  <h3>Strategy</h3>
  ${list([
    `Strongholds score every turn <em>only while you rule them</em>: keep warriors there. A stronghold is also <b>armour</b>: attackers deal one fewer hit against it.`,
    `Tunnels are your strategic reach: put them where you want to strike, then jump a whole army across the forest in one action.`,
    `You are not quick to start, so forge early; two strongholds ruled is already ${D.facts.strongholdScore * 2} VP a turn.`,
    `Do not over-extend: forging costs ${D.facts.forgeCost} warriors each time.`,
  ])}
</section>

<section id="g-ui">
  <h2>The screen</h2>
  ${list([
    `<b>Board:</b> tap a clearing that <b>glows gold</b> to see what you can do there. The buttons list every legal move for that clearing; hover one to preview where it goes.`,
    `<b>Gold "End" button:</b> finishes your phase. It is there whenever you are allowed to stop (the Orcs must finish their chant first).`,
    `<b>Scoreboard:</b> everyone's points, with a bar toward ${WIN_VP}. The faction whose turn it is has a coloured outline.`,
    `<b>Side panel:</b> the Orc war chant and Elf supporters when those factions are in the game.`,
    `<b>Dice:</b> when someone attacks, two dice tumble above the clearing. The left die (in the attacker's colour) is the higher roll and the right die (the defender's colour) is the lower; under each is how many hits it caused. Casualties show as a floating "−1", and a destroyed building shows "+1" for the point it scored. Armies slide when they march, and the scoreboard bars fill as points arrive. You can turn all of this off with the <b>Animations</b> checkbox on the menu.`,
    `<b>Log:</b> what just happened, most recent first. <b>Status bar:</b> whose turn, which phase, and how many actions are left.`,
    `<b>Speaker button:</b> sound on or off. <b>?</b> opens this guide any time. <b>Menu</b> leaves the game.`,
  ])}
</section>

<section id="g-online">
  <h2>Playing with friends</h2>
  ${list([
    `<b>Create a room</b> and tell your friends the four-letter code; they tap <b>Join</b>. The host assigns bots to empty seats and starts the game. You need at least two seats.`,
    `<b>Turn timer:</b> the host can set an idle limit (30 seconds up to 3 minutes). It restarts after every move, so only someone who has walked away runs out. A timeout passes their turn; two in a row and a bot plays for them until they tap <b>Take my seat back</b>.`,
    `<b>Host:</b> the host's device plays the bots. If the host leaves or disconnects, another player takes over automatically, or the host can use <b>Make host</b> in the lobby.`,
    `Closing the tab keeps your seat: use <b>Rejoin room</b> on the menu.`,
  ])}
</section>

<section id="g-faq">
  <h2>Questions</h2>
  <dl>
    <dt>Why can't I build in a clearing?</dt>
    <dd>You must <b>rule</b> it, have a <b>warrior</b> there, and it needs a <b>free slot</b>. The Humans can't put a second mill or barracks in one clearing, nor the Orcs a second warcamp. Elves and Dwarves build differently (revolt, forge).</dd>
    <dt>Why can't I move somewhere?</dt>
    <dd>Humans and Elves must rule the clearing they leave or the one they enter, and moves follow paths. Dwarves can also use tunnels.</dd>
    <dt>Why is there no Attack button?</dt>
    <dd>You need a warrior in a clearing that holds an enemy piece, and an action left.</dd>
    <dt>Do warriors score when they die?</dt>
    <dd>No. Only destroyed <b>buildings and tokens</b> score 1 VP for the destroyer.</dd>
    <dt>What if two factions are close to 30?</dt>
    <dd>The game checks after every action, so the first faction to reach ${WIN_VP} wins immediately.</dd>
    <dt>What if I take too long online?</dt>
    <dd>If the host set a timer, your turn is passed when it runs out. Move any time to reset it.</dd>
  </dl>
</section>`;
}
