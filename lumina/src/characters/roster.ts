/**
 * 테이블에 앉는 기니피그 친구들.
 * 휘기·기니니·뽀니는 사용자가 좋아하는 kkuichyu 작가님의 캐릭터에서 출발한 개인 감상용 해석이고(지금은 실제 품종 털옷을 입혔다),
 * 모카는 4인 게임을 위한 같은 화풍의 오리지널 캐릭터다. (공개 배포·판매 시 원작자 허락 필요)
 */
/** 두부·콩이·보리·누리는 마피아 게임 인원을 채우려고 만든 같은 화풍의 오리지널 친구들 (마피아에서만 나온다) */
export type CharacterId = 'hwigi' | 'ginini' | 'pponi' | 'moka' | 'dubu' | 'kongi' | 'bori' | 'nuri';

type V3 = readonly [number, number, number];

/** 털 무늬 한 조각 — 머리(head: 머리 가운데가 원점) 또는 몸(body) 공간의 타원체. a는 진하기 */
export interface CoatPatch {
  readonly on: 'head' | 'body';
  readonly c: V3;
  readonly r: V3;
  readonly color: string;
  readonly a?: number;
}

/**
 * 실제 기니피그 품종을 본뜬 털옷.
 * x가 +면 화면 오른쪽(캐릭터의 왼쪽), y는 위, z는 화면 쪽.
 */
export interface Coat {
  /** 아비시니안(소용돌이 털)·더치(흰 띠)·히말라얀(코·귀·발만 진함)·삼색·테디(곰돌이 털)·크레스티드(이마 흰 볏) */
  readonly breed: 'abyssinian' | 'dutch' | 'himalayan' | 'tortoiseshell' | 'teddy' | 'crested';
  readonly base: string;
  readonly patches: readonly CoatPatch[];
  /** 귀 겉 (화면 왼쪽, 오른쪽) · 귀 안 */
  readonly ears: readonly [string, string];
  readonly earIn: string;
  readonly nose: string;
  readonly paw: string;
  readonly eye: string;
  readonly whisker: string;
  /** 털 길이 (복슬이는 길게) */
  readonly fur: number;
  /** 아구티 깨알 무늬 0~1 */
  readonly ticked: number;
  /** 소용돌이 털 뭉치(아비시니안) · 곰돌이 털(테디) */
  readonly fluff: 'none' | 'rosette' | 'teddy';
}

export interface CharacterSpec {
  readonly id: CharacterId;
  /** 눈썹 모양 */
  readonly brows: 'bushy' | 'serious' | 'none';
  /** 동그란 안경 */
  readonly glasses: boolean;
  /** 나비넥타이 색 */
  readonly bow: string;
  /** 2D 칩·결과 카드용 강조색 */
  readonly accent: string;
  readonly coat: Coat;
}

const WHITE = '#fbf8f1';
const CREAM = '#f1dfbf';
const GOLD = '#e1a25a';
const GINGER = '#cf7b3b';
const CHOC = '#6c4834';
const BLACK = '#3b332f';
const AGOUTI = '#a77d52';
const LILAC = '#b7a9b0';
const PINK_SKIN = '#f1b6b0';
const NOSE = '#e48d98';
const EYE = '#251813';

/** 더치: 양 볼·귀가 색이고 가운데 흰 줄, 앞가슴은 하얀 띠 */
const dutch = (color: string): CoatPatch[] => [
  { on: 'head', c: [-0.74, 0.1, 0.12], r: [0.58, 0.98, 1.05], color },
  { on: 'head', c: [0.74, 0.1, 0.12], r: [0.58, 0.98, 1.05], color },
  { on: 'body', c: [0, 0.25, -1.05], r: [1.35, 1.25, 0.85], color },
];

