/**
 * 온라인 방 채팅·음성.
 *  · 글·빠른 말: 방의 암호화 실시간 채널('chat')로 보낸다. 받은 쪽은 자리 번호로 누가 보냈는지 안다.
 *  · 음성: 브라우저 WebRTC로 기기끼리 바로 잇는다 (소리는 중계 서버를 거치지 않음, 기본 암호화).
 *    연결 신호(SDP)는 같은 암호화 채널('vc')로 주고받고, 자리 번호가 작은 쪽이 먼저 건다.
 *    STUN은 공개 서버를 쓰고, 모바일 데이터처럼 바로 이어지지 않는 망을 위한 TURN 중계는
 *    .env에 VITE_TURN_URLS·VITE_TURN_USER·VITE_TURN_PASS를 적거나, 임시 비밀번호를 내주는 주소를
 *    VITE_TURN_API로 적으면 (예: Cloudflare TURN 키로 발급하는 작은 Worker) 음성을 켤 때 받아 쓴다.
 */
import { create } from 'zustand';
import { bridge, onRealtime } from './bridge';
import { useOnline } from './online';
import { sfx } from '../audio/sfx';
import type { CharacterId } from '../characters/roster';

export const QUICK = ['wheek', 'now', 'wait', 'button', 'go', 'nice', 'thanks', 'lol'] as const;
export type Quick = (typeof QUICK)[number];
export const MAX_CHAT = 80;

export interface ChatLine {
  readonly id: number;
  readonly seat: number;
  readonly name: string;
  readonly character: CharacterId | null;
  readonly text?: string;
  readonly quick?: Quick;
  readonly me: boolean;
  readonly at: number;
}

export type VoiceError = 'denied' | 'unsupported' | 'failed';
export type Link = 'wait' | 'on' | 'fail';

interface CommsStore {
  lines: readonly ChatLine[];
  unread: number;
  open: boolean;
  voice: 'off' | 'starting' | 'on';
  voiceError: VoiceError | null;
  muted: boolean;
  /** 자리별 음성 연결 상태 */
  links: Readonly<Record<number, Link>>;
  /** 자리별로 지금 말하는 중 (내 자리 포함) */
  talking: Readonly<Record<number, boolean>>;
  setOpen: (open: boolean) => void;
  /** 글 보내기 — 너무 빠르거나 비었으면 false */
  say: (text: string) => boolean;
  quick: (q: Quick) => void;
  startVoice: () => Promise<void>;
  stopVoice: () => void;
  toggleMute: () => void;
}

// ─────────── 방 정보 ───────────

function mySeat(): number {
  const { table, myPeer } = useOnline.getState();
  return table && myPeer ? table.seats.findIndex((s) => s.kind === 'human' && s.peer === myPeer) : -1;
}

function seatName(seat: number): { name: string; character: CharacterId | null } {
  const s = useOnline.getState().table?.seats[seat];
  return { name: s?.name ?? '?', character: s?.character ?? null };
}

/** 받은 글 다듬기: 제어 문자 빼고 길이 제한 */
export function cleanChat(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHAT);
}

let lineId = 0;
let lastSent = 0;

// ─────────── 음성 (WebRTC) ───────────

const ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];
const turnUrls = String(import.meta.env.VITE_TURN_URLS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
if (turnUrls.length) ICE.push({ urls: turnUrls, username: String(import.meta.env.VITE_TURN_USER ?? ''), credential: String(import.meta.env.VITE_TURN_PASS ?? '') });

/** 음성을 켤 때 한 번: TURN 임시 비밀번호 받아 오기 ({iceServers: {...} 또는 [...]}) — 3초 안에 안 오면 없이 간다 */
async function turnFromApi(): Promise<void> {
  const url = String(import.meta.env.VITE_TURN_API ?? '');
  if (!url || ICE.length > 1) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(timer);
    const j = (await res.json()) as { iceServers?: RTCIceServer | RTCIceServer[] };
    const list = Array.isArray(j.iceServers) ? j.iceServers : j.iceServers ? [j.iceServers] : [];
    ICE.push(...list.filter((x) => x && (typeof x.urls === 'string' || Array.isArray(x.urls))));
  } catch {
    /* TURN 없이도 같은 와이파이·대부분의 집 인터넷은 이어진다 */
  }
}

const rtc: {
  stream: MediaStream | null;
  pcs: Map<number, RTCPeerConnection>;
  audios: Map<number, HTMLAudioElement>;
  ctx: AudioContext | null;
  meters: Map<number, AnalyserNode>;
  tick: ReturnType<typeof setInterval> | null;
  beat: ReturnType<typeof setInterval> | null;
} = { stream: null, pcs: new Map(), audios: new Map(), ctx: null, meters: new Map(), tick: null, beat: null };

const vc = (data: Record<string, unknown>): void => bridge.emit?.('vc', data);

