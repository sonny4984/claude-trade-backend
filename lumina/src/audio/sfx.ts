/**
 * 효과음 — 전부 Web Audio로 합성한다 (파일 없음, 저작권 걱정 없음, 용량 0).
 * 상아 타일이 펠트에 놓이는 소리, 나무를 두드리는 소리처럼 짧고 부드럽게.
 * 브라우저 자동재생 제한 때문에 첫 터치에서 unlockAudio()로 깨운다.
 */
import { useSettings } from '../store/settings';

export type SfxName =
  | 'pick'
  | 'place'
  | 'slide'
  | 'split'
  | 'invalid'
  | 'turn'
  | 'tick'
  | 'draw'
  | 'commit'
  | 'meld'
  | 'win'
  | 'lose'
  | 'button'
  | 'shuffle'
  | 'hint'
  | 'pop'
  /** 기니피그 울음: 점프 꾸잉, 젤리 뀨이잉, 넘어질 때 끼잉 */
  | 'squeak'
  | 'wheek'
  | 'sadsqueak';

type Category = 'tiles' | 'cues' | 'fanfare';
const CATEGORY: Record<SfxName, Category> = {
  squeak: 'cues',
  wheek: 'cues',
  sadsqueak: 'cues',
  pick: 'tiles',
  place: 'tiles',
  slide: 'tiles',
  split: 'tiles',
  pop: 'tiles',
  invalid: 'cues',
  turn: 'cues',
  tick: 'cues',
  hint: 'cues',
  button: 'cues',
  draw: 'fanfare',
  commit: 'fanfare',
  meld: 'fanfare',
  win: 'fanfare',
  lose: 'fanfare',
  shuffle: 'fanfare',
};

let ctx: AudioContext | null = null;
let noise: AudioBuffer | null = null;
let lastAt: Partial<Record<SfxName, number>> = {};

function audio(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const len = Math.floor(ctx.sampleRate * 0.5);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  } catch {
    return null;
  }
}

export function unlockAudio(): void {
  const c = audio();
  if (c && c.state === 'suspended') void c.resume().catch(() => undefined);
}

function volume(name: SfxName): number {
  const s = useSettings.getState();
  const cat = CATEGORY[name];
  const v = cat === 'tiles' ? s.volTiles : cat === 'cues' ? s.volCues : s.volFanfare;
  return s.master * v;
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number): void {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(c: AudioContext, out: AudioNode, t: number, freq: number, type: OscillatorType, peak: number, attack: number, decay: number, glideTo?: number): void {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
  env(g, t, peak, attack, decay);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + decay + 0.05);
}

function burst(c: AudioContext, out: AudioNode, t: number, filter: BiquadFilterType, f0: number, f1: number, q: number, peak: number, dur: number): void {
  if (!noise) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const bq = c.createBiquadFilter();
  bq.type = filter;
  bq.frequency.setValueAtTime(f0, t);
  bq.frequency.exponentialRampToValueAtTime(f1, t + dur);
  bq.Q.value = q;
  const g = c.createGain();
  env(g, t, peak, 0.002, dur);
  src.connect(bq).connect(g).connect(out);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.05);
}

/** 기니피그 울음 한 번: 세모파가 pts(시각, 높이)를 따라 미끄러지고, 떨림(비브라토)을 얹는다 */
function squeal(c: AudioContext, out: AudioNode, t: number, pts: readonly (readonly [number, number])[], dur: number, peak: number, vibHz = 26, vibDepth = 55): void {
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime((pts[0] as readonly [number, number])[1], t);
  for (const [dt, f] of pts.slice(1)) o.frequency.exponentialRampToValueAtTime(f, t + dt);
  const lfo = c.createOscillator();
  lfo.frequency.value = vibHz;
  const lg = c.createGain();
  lg.gain.value = vibDepth;
  lfo.connect(lg).connect(o.frequency);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700;
  bp.Q.value = 0.8;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012);
  g.gain.setValueAtTime(peak, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(bp).connect(g).connect(out);
  o.start(t);
  lfo.start(t);
  o.stop(t + dur + 0.03);
  lfo.stop(t + dur + 0.03);
}

