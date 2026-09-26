import { useEffect, useLayoutEffect } from 'react';
import { useGame, visibleRack } from '../../store/game';
import { Hud } from './Hud';
import { Stage } from './Stage';
import { TableArea } from './Table';
import { Staging } from './Staging';
import { StatusLine } from './StatusLine';
import { Rack } from './Rack';
import { ActionBar } from './ActionBar';
import { DragLayer } from './DragLayer';
import { Curtain, ConfirmDraw, GameOver, HintPreview, LessonBanner, LessonDone, MenuSheet } from './Overlays';
import * as flip from '../flip';
import { cancelDrag, setErrorText } from '../dnd';
import { useT } from '../../i18n';

export function GameScreen() {
  const t = useT();
  const layoutTick = useGame((s) => s.layoutTick);
  const session = useGame((s) => s.session);

  useEffect(() => setErrorText((code) => t(`err.${code}`)), [t]);

  // 상태가 바뀐 직후, 새 위치로 그려진 타일을 이전 위치에서 미끄러뜨린다
  useLayoutEffect(() => {
    flip.play({ duration: 260 });
  }, [layoutTick]);

  // 차례 시간
  useEffect(() => {
    const id = setInterval(() => useGame.getState().tick(), 200);
    return () => clearInterval(id);
  }, []);

  // 키보드 (데스크톱)
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const st = useGame.getState();
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (st.overlay || st.curtain) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') {
        cancelDrag();
        st.clearSelection();
        return;
      }
      if (k === 'u' && !e.shiftKey) st.act({ type: 'undo' });
      else if ((k === 'u' && e.shiftKey) || k === 'y') st.act({ type: 'redo' });
      else if (k === 'r') st.act({ type: 'reset' });
      else if (k === 'd') st.draw();
      else if (k === 'h') st.requestHint();
      else if (k === 'n' && st.selection.length) st.moveSelectionTo({ kind: 'new' });
      else if (k === 'm') st.openMenu();
      else if (k === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        st.commit();
      } else if (/^[1-9]$/.test(k) && st.session) {
        const rack = visibleRack(st.session);
        const id = rack[Number(k) - 1];
        if (id !== undefined) st.select(id);
      } else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!session) return null;
  return (
    <div className="game" data-mode={session.mode}>
      <Hud />
      <Stage />
      <LessonBanner />
      <TableArea />
      <Staging />
      <StatusLine />
      <Rack />
      <ActionBar />
      <DragLayer />
      <Curtain />
      <MenuSheet />
      <ConfirmDraw />
      <HintPreview />
      <GameOver />
      <LessonDone />
    </div>
  );
}
