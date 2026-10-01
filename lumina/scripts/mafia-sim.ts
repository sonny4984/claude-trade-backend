/**
 * 마피아 AI끼리 여러 판을 돌려 인원별 시민 승률을 본다 (균형 맞추기용).
 * npx tsx scripts/mafia-sim.ts [판 수]
 */
import { aiNight, aiVerdict, aiVote, living, newGame, plan, resolveNight, resolveVerdict, resolveVote, toVerdict } from '../src/mafia/engine';

const N = Number(process.argv[2] ?? 400);
for (const count of [5, 6, 7, 8]) {
  let town = 0;
  let days = 0;
  for (let s = 1; s <= N; s++) {
    const g = newGame({ count, me: 'hwigi', seed: s * 104729 + count, allAi: true });
    while (!g.winner && g.day < 15) {
      resolveNight(g, aiNight(g));
      if (g.winner) break;
      for (const k of ['open', 'more', 'more'] as const) plan(g, { k });
      const accused = resolveVote(
        g,
        living(g).map((p) => ({ day: g.day, by: p.id, t: aiVote(g, p.id) })),
      );
      if (accused === null) continue;
      plan(g, { k: 'defense', by: accused });
      toVerdict(g);
      resolveVerdict(
        g,
        living(g)
          .filter((p) => p.id !== accused)
          .map((p) => ({ by: p.id, yes: aiVerdict(g, p.id) })),
      );
    }
    if (g.winner === 'town') town++;
    days += g.day;
  }
  console.log(`${count}명: 시민 승률 ${Math.round((town / N) * 100)}%, 평균 ${(days / N).toFixed(1)}일`);
}
