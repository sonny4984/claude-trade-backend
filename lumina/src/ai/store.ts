/**
 * AI 연결 상태 — claude.ai 아티팩트에서 열었을 때만 Claude를 부를 수 있다 (공개 사이트에서는 없음).
 */
import { create } from 'zustand';
import { claudeSample } from './claude';
import { removeKey } from '../store/storage';

interface AiStore {
  claudeOk: boolean;
  /** Claude를 부를 수 있는지 다시 확인 */
  probe(): void;
}

export const useAi = create<AiStore>((set) => ({
  claudeOk: false,
  probe() {
    void claudeSample().then((s) => set({ claudeOk: !!s }));
  },
}));

/**
 * 예전 Gemini 연결의 흔적 지우기 — 이 기기에 저장된 Gemini 키와 주소의 #gemini=키를 없앤다.
 * (Gemini는 더 이상 쓰지 않는다)
 */
export function forgetOldGemini(): void {
  try {
    removeKey('lumina.gemini.v1');
    if (typeof location !== 'undefined' && /(?:^#|&)gemini=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search);
  } catch {
    /* 저장소·주소를 못 바꾸는 곳 */
  }
}