export const CHARACTERS: Readonly<Record<CharacterId, CharacterSpec>> = {
  hwigi: {
    id: 'hwigi',
    brows: 'bushy',
    glasses: false,
    bow: '#4f8fdc',
    accent: '#9CC8EE',
    coat: {
      breed: 'abyssinian',
      base: WHITE,
      patches: [
        { on: 'head', c: [-0.56, 0.3, 0.16], r: [0.58, 0.62, 0.86], color: GOLD },
        { on: 'body', c: [0.6, 0.6, -0.3], r: [0.72, 0.6, 0.95], color: GOLD },
      ],
      ears: [GOLD, '#f3e4d6'],
      earIn: PINK_SKIN,
      nose: NOSE,
      paw: '#f6dcd3',
      eye: EYE,
      whisker: '#b9aca1',
      fur: 0.1,
      ticked: 0,
      fluff: 'rosette',
    },
  },
  ginini: {
    id: 'ginini',
    brows: 'serious',
    glasses: false,
    bow: '#2c3e78',
    accent: '#F2C27A',
    coat: {
      breed: 'dutch',
      base: WHITE,
      patches: dutch(GINGER),
      ears: [GINGER, GINGER],
      earIn: '#e9a49b',
      nose: NOSE,
      paw: '#f4d4cb',
      eye: EYE,
      whisker: '#b9aca1',
      fur: 0.055,
      ticked: 0,
      fluff: 'none',
    },
  },
  pponi: {
    id: 'pponi',
    brows: 'none',
    glasses: false,
    bow: '#e36b93',
    accent: '#E9A0B4',
    coat: {
      breed: 'himalayan',
      base: '#f8f2e8',
      patches: [{ on: 'head', c: [0, -0.3, 0.7], r: [0.36, 0.3, 0.36], color: CHOC }],
      ears: [CHOC, CHOC],
      earIn: '#8d675b',
      nose: '#4b3029',
      paw: CHOC,
      eye: '#4a1a22',
      whisker: '#d3c9bf',
      fur: 0.055,
      ticked: 0,
      fluff: 'none',
    },
  },
  moka: {
    id: 'moka',
    brows: 'none',
    glasses: true,
    bow: '#7A4A2A',
    accent: '#C8A27A',
    coat: {
      breed: 'tortoiseshell',
      base: WHITE,
      patches: [
        { on: 'head', c: [0.58, 0.2, 0.3], r: [0.5, 0.52, 0.72], color: CHOC },
        { on: 'head', c: [-0.56, 0.64, -0.2], r: [0.56, 0.46, 0.72], color: GINGER },
        { on: 'body', c: [-0.72, 0.55, 0.0], r: [0.62, 0.56, 0.95], color: CHOC },
        { on: 'body', c: [0.72, 0.3, -0.5], r: [0.62, 0.62, 0.85], color: GINGER },
      ],
      ears: [GINGER, CHOC],
      earIn: '#e2a097',
      nose: NOSE,
      paw: '#f4d4cb',
      eye: EYE,
      whisker: '#b9aca1',
      fur: 0.055,
      ticked: 0,
      fluff: 'none',
    },
  },
  dubu: {
    id: 'dubu',
    brows: 'none',
    glasses: false,
    bow: '#3F6FB5',
    accent: '#A9C7F0',
    coat: {
      breed: 'teddy',
      base: '#fdfaf5',
      patches: [{ on: 'head', c: [0, 0.72, -0.12], r: [0.78, 0.42, 0.85], color: CREAM, a: 0.55 }],
      ears: ['#f6e7df', '#f6e7df'],
      earIn: '#f2c0b8',
      nose: NOSE,
      paw: '#f6d9d1',
      eye: EYE,
      whisker: '#c4b8ad',
      fur: 0.11,
      ticked: 0,
      fluff: 'teddy',
    },
  },
  kongi: {
    id: 'kongi',
    brows: 'bushy',
    glasses: false,
    bow: '#2F8A57',
    accent: '#9ED8B4',
    coat: {
      breed: 'dutch',
      base: WHITE,
      patches: dutch(BLACK),
      ears: [BLACK, BLACK],
      earIn: '#77605a',
      nose: NOSE,
      paw: '#f1d2c9',
      eye: '#1d1512',
      whisker: '#b9aca1',
      fur: 0.055,
      ticked: 0,
      fluff: 'none',
    },
  },
  bori: {
    id: 'bori',
    brows: 'serious',
    glasses: false,
    bow: '#B5394A',
    accent: '#E9A39A',
    coat: {
      breed: 'abyssinian',
      base: AGOUTI,
      patches: [
        { on: 'head', c: [0, 0.22, 0.86], r: [0.19, 0.78, 0.3], color: WHITE },
        { on: 'head', c: [0, -0.33, 0.62], r: [0.42, 0.29, 0.42], color: WHITE },
        { on: 'body', c: [0, 0.38, 0.86], r: [0.46, 0.56, 0.36], color: WHITE },
      ],
      ears: ['#7f5c3c', '#7f5c3c'],
      earIn: '#d69a8e',
      nose: NOSE,
      paw: '#e9c2b4',
      eye: EYE,
      whisker: '#cdbfb2',
      fur: 0.1,
      ticked: 0.55,
      fluff: 'rosette',
    },
  },
  nuri: {
    id: 'nuri',
    brows: 'serious',
    glasses: true,
    bow: '#6A4FA3',
    accent: '#C3B0E8',
    coat: {
      breed: 'crested',
      base: LILAC,
      patches: [
        { on: 'head', c: [0, 0.62, 0.48], r: [0.26, 0.24, 0.3], color: WHITE },
        { on: 'head', c: [0, -0.31, 0.66], r: [0.4, 0.3, 0.38], color: '#dcd3d7' },
      ],
      ears: ['#9b8c94', '#9b8c94'],
      earIn: '#d7a5a3',
      nose: NOSE,
      paw: '#ecc9c3',
      eye: EYE,
      whisker: '#e2dbd6',
      fur: 0.055,
      ticked: 0,
      fluff: 'none',
    },
  },
};

export const CHARACTER_ORDER: readonly CharacterId[] = ['hwigi', 'ginini', 'pponi', 'moka'];
/** 마피아처럼 자리가 많은 게임에서 AI 자리를 채울 때 (앞의 넷 다음에 마피아 전용 친구들) */
export const ALL_CHARACTERS: readonly CharacterId[] = [...CHARACTER_ORDER, 'dubu', 'kongi', 'bori', 'nuri'];

export function isCharacterId(x: unknown): x is CharacterId {
  return typeof x === 'string' && (CHARACTER_ORDER as readonly string[]).includes(x);
}
