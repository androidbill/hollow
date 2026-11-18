// The forest: 12 clearings joined by paths. Positions are on a 4x3 grid, for
// drawing later, but the game only ever uses the adjacency list - it is a graph,
// not a grid. The grid's centre links (5-6 and 9-10) are cut and two diagonals
// (1-6 and 5-10) are added, so the middle is not a plain lattice.
//
// Corners are the four home clearings: 0 Humans, 3 Orcs, 8 Elves, 11 Dwarves.

const COLS = 4;
const SLOTS = [2, 2, 2, 2, 1, 3, 3, 1, 2, 2, 2, 2];

export const CLEARINGS = SLOTS.map((slots, id) => ({
  id,
  slots,
  x: id % COLS,
  y: Math.floor(id / COLS),
}));

const EDGES = [
  [0, 1], [1, 2], [2, 3],
  [4, 5], [6, 7],
  [8, 9], [10, 11],
  [0, 4], [4, 8],
  [1, 5], [5, 9],
  [2, 6], [6, 10],
  [3, 7], [7, 11],
  [1, 6], // diagonals break up the grid
  [5, 10],
];

export const ADJ = CLEARINGS.map(() => []);
for (const [a, b] of EDGES) {
  ADJ[a].push(b);
  ADJ[b].push(a);
}
ADJ.forEach((list) => list.sort((p, q) => p - q));

export const HOMES = { humans: 0, orcs: 3, elves: 8, dwarves: 11 };
