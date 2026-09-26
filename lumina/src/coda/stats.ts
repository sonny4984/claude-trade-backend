/**
 * 다빈치 코드 기록 (기기 안에만 저장). LUMINA 기록과 따로 둔다.
 */
import { create } from 'zustand';
import { readJSON, writeJSON } from '../store/storage';

export interface CodaRecord {
  readonly at: number;
  readonly mode: 'solo' | 'local' | 'online';
  readonly names: readonly string[];
  /** 기록의 주인 — 혼자 두기는 사람 자리, 함께 두기는 첫 번째 사람 */
  readonly me: number;
  readonly winner: number;
  readonly guesses: number;
  readonly correct: number;
  readonly bestStreak: number;
  readonly durationMs: number;
}

const KEY = 'lumina.coda-stats.v1';
const MAX = 300;

function load(): readonly CodaRecord[] {
  const raw = readJSON<CodaRecord[]>(KEY);
  return Array.isArray(raw) ? raw.filter((r) => r && typeof r.at === 'number' && Array.isArray(r.names)).slice(-MAX) : [];
}

interface CodaStatsState {
  records: readonly CodaRecord[];
  add: (r: CodaRecord) => void;
  clear: () => void;
}

export const useCodaStats = create<CodaStatsState>((set, get) => ({
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

export interface CodaSummary {
  played: number;
  wins: number;
  winRate: number;
  accuracy: number;
  bestStreak: number;
}

export function summarizeCoda(records: readonly CodaRecord[]): CodaSummary {
  let wins = 0;
  let guesses = 0;
  let correct = 0;
  let best = 0;
  for (const r of records) {
    if (r.winner === r.me) wins++;
    guesses += r.guesses;
    correct += r.correct;
    best = Math.max(best, r.bestStreak);
  }
  return {
    played: records.length,
    wins,
    winRate: records.length ? wins / records.length : 0,
    accuracy: guesses ? correct / guesses : 0,
    bestStreak: best,
  };
}
