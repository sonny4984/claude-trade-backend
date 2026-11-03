/**
 * AI 연결 상태 — claude.ai 아티팩트의 Claude, 공개 사이트에서 내가 넣은 Gemini 키.
 * 키는 이 기기(localStorage)에만 둔다.
 */
import { create } from 'zustand';
import { claudeSample } from './claude';
import { GeminiFail, connectGemini, loadGemini, saveGemini, takeKeyFromUrl } from './gemini';

interface AiStore {
  claudeOk: boolean;
  geminiModel: string | null;
  geminiState: 'idle' | 'checking' | GeminiFail['code'];
  connectGemini(key: string): Promise<boolean>;
  forgetGemini(): void;
  /** Claude를 부를 수 있는지 다시 확인 */
  probe(): void;
}

export const useAi = create<AiStore>((set) => ({
  claudeOk: false,
  geminiModel: loadGemini()?.model ?? null,
  geminiState: 'idle',

  async connectGemini(key) {
    const k = key.trim();
    if (!k) return false;
    set({ geminiState: 'checking' });
    try {
      const { model, models } = await connectGemini(k);
      saveGemini({ key: k, model, models });
      set({ geminiModel: model, geminiState: 'idle' });
      return true;
    } catch (e) {
      set({ geminiState: e instanceof GeminiFail ? e.code : 'net' });
      return false;
    }
  },

  forgetGemini() {
    saveGemini(null);
    set({ geminiModel: null, geminiState: 'idle' });
  },

  probe() {
    void claudeSample().then((s) => set({ claudeOk: !!s }));
  },
}));

/** 링크(#gemini=키)로 열었으면 키를 이 기기에 넣고 연결해 본다 — 결과를 돌려준다 (없으면 null) */
export async function claimGeminiLink(): Promise<boolean | null> {
  const key = takeKeyFromUrl();
  return key ? useAi.getState().connectGemini(key) : null;
}
