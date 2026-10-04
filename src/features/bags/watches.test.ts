import { beforeEach, describe, expect, it } from 'vitest';
import { emptyColorChannel, emptyColorChannels } from '@/features/colorChannels';
import { BAG_NAMES } from './constants';
import { buildBagTree } from './groups';
import { defaultParts, type BagSearchConditions } from './searchParams';
import {
  addBagWatch,
  compileWatches,
  describeWatch,
  getBagWatches,
  isEmptyCondition,
  matchingWatches,
  parseWatches,
  removeBagWatch,
  resetBagWatchesForTest,
  updateBagWatch,
} from './watches';

const tree = buildBagTree([...BAG_NAMES]);

/** 파트 A 의 빨강이 200 이상. */
const reddish = (bags: string[] = []): BagSearchConditions => ({
  bags,
  parts: [
    {
      enabled: true,
      channels: { ...emptyColorChannels(), r: { ...emptyColorChannel(), min: 200 } },
    },
    ...defaultParts().slice(1),
  ],
});

describe('관심 조건 저장', () => {
  beforeEach(() => resetBagWatchesForTest());

  it('주머니도 색도 고르지 않은 조건은 저장하지 않는다', () => {
    const empty = { bags: [], parts: defaultParts() };
    expect(isEmptyCondition(empty)).toBe(true);
    expect(addBagWatch('아무거나', empty)).toEqual({ ok: false, reason: 'empty' });
  });

  it('이름을 붙여 저장하고, 같은 조건은 두 번 저장하지 않는다', () => {
    const first = addBagWatch('붉은 주머니', reddish());
    expect(first.ok).toBe(true);
    const again = addBagWatch('다른 이름', reddish());
    expect(again).toMatchObject({ ok: false, reason: 'duplicate' });
    expect(addBagWatch('  ', reddish(['튼튼한 감자 주머니']))).toEqual({
      ok: false,
      reason: 'name',
    });
    expect(getBagWatches()).toHaveLength(1);
  });

  it('이름과 조건을 고치고 지운다', () => {
    const saved = addBagWatch('붉은 주머니', reddish());
    if (!saved.ok) throw new Error('저장하지 못했습니다');
    expect(
      updateBagWatch(saved.item.id, { name: '감자', conditions: reddish(['튼튼한 감자 주머니']) }),
    ).toBe(true);
    expect(getBagWatches()[0]).toMatchObject({
      name: '감자',
      conditions: { bags: ['튼튼한 감자 주머니'] },
    });
    removeBagWatch(saved.item.id);
    expect(getBagWatches()).toEqual([]);
  });

  it('저장된 값은 검증해서 읽고, 읽을 수 없는 항목은 버린다', () => {
    const watches = parseWatches([
      {
        id: 'a',
        name: '감자',
        query: 'bag=%ED%8A%BC%ED%8A%BC%ED%95%9C+%EA%B0%90%EC%9E%90+%EC%A3%BC%EB%A8%B8%EB%8B%88',
      },
      { id: 'b', name: '빈 조건', query: '' },
      { id: '', name: '아이디 없음', query: 'a=r200-' },
      'garbage',
    ]);
    expect(watches.map((watch) => watch.name)).toEqual(['감자']);
  });
});

describe('관심 조건 맞춰 보기', () => {
  it('주머니 종류와 파트 색을 모두 만족하는 주머니만 맞는다', () => {
    const compiled = compileWatches(
      [{ id: 'w', name: '붉은 감자', conditions: reddish(['튼튼한 감자 주머니']) }],
      tree,
    );
    expect(
      matchingWatches({ name: '튼튼한 감자 주머니', colors: ['ff0000'] }, compiled),
    ).toHaveLength(1);
    expect(
      matchingWatches({ name: '튼튼한 감자 주머니', colors: ['100000'] }, compiled),
    ).toHaveLength(0);
    expect(
      matchingWatches({ name: '튼튼한 밀 주머니', colors: ['ff0000'] }, compiled),
    ).toHaveLength(0);
  });

  it('조건을 한 줄로 요약한다', () => {
    expect(describeWatch(reddish(), tree)).toMatch(/^모든 주머니, 파트 A R/);
    expect(describeWatch(reddish(['튼튼한 감자 주머니']), tree)).toMatch(/^주머니 1종/);
  });
});
