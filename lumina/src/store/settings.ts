import { create } from 'zustand';
import { readJSON, writeJSON } from './storage';
import { CLASSIC_RULES, sanitizeRules, type RuleSet } from '../game/rules';
import type { AiLevel } from '../game/types';
import type { MatchFormat } from '../game/match';
import { isCharacterId, type CharacterId } from '../characters/roster';

export type ThemeId = 'lumina' | 'ivory' | 'midnight' | 'walnut' | 'glass' | 'studio' | 'pastel' | 'matcha';
export const THEME_IDS: readonly ThemeId[] = ['lumina', 'ivory', 'midnight', 'walnut', 'glass', 'studio', 'pastel', 'matcha'];
export type Lang = 'ko' | 'en';

export interface SeatConfig {
  readonly name: string;
  readonly kind: 'human' | 'ai';
  readonly level: AiLevel;
  readonly character: CharacterId;
}

export interface SetupConfig {
  readonly mode: 'solo' | 'local';
  readonly seats: readonly SeatConfig[];
  readonly format: MatchFormat;
  readonly rules: RuleSet;
}

export interface SettingsState {
  lang: Lang;
  theme: ThemeId;
  tileSize: 'S' | 'M' | 'L';
  motion: 'system' | 'full' | 'reduced';
  master: number;
  /** 타일 소리 (집기·놓기·밀기) */
  volTiles: number;
  /** 알림 (차례·시간·잘못된 동작·힌트) */
  volCues: number;
  /** 연출 (내기·등록·뽑기·승리) */
  volFanfare: number;
  haptics: boolean;
  colorMarks: boolean;
  highContrast: boolean;
  cvd: boolean;
  aiSpeed: 'fast' | 'normal' | 'slow';
  hints: 'limited' | 'unlimited' | 'off';
  confirmDraw: boolean;
  autoSort: 'off' | 'color' | 'number';
  show3d: boolean;
  lastSolo: SetupConfig | null;
  lastLocal: SetupConfig | null;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

const KEY = 'lumina.settings.v1';

const DEFAULTS: Omit<SettingsState, 'set'> = {
  lang: 'ko',
  theme: 'lumina',
  tileSize: 'M',
  motion: 'system',
  master: 0.8,
  volTiles: 0.9,
  volCues: 0.8,
  volFanfare: 0.8,
  haptics: true,
  colorMarks: true,
  highContrast: false,
  cvd: false,
  aiSpeed: 'normal',
  hints: 'limited',
  confirmDraw: true,
  autoSort: 'color',
  show3d: true,
  lastSolo: null,
  lastLocal: null,
};

function pick<T>(v: unknown, ok: readonly T[], d: T): T {
  return ok.includes(v as T) ? (v as T) : d;
}

function sanitizeSetup(x: unknown): SetupConfig | null {
  if (!x || typeof x !== 'object') return null;
  const s = x as Partial<SetupConfig>;
  if (!Array.isArray(s.seats) || s.seats.length < 2 || s.seats.length > 4) return null;
  const seats = s.seats.map((seat, i) => ({
    name: typeof seat?.name === 'string' ? seat.name.slice(0, 12) : `P${i + 1}`,
    kind: seat?.kind === 'ai' ? ('ai' as const) : ('human' as const),
    level: pick<AiLevel>(seat?.level, ['beginner', 'casual', 'advanced', 'expert'], 'casual'),
    character: isCharacterId(seat?.character) ? seat.character : 'hwigi',
  }));
  const f = s.format as MatchFormat | undefined;
  const format: MatchFormat =
    f && f.kind === 'points'
      ? { kind: 'points', target: 100 }
      : { kind: 'games', games: f && f.kind === 'games' && f.games >= 1 && f.games <= 16 ? f.games : 1 };
  return { mode: s.mode === 'local' ? 'local' : 'solo', seats, format, rules: sanitizeRules(s.rules) };
}

function load(): Omit<SettingsState, 'set'> {
  const raw = readJSON<Partial<SettingsState>>(KEY) ?? {};
  const num = (v: unknown, d: number): number => (typeof v === 'number' && v >= 0 && v <= 1 ? v : d);
  return {
    lang: pick<Lang>(raw.lang, ['ko', 'en'], DEFAULTS.lang),
    theme: pick<ThemeId>(raw.theme, THEME_IDS, DEFAULTS.theme),
    tileSize: pick(raw.tileSize, ['S', 'M', 'L'] as const, 'M'),
    motion: pick(raw.motion, ['system', 'full', 'reduced'] as const, 'system'),
    master: num(raw.master, DEFAULTS.master),
    volTiles: num(raw.volTiles, DEFAULTS.volTiles),
    volCues: num(raw.volCues, DEFAULTS.volCues),
    volFanfare: num(raw.volFanfare, DEFAULTS.volFanfare),
    haptics: typeof raw.haptics === 'boolean' ? raw.haptics : DEFAULTS.haptics,
    colorMarks: typeof raw.colorMarks === 'boolean' ? raw.colorMarks : DEFAULTS.colorMarks,
    highContrast: !!raw.highContrast,
    cvd: !!raw.cvd,
    aiSpeed: pick(raw.aiSpeed, ['fast', 'normal', 'slow'] as const, 'normal'),
    hints: pick(raw.hints, ['limited', 'unlimited', 'off'] as const, 'limited'),
    confirmDraw: typeof raw.confirmDraw === 'boolean' ? raw.confirmDraw : true,
    autoSort: pick(raw.autoSort, ['off', 'color', 'number'] as const, 'color'),
    show3d: typeof raw.show3d === 'boolean' ? raw.show3d : true,
    lastSolo: sanitizeSetup(raw.lastSolo),
    lastLocal: sanitizeSetup(raw.lastLocal),
  };
}

export const useSettings = create<SettingsState>((set, get) => ({
  ...load(),
  set: (patch) => {
    set(patch);
    const { set: _omit, ...data } = get();
    void _omit;
    writeJSON(KEY, data);
  },
}));

export function defaultRules(): RuleSet {
  return CLASSIC_RULES;
}

/** 사용자 설정 + 기기 설정을 합친 "움직임 줄이기" 여부 */
export function prefersReducedMotion(): boolean {
  const m = useSettings.getState().motion;
  if (m === 'reduced') return true;
  if (m === 'full') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function aiSpeedFactor(): number {
  const s = useSettings.getState().aiSpeed;
  return s === 'fast' ? 0.5 : s === 'slow' ? 1.5 : 1;
}