/** ICE 후보를 다 모을 때까지 (최대 2.5초) 기다린다 — 신호를 한 번에 보내려고 */
function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((done) => {
    const check = (): void => {
      if (pc.iceGatheringState !== 'complete') return;
      pc.removeEventListener('icegatheringstatechange', check);
      done();
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(done, 2500);
  });
}

function meter(seat: number, stream: MediaStream): void {
  try {
    const ctx = rtc.ctx;
    if (!ctx) return;
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    rtc.meters.set(seat, an);
  } catch {
    /* 말하는 표시는 덤 */
  }
}

function closeLink(seat: number): void {
  rtc.pcs.get(seat)?.close();
  rtc.pcs.delete(seat);
  const a = rtc.audios.get(seat);
  if (a) {
    a.srcObject = null;
    a.remove();
  }
  rtc.audios.delete(seat);
  rtc.meters.delete(seat);
  const { links, talking } = useComms.getState();
  if (seat in links || talking[seat]) {
    const nl = { ...links };
    delete nl[seat];
    useComms.setState({ links: nl, talking: { ...talking, [seat]: false } });
  }
}

function setLink(seat: number, l: Link): void {
  useComms.setState((s) => ({ links: { ...s.links, [seat]: l } }));
}

function newPeer(seat: number): RTCPeerConnection {
  closeLink(seat);
  const pc = new RTCPeerConnection({ iceServers: ICE });
  rtc.pcs.set(seat, pc);
  rtc.stream?.getTracks().forEach((t) => pc.addTrack(t, rtc.stream as MediaStream));
  pc.ontrack = (e) => {
    let a = rtc.audios.get(seat);
    if (!a) {
      a = document.createElement('audio');
      a.autoplay = true;
      a.setAttribute('playsinline', '');
      a.hidden = true;
      document.body.appendChild(a);
      rtc.audios.set(seat, a);
    }
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    a.srcObject = stream;
    void a.play().catch(() => undefined);
    if (!rtc.meters.has(seat)) meter(seat, stream);
  };
  pc.onconnectionstatechange = () => {
    if (rtc.pcs.get(seat) !== pc) return;
    if (pc.connectionState === 'connected') setLink(seat, 'on');
    else if (pc.connectionState === 'failed') {
      setLink(seat, 'fail');
      pc.close();
    }
  };
  setLink(seat, 'wait');
  return pc;
}

