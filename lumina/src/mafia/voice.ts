/**
 * 대사 읽어 주기(기기에 있는 음성 — 무료, 인터넷 없이도)와 말로 입력하기(음성 인식이 되는 브라우저만).
 */
interface Recognition {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

let voices: SpeechSynthesisVoice[] = [];
function loadVoices(): void {
  try {
    voices = speechSynthesis.getVoices();
  } catch {
    voices = [];
  }
}
if (canSpeak()) {
  loadVoices();
  speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
}

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const list = voices.filter((v) => v.lang.toLowerCase().startsWith(lang));
  return list.find((v) => v.localService) ?? list[0];
}

/** iOS는 사용자가 누른 그 순간에 한 번 말해 둬야 나중에도 소리가 난다 */
export function unlockSpeech(): void {
  if (!canSpeak()) return;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    /* 음성이 막힌 기기 */
  }
}

/** 다 읽으면 끝난다 (끝 신호가 안 오는 기기를 위해 글 길이만큼 기다리면 그냥 넘어간다) */
export function speak(text: string, o: { lang: string; pitch: number; rate: number }): Promise<void> {
  if (!canSpeak()) return Promise.resolve();
  return new Promise((done) => {
    let over = false;
    const finish = (): void => {
      if (over) return;
      over = true;
      clearTimeout(timer);
      done();
    };
    const timer = setTimeout(finish, 1500 + text.length * 120);
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = voiceFor(o.lang);
      if (v) u.voice = v;
      u.lang = o.lang === 'ko' ? 'ko-KR' : 'en-US';
      u.pitch = o.pitch;
      u.rate = o.rate;
      u.onend = finish;
      u.onerror = finish;
      speechSynthesis.speak(u);
    } catch {
      finish();
    }
  });
}

export function hush(): void {
  if (!canSpeak()) return;
  try {
    speechSynthesis.cancel();
  } catch {
    /* 무시 */
  }
}

function recognizer(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
export const canListen = (): boolean => !!recognizer();

/** 한 번 듣고 받아 적은 글을 돌려준다 (못 알아들으면 빈 글 — 보내기 전에 사람이 확인한다) */
export function listen(lang: string): { done: Promise<string>; stop(): void } {
  const R = recognizer();
  if (!R) return { done: Promise.resolve(''), stop: () => undefined };
  const rec = new R();
  rec.lang = lang === 'ko' ? 'ko-KR' : 'en-US';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  const done = new Promise<string>((resolve) => {
    let text = '';
    rec.onresult = (e) => {
      text = Array.from(e.results)
        .map((r) => r[0]?.transcript ?? '')
        .join(' ')
        .trim();
    };
    rec.onerror = () => resolve(text);
    rec.onend = () => resolve(text);
  });
  try {
    rec.start();
  } catch {
    /* 이미 듣는 중 */
  }
  return {
    done,
    stop: () => {
      try {
        rec.stop();
      } catch {
        /* 무시 */
      }
    },
  };
}
