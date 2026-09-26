/**
 * 테이블에 앉는 기니피그 친구들.
 * 휘기·기니니·뽀니는 사용자가 좋아하는 kkuichyu 작가님의 캐릭터를 3D로 옮긴 개인 감상용 해석이고,
 * 모카는 4인 게임을 위한 같은 화풍의 오리지널 캐릭터다. (공개 배포·판매 시 원작자 허락 필요)
 */
export type CharacterId = 'hwigi' | 'ginini' | 'pponi' | 'moka';

export interface CharacterSpec {
  readonly id: CharacterId;
  /** 털 모양: 복슬(갈기) / 매끈 */
  readonly fur: 'fluffy' | 'smooth';
  /** 눈썹 모양 */
  readonly brows: 'bushy' | 'serious' | 'none';
  /** 회색 코(주둥이) 패치 */
  readonly muzzle: boolean;
  /** 갈색 무늬 + 동그란 안경 (모카) */
  readonly patches: boolean;
  readonly glasses: boolean;
  /** 나비넥타이 색 (원작은 모두 검정) */
  readonly bow: string;
  /** 2D 칩·결과 카드용 강조색 */
  readonly accent: string;
}

export const CHARACTERS: Readonly<Record<CharacterId, CharacterSpec>> = {
  hwigi: { id: 'hwigi', fur: 'fluffy', brows: 'bushy', muzzle: false, patches: false, glasses: false, bow: '#141414', accent: '#9CC8EE' },
  ginini: { id: 'ginini', fur: 'smooth', brows: 'serious', muzzle: false, patches: false, glasses: false, bow: '#141414', accent: '#F2C27A' },
  pponi: { id: 'pponi', fur: 'smooth', brows: 'none', muzzle: true, patches: false, glasses: false, bow: '#141414', accent: '#E9A0B4' },
  moka: { id: 'moka', fur: 'smooth', brows: 'none', muzzle: false, patches: true, glasses: true, bow: '#7A4A2A', accent: '#C8A27A' },
};

export const CHARACTER_ORDER: readonly CharacterId[] = ['hwigi', 'ginini', 'pponi', 'moka'];

export function isCharacterId(x: unknown): x is CharacterId {
  return typeof x === 'string' && (CHARACTER_ORDER as readonly string[]).includes(x);
}
