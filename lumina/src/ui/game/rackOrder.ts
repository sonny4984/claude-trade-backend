import type { TileId } from '../../game';

/** 표시 순서를 실제 랙 내용에 맞춘다 (새 타일은 뒤에) */
export function syncRackOrder(order: readonly TileId[], rack: readonly TileId[]): TileId[] {
  const inRack = new Set(rack);
  const kept = order.filter((x) => inRack.has(x));
  const seen = new Set(kept);
  return [...kept, ...rack.filter((x) => !seen.has(x))];
}
