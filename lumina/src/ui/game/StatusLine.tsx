import { useAssist, useGame, turnSummary, currentSeatIsHuman } from '../../store/game';
import type { CommitIssue } from '../../game';
import { commitIssueText, subj, useLang, useT } from '../../i18n';

export function StatusLine() {
  const t = useT();
  const lang = useLang();
  const session = useGame((s) => s.session);
  const curtain = useGame((s) => s.curtain);
  const selection = useGame((s) => s.selection);
  const ai = useGame((s) => s.ai);
  const lastEvent = useGame((s) => s.lastEventText);
  const waiting = useGame((s) => s.waiting);
  const assist = useAssist();
  // 스스로 모드: 세트가 왜 틀렸는지(빠진 타일 등)는 말하지 않는다
  const issueText = (issue: CommitIssue): string => (assist === 'self' && issue.code === 'invalid-set' ? t('status.someWrong') : commitIssueText(lang, issue));
  if (!session || curtain) return <p className="status" aria-live="polite" />;
  const g = session.match.game;
  if (g.phase !== 'playing') return <p className="status" aria-live="polite" />;
  let text = '';
  let tone: 'dim' | 'good' | 'warn' = 'dim';
  let meter: { points: number; need: number } | null = null;
  if (session.mode === 'lesson' && session.lesson !== null) {
    // 레슨 안내는 무대 위 말풍선이 맡는다
  }
  if (waiting) {
    text = t('online.sending');
  } else if (ai) {
    // AI가 생각하는 동안은 그 AI 이름, 타일이 날아가는 동안은 방금 둔 수
    const name = session.match.seats[ai.seat]?.name ?? '';
    text = ai.phase === 'moving' && lastEvent ? lastEvent : t('status.aiThinking', { subj: subj(lang, name) });
  } else if (!currentSeatIsHuman(session)) {
    const name = session.match.seats[g.current]?.name ?? '';
    text = session.online ? t('online.turnOf', { subj: subj(lang, name) }) : (lastEvent ?? t('status.aiThinking', { subj: subj(lang, name) }));
  } else {
    const { changed, check, meld } = turnSummary(g);
    if (selection.length) {
      text = t('status.select', { n: selection.length });
    } else if (g.turn.meldedNow && !changed) {
      text = t('status.continueAfterMeld');
      tone = 'good';
    } else if (meld) {
      meter = meld;
      text = check.ok ? t('status.meldReady', { points: meld.points }) : changed && check.issues[0] && check.issues[0].code !== 'meld-too-low' ? issueText(check.issues[0]) : t('status.meld', { need: meld.need });
      tone = check.ok ? 'good' : changed ? 'warn' : 'dim';
    } else if (changed) {
      if (check.ok) {
        text = t('status.ready');
        tone = 'good';
      } else {
        text = check.issues[0] ? issueText(check.issues[0]) : t('status.incomplete');
        tone = 'warn';
      }
    } else {
      text = g.pool.length === 0 ? t('status.poolEmpty') : lastEvent ?? t('status.idle');
    }
  }
  return (
    <p className="status" data-tone={tone} aria-live="polite">
      {meter && (
        <span className="meld-meter" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (meter.points / meter.need) * 100)}%` }} />
          <b>
            {meter.points}/{meter.need}
          </b>
        </span>
      )}
      <span className="status-text">{text}</span>
    </p>
  );
}
