import { memo } from 'react';
import { codaColor, codaValue, type CodaGuess, type CodaTileId } from '../engine';

export interface CodaTileProps {
  readonly id: CodaTileId;
  /** 보는 사람에게 숫자가 보이는가 (내 타일이거나 공개된 타일) */
  readonly faceUp: boolean;
  /** 모두에게 공개됐는가 (앞으로 쓰러진 모양) */
  readonly revealed: boolean;
  /** 내 줄의 숨은 타일 (나만 봄) */
  readonly secret?: boolean;
  readonly selected?: boolean;
  readonly pending?: boolean;
  readonly flash?: 'hit' | 'open' | null;
  readonly hinted?: boolean;
  readonly misses?: readonly CodaGuess[];
  /** 타일 위에 띄우는 말 ("7?" 같은 추리 값) */
  readonly callout?: string | null;
  readonly label: string;
  readonly onClick?: () => void;
  readonly size?: 'sm' | 'md' | 'lg';
}

/** 다빈치 코드의 흑·백 타일 — 서 있으면 숨김, 앞으로 쓰러지면 공개 */
export const CodaTile = memo(function CodaTile({ id, faceUp, revealed, secret, selected, pending, flash, hinted, misses, callout, label, onClick, size = 'md' }: CodaTileProps) {
  const color = codaColor(id);
  const value = codaValue(id);
  const face = faceUp ? (
    value === null ? (
      <span className="ctile-joker" aria-hidden="true" />
    ) : (
      <span className="ctile-num" aria-hidden="true">
        {value}
      </span>
    )
  ) : (
    <span className="ctile-mark" aria-hidden="true" />
  );
  const common = {
    className: 'ctile',
    'data-color': color,
    'data-size': size,
    'data-face': faceUp ? 'up' : 'down',
    'data-revealed': revealed || undefined,
    'data-secret': secret || undefined,
    'data-selected': selected || undefined,
    'data-pending': pending || undefined,
    'data-flash': flash ?? undefined,
    'data-hinted': hinted || undefined,
    'aria-label': label,
  } as const;
  return (
    <span className="ctile-wrap">
      {callout && (
        <span className="ctile-callout" aria-hidden="true">
          {callout}
        </span>
      )}
      {onClick ? (
        <button type="button" {...common} aria-pressed={!!selected} onClick={onClick}>
          {face}
        </button>
      ) : (
        <span {...common} role="img">
          {face}
        </span>
      )}
      {misses && misses.length > 0 && (
        <span className="ctile-misses" aria-hidden="true">
          {misses.slice(-3).map((m, i) => (
            <s key={i}>{m === 'joker' ? '−' : m}</s>
          ))}
        </span>
      )}
    </span>
  );
});
