import { create } from 'zustand';
import { readJSON, writeJSON } from './storage';
import type { ThemeId } from './settings';

/** 판 하나의 기록 (기기 안에만 저장) */
export interface GameRecord {
  readonly at: number;
  readonly mode: 'solo' | 'local';
  readonly names: readonly string[];
  readonly humans: readonly boolean[];
  /** 기록의 주인(이 기기에서 "나") — 혼자 두기에서는 사람 자리, 함께 두기에서는 첫 번째 사람 */
  readonly me: number;
  readonly winners: readonly number[];
  readonly deltas: readonly number[];
  readonly durationMs: number;
  readonly largestMove: number;
  readonly jokers: number;
  readonly rearrangements: number;
  readonly longestRun: number;
  readonly theme: ThemeId;
  readonly reason: 'out' | 'stalemate';
}

interface StatsState {
  records: readonly GameRecord[];
  add: (r: GameRecord) => void;
  clear: () => void;
}

const KEY = 'lumina.stats.v1';
const MAX = 300;

function load(): readonly GameRecord[] {
  const raw = readJSON<GameRecord[]>(KEY);
  return Array.isArray(raw) ? raw.filter((r) => r && typeof r.at === 'number' && Array.isArray(r.names)).slice(-MAX) : [];
}

export const useStats = create<StatsState>((set, get) => ({
  records: load(),
  add: (r) => {
    const records = [...get().records, r].slice(-MAX);
    set({ records });
    writeJSON(KEY, records);
  },
  clear: () => {
    set({ records: [] });
    writeJSON(KEY, []);
  },
}));

export interface Summary {
  played: number;
  wins: number;
  losses: number;
  winRate: number;
  avgDurationMs: number;
  fastestWinMs: number | null;
  largestMove: number;
  highestScore: number;
  jokers: number;
  longestRun: number;
  favoriteTheme: ThemeId | null;
  people: { name: string; games: number; wins: number }[];
}

export function summarize(records: readonly GameRecord[]): Summary {
  let wins = 0;
  let dur = 0;
  let fastest: number | null = null;
  let largest = 0;
  let high = 0;
  let jokers = 0;
  let longest = 0;
  const themes = new Map<ThemeId, number>();
  const people = new Map<string, { games: number; wins: number }>();
  for (const r of records) {
    const won = r.winners.includes(r.me);
    if (won) {
      wins++;
      fastest = fastest === null ? r.durationMs : Math.min(fastest, r.durationMs);
    }
    dur += r.durationMs;
    largest = Math.max(largest, r.largestMove);
    high = Math.max(high, r.deltas[r.me] ?? 0);
    jokers += r.jokers;
    longest = Math.max(longest, r.longestRun);
    themes.set(r.theme, (themes.get(r.theme) ?? 0) + 1);
    if (r.mode === 'local') {
      r.names.forEach((n, i) => {
        if (!r.humans[i]) return;
        const p = people.get(n) ?? { games: 0, wins: 0 };
        p.games++;
        if (r.winners.includes(i)) p.wins++;
        people.set(n, p);
      });
    }
  }
  let fav: ThemeId | null = null;
  let favN = 0;
  themes.forEach((n, t) => {
    if (n > favN) {
      favN = n;
      fav = t;
    }
  });
  const played = records.length;
  return {
    played,
    wins,
    losses: played - wins,
    winRate: played ? wins / played : 0,
    avgDurationMs: played ? dur / played : 0,
    fastestWinMs: fastest,
    largestMove: largest,
    highestScore: high,
    jokers,
    longestRun: longest,
    favoriteTheme: fav,
    people: [...people.entries()].map(([name, v]) => ({ name, ...v })).sort((a, b) => b.wins - a.wins || b.games - a.games),
  };
}