export function sfx(name: SfxName, opts: { delay?: number; pitch?: number } = {}): void {
  const vol = volume(name);
  if (vol <= 0.001) return;
  const c = audio();
  if (!c || c.state !== 'running') return;
  // 같은 소리가 한 프레임에 겹치면 귀가 피곤하다
  const now = performance.now();
  if ((lastAt[name] ?? 0) > now - 28 && !opts.delay) return;
  lastAt[name] = now;
  const t = c.currentTime + (opts.delay ?? 0) / 1000;
  const p = (opts.pitch ?? 1) * (0.94 + Math.random() * 0.12);
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(c.destination);
  switch (name) {
    case 'squeak':
      // 꾸(짧고 낮게) + 잉(올라갔다 살짝 내려옴)
      squeal(c, out, t, [[0, 900 * p], [0.035, 1450 * p], [0.09, 2000 * p], [0.15, 1600 * p]], 0.16, 0.2);
      break;
    case 'wheek':
      squeal(c, out, t, [[0, 1100 * p], [0.18, 2500 * p], [0.3, 2100 * p]], 0.32, 0.2, 22, 70);
      break;
    case 'sadsqueak':
      squeal(c, out, t, [[0, 1700 * p], [0.32, 620 * p]], 0.36, 0.18, 14, 40);
      break;
    case 'pick':
      burst(c, out, t, 'highpass', 2600, 3200, 0.7, 0.12, 0.018);
      tone(c, out, t, 2300 * p, 'sine', 0.05, 0.002, 0.03, 1800 * p);
      break;
    case 'place':
      burst(c, out, t, 'lowpass', 1400, 500, 0.8, 0.32, 0.05);
      tone(c, out, t, 330 * p, 'sine', 0.16, 0.003, 0.07, 240 * p);
      tone(c, out, t + 0.004, 1650 * p, 'triangle', 0.03, 0.001, 0.025);
      break;
    case 'pop':
      tone(c, out, t, 520 * p, 'sine', 0.12, 0.004, 0.08, 880 * p);
      break;
    case 'slide':
      burst(c, out, t, 'bandpass', 700, 1700, 1.2, 0.08, 0.09);
      break;
    case 'split':
      burst(c, out, t, 'highpass', 2000, 2400, 0.8, 0.1, 0.014);
      burst(c, out, t + 0.06, 'highpass', 2200, 2600, 0.8, 0.1, 0.014);
      break;
    case 'invalid':
      tone(c, out, t, 190, 'sine', 0.22, 0.002, 0.07, 150);
      tone(c, out, t + 0.085, 160, 'sine', 0.18, 0.002, 0.07, 130);
      burst(c, out, t, 'lowpass', 900, 400, 0.7, 0.08, 0.04);
      break;
    case 'turn':
      tone(c, out, t, 660, 'sine', 0.07, 0.012, 0.5);
      tone(c, out, t + 0.09, 990, 'sine', 0.05, 0.012, 0.55);
      break;
    case 'tick':
      tone(c, out, t, 1050, 'sine', 0.05, 0.002, 0.03);
      break;
    case 'hint':
      tone(c, out, t, 1320, 'sine', 0.05, 0.004, 0.35);
      tone(c, out, t + 0.07, 1760, 'sine', 0.03, 0.004, 0.3);
      break;
    case 'button':
      burst(c, out, t, 'highpass', 3000, 3200, 0.6, 0.05, 0.01);
      break;
    case 'draw':
      burst(c, out, t, 'bandpass', 2200, 600, 1.4, 0.12, 0.16);
      tone(c, out, t + 0.12, 300, 'sine', 0.08, 0.004, 0.06);
      break;
    case 'commit':
      [523.25, 659.25, 783.99].forEach((f, i) => tone(c, out, t + i * 0.03, f, 'triangle', 0.05, 0.01, 0.55));
      break;
    case 'meld':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(c, out, t + i * 0.045, f, 'triangle', 0.05, 0.01, 0.6));
      break;
    case 'win':
      [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(c, out, t + i * 0.11, f, 'triangle', 0.07, 0.012, 0.9));
      tone(c, out, t + 0.6, 783.99, 'sine', 0.04, 0.05, 1.1);
      break;
    case 'lose':
      tone(c, out, t, 440, 'triangle', 0.06, 0.02, 0.45);
      tone(c, out, t + 0.28, 349.23, 'triangle', 0.06, 0.02, 0.7);
      break;
    case 'shuffle':
      for (let i = 0; i < 9; i++) burst(c, out, t + i * 0.045 + Math.random() * 0.02, 'bandpass', 1800, 2400, 1, 0.06, 0.02);
      break;
  }
}

export function resetSfxThrottle(): void {
  lastAt = {};
}
