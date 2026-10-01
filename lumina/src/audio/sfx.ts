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
  // iOS는 화면이 꺼졌다 켜지거나 전화가 오면 'interrupted'가 되니, 멈춰 있으면 언제든 다시 깨운다
  if (c && c.state !== 'running') void c.resume().catch(() => undefined);
}

/**
 * 아이폰 무음(진동) 모드에서도 들리게 오디오 세션을 '재생'으로 (Safari 16.4+; 안 되는 기기는 그대로).
 * 마피아 목소리를 켰을 때만 — 다른 게임 효과음은 원래처럼 무음 모드를 따른다.
 */
export function loudAudio(on: boolean): void {
  try {
    const s = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    const want = on ? 'playback' : 'auto';
    if (s && s.type !== want) s.type = want;
  } catch {
    /* 지원하지 않는 기기 */
  }
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

/** 한글 모음 → 소리 색 (아·에·어·오·우·으·이) — 띠 거르개 가운데 높이(Hz) */
const VOWEL_COLOR: readonly number[] = [
  1500, 1900, 1500, 1900, 1300, 1900, 1300, 1900, // ㅏㅐㅑㅒㅓㅔㅕㅖ
  1150, 1500, 1900, 1900, 1150, // ㅗㅘㅙㅚㅛ
  950, 1300, 1900, 2300, 950, // ㅜㅝㅞㅟㅠ
  1600, 2100, 2300, // ㅡㅢㅣ
];
const LATIN_COLOR: Readonly<Record<string, number>> = { a: 1500, e: 1900, i: 2300, o: 1150, u: 950, y: 2100 };

/** 글자 하나의 소리 색 (한글은 모음, 영어는 모음 글자, 그 밖은 "아") */
function colorOf(ch: string, prev: number): number {
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code <= 11171) return VOWEL_COLOR[Math.floor((code % 588) / 28)] ?? 1500;
  return LATIN_COLOR[ch.toLowerCase()] ?? prev;
}

export type TalkMood = 'calm' | 'excited' | 'sad';

/**
 * 기니피그 말소리 — 사람 목소리 대신, 글자마다 아주 짧고 높은 "뀨"를 모음 색깔대로 이어 붙인다 (동물의 숲처럼).
 * 한 음절은 살짝 올라가며 끝나고(뀨!), 묻는 말은 끝을 올리고, 외치는 말은 높게, 슬픈 말은 내려간다.
 * pitch: 친구마다 목소리 높이 (1 = 보통). 걸리는 시간(ms)을 돌려준다.
 */
export function squeakTalk(text: string, pitch = 1, mood: TalkMood = 'calm'): number {
  const vol = volume('squeak');
  const c = audio();
  if (!c || vol <= 0.001) return 0;
  if (c.state !== 'running') {
    // 한 번이라도 누른 뒤면 (데스크톱 등) 여기서 깨어난다 — 이번 줄은 조용히 넘어간다
    void c.resume().catch(() => undefined);
    return 0;
  }
  const chars = [...text].filter((ch) => /[\p{L}\p{N}\s]/u.test(ch)).slice(0, 40);
  const letters = chars.filter((ch) => !/\s/.test(ch));
  if (!letters.length) return 0;
  const out = c.createGain();
  out.gain.value = vol;
  out.connect(c.destination);
  const ask = /[?？]\s*$/.test(text);
  const shout = /!\s*$/.test(text) || mood === 'excited';
  const sad = mood === 'sad';
  // 사람 말보다 훨씬 높은 아기 기니피그 목소리 (보통 2kHz 안팎)
  const base = 1650 * pitch * (shout ? 1.1 : sad ? 0.9 : 1);
  const step = shout ? 0.05 : sad ? 0.075 : 0.058;
  let t = c.currentTime + 0.02;
  let color = 1500;
  let said = 0;
  const total = Math.min(letters.length, 26);
  for (const ch of chars) {
    if (said >= total) break;
    if (/\s/.test(ch)) {
      t += 0.04;
      continue;
    }
    color = colorOf(ch, color);
    const last = said === total - 1;
    // 통통 튀는 억양: 글자마다 위아래로 살짝 오르내리고, 문장은 거의 내려가지 않는다 (슬플 때만 처진다)
    const bounce = 1 + 0.08 * Math.sin(said * 1.9 + 0.6);
    const drift = 1 - (said / Math.max(1, total)) * (sad ? 0.22 : 0.03);
    const f = base * drift * bounce * (0.95 + Math.random() * 0.1);
    const d = step * (0.85 + Math.random() * 0.3) * (last ? 1.7 : 1);
    // 끝은 귀엽게 올려 "뀨?" — 묻는 말은 더 올리고, 슬픈 말만 내린다
    const end = last ? (ask ? 1.55 : sad ? 0.75 : 1.28) : 1.18;
    squeakSyllable(c, out, t, f, f * end, d, color * 1.3);
    t += d + 0.016;
    said++;
  }
  // 외치는 말 끝에는 "위익!" 하고 한 번 더
  if (shout && !sad) squeal(c, out, t + 0.02, [[0, base * 0.9], [0.1, base * 2], [0.18, base * 1.7]], 0.2, 0.08, 24, 70);
  return Math.round((t - c.currentTime) * 1000) + (shout ? 220 : 0);
}

/** 짧은 뀨 하나: 아래에서 톡 튀어 올라 미끄러지는 맑은 휘파람(사인파)에, 모음 색을 낸 세모파를 살짝 섞는다 */
function squeakSyllable(c: AudioContext, out: AudioNode, t: number, f0: number, f1: number, dur: number, color: number): void {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
  g.gain.setValueAtTime(0.12, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 7000;
  g.connect(lp).connect(out);
  // 아주 빠르고 얕은 떨림 — 작은 동물 소리처럼
  const lfo = c.createOscillator();
  lfo.frequency.value = 34;
  const lg = c.createGain();
  lg.gain.value = f0 * 0.012;
  lfo.connect(lg);
  for (const [type, level, filtered] of [
    ['sine', 0.8, false],
    ['triangle', 0.45, true],
  ] as const) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0 * 0.8, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.05, t + dur * 0.28);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    lg.connect(o.frequency);
    const lv = c.createGain();
    lv.gain.value = level;
    if (filtered) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = color;
      bp.Q.value = 1.6;
      o.connect(bp).connect(lv);
    } else o.connect(lv);
    lv.connect(g);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  lfo.start(t);
  lfo.stop(t + dur + 0.02);
}

export function resetSfxThrottle(): void {
  lastAt = {};
}