async function call(seat: number): Promise<void> {
  const pc = newPeer(seat);
  try {
    await pc.setLocalDescription(await pc.createOffer());
    await gathered(pc);
    if (rtc.pcs.get(seat) === pc && pc.localDescription) vc({ t: 'sdp', to: seat, d: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  } catch {
    setLink(seat, 'fail');
  }
}

async function answer(seat: number, offer: RTCSessionDescriptionInit): Promise<void> {
  const pc = newPeer(seat);
  try {
    await pc.setRemoteDescription(offer);
    await pc.setLocalDescription(await pc.createAnswer());
    await gathered(pc);
    if (rtc.pcs.get(seat) === pc && pc.localDescription) vc({ t: 'sdp', to: seat, d: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
  } catch {
    setLink(seat, 'fail');
  }
}

/** 연결이 없거나 끊긴 자리 */
const needsLink = (seat: number): boolean => {
  const pc = rtc.pcs.get(seat);
  return !pc || pc.connectionState === 'failed' || pc.connectionState === 'closed';
};

function onVoice(seat: number, data: unknown): void {
  const d = data as { t?: unknown; to?: unknown; d?: { type?: unknown; sdp?: unknown } } | null;
  const me = mySeat();
  if (!d || me < 0 || seat === me || useComms.getState().voice !== 'on') {
    if (d?.t === 'off') closeLink(seat);
    return;
  }
  if (typeof d.to === 'number' && d.to !== me) return;
  if (d.t === 'off') closeLink(seat);
  else if (d.t === 'on') {
    if (!needsLink(seat)) return;
    // 번호가 작은 쪽이 건다. 큰 쪽은 "나도 켰어"라고만 알려 준다 (이 답에는 다시 답하지 않음)
    if (me < seat) void call(seat);
    else if (typeof d.to !== 'number') vc({ t: 'on', to: seat });
  } else if (d.t === 'sdp' && d.d && typeof d.d.sdp === 'string' && d.d.sdp.length < 20_000) {
    if (d.d.type === 'offer') void answer(seat, { type: 'offer', sdp: d.d.sdp });
    else if (d.d.type === 'answer') {
      const pc = rtc.pcs.get(seat);
      if (pc && pc.signalingState === 'have-local-offer') pc.setRemoteDescription({ type: 'answer', sdp: d.d.sdp }).catch(() => setLink(seat, 'fail'));
    }
  }
}

/** 말하는지 보기 (0.15초마다, 잠깐 끊겨도 0.45초는 켜 둠) */
const hold = new Map<number, number>();
const buf = new Uint8Array(512);
function listen(): void {
  const now = performance.now();
  const me = mySeat();
  const next: Record<number, boolean> = {};
  rtc.meters.forEach((an, seat) => {
    an.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < an.fftSize && i < buf.length; i++) {
      const v = ((buf[i] as number) - 128) / 128;
      sum += v * v;
    }
    const loud = Math.sqrt(sum / Math.min(an.fftSize, buf.length)) > 0.035;
    if (loud) hold.set(seat, now);
    const on = now - (hold.get(seat) ?? -1e9) < 450;
    next[seat === -1 ? me : seat] = on && !(seat === -1 && useComms.getState().muted);
  });
  const cur = useComms.getState().talking;
  if (Object.keys(next).some((k) => !!cur[Number(k)] !== next[Number(k)])) useComms.setState({ talking: { ...cur, ...next } });
}

// ─────────── 저장소 ───────────

export const useComms = create<CommsStore>((set, get) => {
  const push = (line: Omit<ChatLine, 'id' | 'at'>): void => {
    const l: ChatLine = { ...line, id: ++lineId, at: Date.now() };
    set((s) => ({ lines: [...s.lines.slice(-59), l], unread: s.open || l.me ? s.unread : s.unread + 1 }));
  };

  onRealtime('chat', (seat, data) => {
    const d = data as { t?: unknown; q?: unknown } | null;
    if (!d) return;
    const who = seatName(seat);
    const quick = QUICK.find((q) => q === d.q);
    if (quick) {
      push({ seat, ...who, quick, me: false });
      sfx(quick === 'wheek' ? 'wheek' : 'pop', { pitch: 1.2 });
      return;
    }
    const text = cleanChat(d.t);
    if (!text) return;
    push({ seat, ...who, text, me: false });
    sfx('pop', { pitch: 1.4 });
  });
  onRealtime('vc', onVoice);

  // 방을 나가거나 다른 방이면 비운다
  let room = useOnline.getState().code;
  useOnline.subscribe((s) => {
    const inRoom = s.status === 'lobby' || s.status === 'playing';
    if (s.code === room && inRoom) return;
    if (s.code !== room || !inRoom) {
      if (get().voice !== 'off') get().stopVoice();
      if (s.code !== room) set({ lines: [], unread: 0, open: false });
      room = s.code;
    }
  });

  return {
    lines: [],
    unread: 0,
    open: false,
    voice: 'off',
    voiceError: null,
    muted: false,
    links: {},
    talking: {},

    setOpen: (open) => set(open ? { open, unread: 0 } : { open }),

    say: (raw) => {
      const text = cleanChat(raw);
      const now = Date.now();
      const me = mySeat();
      if (!text || me < 0 || !bridge.emit || now - lastSent < 600) return false;
      lastSent = now;
      bridge.emit('chat', { t: text });
      push({ seat: me, ...seatName(me), text, me: true });
      return true;
    },

    quick: (q) => {
      const now = Date.now();
      const me = mySeat();
      if (me < 0 || !bridge.emit || now - lastSent < 600) return;
      lastSent = now;
      bridge.emit('chat', { q });
      push({ seat: me, ...seatName(me), quick: q, me: true });
      if (q === 'wheek') sfx('wheek', { pitch: 1.2 });
    },

    startVoice: async () => {
      if (get().voice !== 'off') return;
      if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
        set({ voiceError: 'unsupported' });
        return;
      }
      set({ voice: 'starting', voiceError: null });
      try {
        rtc.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      } catch (e) {
        const name = (e as { name?: string }).name;
        set({ voice: 'off', voiceError: name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'failed' });
        return;
      }
      try {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        rtc.ctx = AC ? new AC() : null;
        void rtc.ctx?.resume();
      } catch {
        rtc.ctx = null;
      }
      await turnFromApi();
      if (!rtc.stream) return;
      meter(-1, rtc.stream);
      rtc.stream.getAudioTracks().forEach((t) => (t.enabled = !get().muted));
      set({ voice: 'on' });
      vc({ t: 'on' });
      rtc.tick = setInterval(listen, 150);
      // 늦게 들어온 친구·끊긴 연결을 위해 가끔 다시 알린다
      rtc.beat = setInterval(() => vc({ t: 'on' }), 6000);
    },

    stopVoice: () => {
      if (get().voice === 'off') return;
      vc({ t: 'off' });
      [...rtc.pcs.keys()].forEach(closeLink);
      rtc.stream?.getTracks().forEach((t) => t.stop());
      rtc.stream = null;
      rtc.meters.clear();
      void rtc.ctx?.close().catch(() => undefined);
      rtc.ctx = null;
      if (rtc.tick) clearInterval(rtc.tick);
      if (rtc.beat) clearInterval(rtc.beat);
      rtc.tick = rtc.beat = null;
      set({ voice: 'off', links: {}, talking: {} });
    },

    toggleMute: () => {
      const muted = !get().muted;
      rtc.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
      set({ muted });
    },
  };
});
