import { solve } from '../src/game/solver';
import { createRng, shuffle } from '../src/game/rng';
import { TILES, isJoker, tile } from '../src/game/tiles';
import { analyzeSet } from '../src/game/sets';
import { COLORS, type TileId } from '../src/game/types';

function randomTable(seed: number, sets: number): { table: TileId[]; remaining: TileId[] } {
  const rng = createRng(seed);
  let deck = shuffle(TILES.map((t) => t.id), rng);
  const table: TileId[] = [];
  const take = (pred: (id: TileId) => boolean): TileId | undefined => {
    const i = deck.findIndex(pred);
    if (i < 0) return undefined;
    const id = deck[i] as TileId;
    deck = [...deck.slice(0, i), ...deck.slice(i + 1)];
    return id;
  };
  for (let k = 0; k < sets; k++) {
    if (rng.next() < 0.5) {
      const c = COLORS[rng.int(4)] as string;
      const len = 3 + rng.int(4);
      const start = 1 + rng.int(13 - len + 1);
      const got: TileId[] = [];
      for (let v = start; v < start + len; v++) {
        const id = rng.next() < 0.08 ? take((x) => isJoker(x)) : undefined;
        const real = id ?? take((x) => { const t = tile(x); return t.kind === 'number' && t.color === c && t.value === v; });
        if (real === undefined) break;
        got.push(real);
      }
      if (got.length >= 3 && analyzeSet(got).ok) table.push(...got); else deck.push(...got);
    } else {
      const v = 1 + rng.int(13);
      const cols = shuffle([...COLORS], rng).slice(0, 3 + rng.int(2));
      const got: TileId[] = [];
      for (const c of cols) {
        const id = take((x) => { const t = tile(x); return t.kind === 'number' && t.color === c && t.value === v; });
        if (id !== undefined) got.push(id);
      }
      if (got.length >= 3 && analyzeSet(got).ok) table.push(...got); else deck.push(...got);
    }
  }
  return { table, remaining: deck };
}

const times: { ms: number; t: number; r: number; j: number }[] = [];
for (let k = 0; k < 200; k++) {
  const { table, remaining } = randomTable(k * 7 + 3, 6 + (k % 10));
  const rack = shuffle(remaining, createRng(k + 11)).slice(0, 5 + (k % 20));
  const t0 = performance.now();
  solve({ table, rack });
  times.push({ ms: performance.now() - t0, t: table.length, r: rack.length, j: [...table, ...rack].filter(isJoker).length });
}
times.sort((a, b) => a.ms - b.ms);
const pct = (p: number) => times[Math.floor((times.length - 1) * p)]!.ms.toFixed(1);
console.log('p50', pct(0.5), 'p90', pct(0.9), 'p99', pct(0.99), 'max', times[times.length - 1]!.ms.toFixed(1));
console.log('slowest', times.slice(-5).map((x) => `${x.ms.toFixed(0)}ms table=${x.t} rack=${x.r} jokers=${x.j}`));
