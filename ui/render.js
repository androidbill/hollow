// Draws the board as SVG. Pure: given a game and a view, returns markup. The
// rules live in src/; this file only reads the game state.

import { ADJ, CLEARINGS } from '../src/map.js';
import { ruler } from '../src/helpers.js';

export const COLORS = {
  humans: '#4f8be0',
  orcs: '#58a63f',
  elves: '#b783e8',
  dwarves: '#e08a2e',
};
export const crestSrc = (f) => `assets/crest-${f}.png`;
export const NAMES = { humans: 'Humans', orcs: 'Orcs', elves: 'Elves', dwarves: 'Dwarves' };

// Strongholds are painted per faction (the Elves' and the Dwarves' look nothing alike);
// every other building or token has exactly one owner, so one picture.
export const pieceSrc = (faction, type) =>
  `assets/piece-${type === 'stronghold' ? `stronghold-${faction}` : type}.png`;
const PIECE_NAME = {
  mill: 'mill', barracks: 'barracks', warcamp: 'warcamp', stronghold: 'stronghold',
  sympathy: 'sympathy', tunnel: 'tunnel',
};

export const W = 830;
export const H = 570;
// Hand-placed so the forest does not look like a lattice.
export const POS = [
  [110, 95], [315, 70], [520, 90], [725, 105],
  [90, 285], [300, 270], [525, 300], [735, 280],
  [110, 480], [315, 500], [520, 475], [720, 485],
];
export const R = 62;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function edgeMarkup(g, view) {
  let out = '';
  for (let a = 0; a < POS.length; a++) {
    for (const b of ADJ[a]) {
      if (b < a) continue;
      const hot = view.hoverPath && ((view.hoverPath[0] === a && view.hoverPath[1] === b) || (view.hoverPath[0] === b && view.hoverPath[1] === a));
      out += `<line class="path${hot ? ' hot' : ''}" x1="${POS[a][0]}" y1="${POS[a][1]}" x2="${POS[b][0]}" y2="${POS[b][1]}"/>`;
    }
  }
  // Dwarf tunnels link their clearings regardless of the paths.
  const tunnels = [];
  g.board.forEach((cl, c) => { if (cl.k.some((p) => p.t === 'tunnel')) tunnels.push(c); });
  for (let i = 0; i < tunnels.length; i++) {
    for (let j = i + 1; j < tunnels.length; j++) {
      const a = POS[tunnels[i]];
      const b = POS[tunnels[j]];
      out += `<line class="tunnel-link" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
    }
  }
  return out;
}

// Where everything in a clearing sits, in board coordinates. The drawing below AND the
// animations use this, so a sliding army starts and ends exactly where the real tokens are.
//   tokens:    along the top      warriors: one painted token per faction, in the middle
//   buildings: in the slots along the bottom (slot i is fixed, whether or not it is filled)
export function layout(g, c) {
  const [cx, cy] = POS[c];
  const cl = g.board[c];
  const slots = CLEARINGS[c].slots;
  const tokens = cl.k.map((p, i) => ({ p, i, x: cx + (i - (cl.k.length - 1) / 2) * 30, y: cy - 39 }));
  const factions = Object.keys(cl.w);
  const gap = factions.length > 2 ? 33 : 42;
  const warriors = {};
  factions.forEach((f, i) => { warriors[f] = { x: cx + (i - (factions.length - 1) / 2) * gap, y: cy - 8, n: cl.w[f] }; });
  const slotAt = (i) => ({ x: cx + (i - (slots - 1) / 2) * 38, y: cy + 31 });
  const buildings = cl.b.map((p, i) => ({ p, i, ...slotAt(i) }));
  return { c, cx, cy, tokens, warriors, buildings, slotAt, center: { x: cx, y: cy } };
}

function clearingMarkup(g, c, view) {
  const { cx, cy, tokens, warriors, buildings } = layout(g, c);
  const cl = g.board[c];
  const rule = ruler(g, c);
  const slots = CLEARINGS[c].slots;
  const classes = ['clearing'];
  if (view.targets.has(c)) classes.push('actionable');
  if (view.sel === c) classes.push('selected');
  if (view.dest === c) classes.push('dest');
  if (view.focus?.has(c)) classes.push('focus'); // the tutorial is pointing at this clearing
  let s = `<g class="${classes.join(' ')}" data-c="${c}">`;
  s += `<circle class="glade" cx="${cx}" cy="${cy}" r="${R}"${rule ? ` style="--rule:${COLORS[rule]}"` : ''}/>`;
  s += `<circle class="tint" cx="${cx}" cy="${cy}" r="${R}"/>`; // darkens the grass so pieces read; changes with state
  if (rule) s += `<circle class="rule" cx="${cx}" cy="${cy}" r="${R + 4}" stroke="${COLORS[rule]}"/>`;
  s += `<text class="cid" x="${cx - R + 12}" y="${cy - R + 22}">${c}</text>`;

  // tokens along the top
  for (const { p, i, x } of tokens) {
    const hiddenT = view.hide?.has(`t:${c}:${i}`) ? ' style="visibility:hidden"' : ''; // still popping in on the effects layer
    s += `<g class="piece token" data-ti="${i}"${hiddenT}><title>${esc(NAMES[p.f])} ${PIECE_NAME[p.t]}</title>` +
      `<image href="${pieceSrc(p.f, p.t)}" x="${x - 15}" y="${cy - 54}" width="30" height="30"/></g>`;
  }

  // warriors in the middle: a painted token per faction, with the count in a badge
  for (const [f, { x, n }] of Object.entries(warriors)) {
    const hidden = view.hide?.has(`w:${c}:${f}`) ? ' style="visibility:hidden"' : ''; // an army is still sliding in
    s += `<g class="piece warriors" data-f="${f}"${hidden}><title>${n} ${esc(NAMES[f])} warriors</title>` +
      `<image href="assets/piece-warrior-${f}.png" x="${x - 20}" y="${cy - 28}" width="40" height="40"/>` +
      `<circle class="badge" cx="${x + 14}" cy="${cy + 9}" r="9.5"/>` +
      `<text x="${x + 14}" y="${cy + 13.5}">${n}</text></g>`;
  }

  // building slots along the bottom: empty outlines show the capacity
  for (let i = 0; i < slots; i++) {
    const b = buildings[i];
    if (b) {
      const hiddenB = view.hide?.has(`b:${c}:${i}`) ? ' style="visibility:hidden"' : '';
      s += `<g class="piece building" data-slot="${i}"${hiddenB}><title>${esc(NAMES[b.p.f])} ${PIECE_NAME[b.p.t]}</title>` +
        `<image href="${pieceSrc(b.p.f, b.p.t)}" x="${b.x - 17}" y="${cy + 14}" width="34" height="34"/></g>`;
    } else {
      const { x } = layout(g, c).slotAt(i);
      s += `<rect class="slot" x="${x - 16}" y="${cy + 15}" width="32" height="32" rx="7"/>`;
    }
  }
  return s + '</g>';
}

// The board is a persistent <svg> with two layers: the board itself, which is redrawn from
// the game state on every change, and an effects layer on top that is never redrawn, so an
// animation survives the redraws that happen while it plays. (See ui/fx.js.)
export function boardShell() {
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="The forest">` +
    `<g id="board-layer"></g><g id="fx-layer" pointer-events="none"></g></svg>`;
}

// view: { sel, dest, targets: Set<clearing>, hoverPath: [a,b] | null, focus?: Set, hide?: Set<'clearing:faction'> }
export function renderBoardInner(g, view) {
  // the forest floor behind everything, and the grass tile every clearing is filled with
  let s = `<defs><pattern id="glade-tex" patternUnits="userSpaceOnUse" width="256" height="256">` +
    `<image href="assets/glade.jpg" width="256" height="256"/></pattern></defs>`;
  s += `<image class="forest" href="assets/forest-bg.jpg" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>`;
  s += edgeMarkup(g, view);
  for (let c = 0; c < g.board.length; c++) s += clearingMarkup(g, c, view);
  return s;
}

// the whole thing as one string (a board with no effects in progress)
export function renderBoard(g, view) {
  return boardShell().replace('<g id="board-layer"></g>', `<g id="board-layer">${renderBoardInner(g, view)}</g>`);
}
