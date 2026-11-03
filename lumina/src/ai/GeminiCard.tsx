/**
 * Gemini 연결 카드: 키 넣기 → 확인 → 연결됨/키 지우기 (키는 이 기기에만).
 */
import { useState } from 'react';
import { useT } from '../i18n';
import { GEMINI_KEY_URL } from './gemini';
import { useAi } from './store';

export function GeminiCard() {
  const t = useT();
  const model = useAi((s) => s.geminiModel);
  const state = useAi((s) => s.geminiState);
  const [key, setKey] = useState('');
  const store = useAi.getState();
  if (model)
    return (
      <div className="ai-gemini">
        <p className="ai-sub">{t('ai.geminiOn', { model })}</p>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => store.forgetGemini()}>
          {t('ai.geminiForget')}
        </button>
      </div>
    );
  return (
    <div className="ai-gemini">
      <p className="ai-sub">{t('ai.geminiSub')}</p>
      <form
        className="ai-input"
        onSubmit={(e) => {
          e.preventDefault();
          void store.connectGemini(key).then((ok) => ok && setKey(''));
        }}
      >
        <input type="password" value={key} autoComplete="off" spellCheck={false} placeholder={t('ai.geminiKeyPh')} aria-label={t('ai.geminiKeyPh')} onChange={(e) => setKey(e.target.value)} />
        <button type="submit" className="btn btn-primary btn-sm" disabled={!key.trim() || state === 'checking'}>
          {state === 'checking' ? t('ai.geminiChecking') : t('ai.geminiConnect')}
        </button>
      </form>
      {state !== 'idle' && state !== 'checking' && <p className="ai-gemini-err">{t(`ai.geminiErr.${state}`)}</p>}
      <a className="ai-gemini-link" href={GEMINI_KEY_URL} target="_blank" rel="noopener noreferrer">
        {t('ai.geminiGet')}
      </a>
      <p className="ai-sub">{t('ai.geminiNote')}</p>
    </div>
  );
}
