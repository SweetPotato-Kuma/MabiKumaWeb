import { describe, expect, it } from 'vitest';
import { compactName, counterpartName, findSiblingAdditions } from './recipe-names.mjs';

const dictionary = new Map([
  [
    '경갑옷',
    new Map([
      ['콘누스 레더 아머(남성용)', {}],
      ['라이트 레더메일 (여성용)', {}],
    ]),
  ],
  ['장갑', new Map([['기아스 건틀렛(남성용)', {}]])],
  ['로브', new Map([['하늘 로브(남성용)', {}]])],
  ['날개', new Map([['하늘 로브(여성용)', {}]])],
]);

describe('이름 짝', () => {
  it('남성용과 여성용을 맞바꾼다', () => {
    expect(counterpartName('콘누스 레더 아머(남성용)')).toBe('콘누스 레더 아머(여성용)');
    expect(counterpartName('아라시 아머(자이언트 여성용)')).toBe('아라시 아머(자이언트 남성용)');
    expect(counterpartName('철괴')).toBeNull();
  });

  it('띄어쓰기와 && 표기 차이는 같은 이름으로 본다', () => {
    expect(compactName('네반&&마하 검')).toBe(compactName('네반&마하  검'));
  });
});

describe('제작법 이름 채우기', () => {
  it('짝이 사전에 있으면 그 카테고리로 넣는다', () => {
    const { additions, unresolved } = findSiblingAdditions(
      ['콘누스 레더 아머(여성용)', '라이트 레더메일(남성용)', '철괴'],
      dictionary,
    );
    expect(additions).toEqual([
      { name: '콘누스 레더 아머(여성용)', category: '경갑옷' },
      { name: '라이트 레더메일(남성용)', category: '경갑옷' },
    ]);
    expect(unresolved).toEqual(['철괴']);
  });

  it('이미 사전에 있는 이름은 건드리지 않는다', () => {
    const { additions, unresolved } = findSiblingAdditions(
      ['콘누스 레더 아머 (남성용)'],
      dictionary,
    );
    expect(additions).toEqual([]);
    expect(unresolved).toEqual([]);
  });

  it('짝의 카테고리가 하나로 정해지지 않으면 넣지 않는다', () => {
    const both = new Map([
      ['로브', new Map([['하늘 로브(남성용)', {}]])],
      ['날개', new Map([['하늘 로브(남성용)', {}]])],
    ]);
    expect(findSiblingAdditions(['하늘 로브(여성용)'], both).additions).toEqual([]);
  });

  it('일부러 뺀 이름은 되살리지 않는다', () => {
    const excluded = new Set(['장갑\u0000기아스 건틀렛(여성용)']);
    expect(findSiblingAdditions(['기아스 건틀렛(여성용)'], dictionary, excluded).additions).toEqual(
      [],
    );
  });
});
