import { useCallback } from 'react';
import { ko, type Dict } from './ko';
import { en } from './en';
import { useSettings } from '../store/settings';
import { tile } from '../game/tiles';
import type { SetIssue } from '../game/sets';
import type { CommitIssue } from '../game/turn';
import type { Color, TileId } from '../game/types';

export type Lang = 'ko' | 'en';
const DICTS: Record<Lang, Dict> = { ko, en };
export type Params = Record<string, string | number>;

function lookup(dict: unknown, path: string): unknown {
  let cur: unknown = dict;
  for (const part of path.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

export function translate(lang: Lang, path: string, params?: Params): string {
  let s = lookup(DICTS[lang], path);
  if (typeof s !== 'string') s = lookup(ko, path);
  if (typeof s !== 'string') return path;
  return params ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? '')) : s;
}

export function translateList(lang: Lang, path: string): readonly string[] {
  const v = lookup(DICTS[lang], path) ?? lookup(ko, path);
  return Array.isArray(v) ? (v as string[]) : [];
}

export type T = (path: string, params?: Params) => string;

export function useT(): T {
  const lang = useSettings((s) => s.lang);
  return useCallback((path: string, params?: Params) => translate(lang, path, params), [lang]);
}

export function useLang(): Lang {
  return useSettings((s) => s.lang);
}

/** 숫자를 우리말로 읽었을 때 받침이 없으면 '가', 있으면 '이' (2·4·5·9·12 → 가) */
export function josaNum(n: number): string {
  return [2, 4, 5, 9, 12].includes(n) ? '가' : '이';
}

/** 이름 뒤 조사: 마지막 글자 받침 유무 */
export function josa(name: string, withB: string, withoutB: string): string {
  const ch = name.charCodeAt(name.length - 1);
  if (ch >= 0xac00 && ch <= 0xd7a3) return (ch - 0xac00) % 28 ? withB : withoutB;
  return withB;
}

export function colorName(lang: Lang, c: Color): string {
  return translate(lang, `color.${c}`);
}

export function tileLabel(lang: Lang, id: TileId): string {
  const t = tile(id);
  if (t.kind === 'joker') return translate(lang, 'tile.joker');
  return `${colorName(lang, t.color)} ${t.value}`;
}

export function setIssueText(lang: Lang, issue: SetIssue): string {
  switch (issue.code) {
    case 'dup-color':
    case 'dup-value':
      return translate(lang, `set.${issue.code}`, {
        color: colorName(lang, issue.color),
        value: issue.value,
        josa: lang === 'ko' ? josaNum(issue.value) : '',
      });
    case 'gap': {
      const m = issue.missing[0] ?? 0;
      return translate(lang, 'set.gap', {
        color: colorName(lang, issue.color),
        missing: issue.missing.join(lang === 'ko' ? '·' : ', '),
        josa: lang === 'ko' ? josaNum(issue.missing[issue.missing.length - 1] ?? m) : '',
      });
    }
    default:
      return translate(lang, `set.${issue.code}`);
  }
}

export function commitIssueText(lang: Lang, issue: CommitIssue): string {
  switch (issue.code) {
    case 'invalid-set':
      return setIssueText(lang, issue.issue);
    case 'staging':
      return translate(lang, 'issue.staging', { count: issue.count });
    case 'meld-too-low':
      return translate(lang, 'issue.meld-too-low', { need: issue.need, points: issue.points });
    default:
      return translate(lang, `issue.${issue.code}`);
  }
}

/** "휘기가 / 뽀니가 / 모카가" — 이름 + 이/가 */
export function subj(lang: Lang, name: string): string {
  if (lang !== 'ko') return name;
  // 이름이 "나"·"저"면 주격은 "나가"·"저가"가 아니라 "내가"·"제가"
  if (name === '나') return '내가';
  if (name === '저') return '제가';
  return name + josa(name, '이', '가');
}
