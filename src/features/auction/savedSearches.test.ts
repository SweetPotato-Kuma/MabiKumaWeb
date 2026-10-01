import { beforeEach, describe, expect, it } from 'vitest';
import { serializeFilter } from './filterUrl';
import { relicCondition } from './optionFilter';
import {
  addSavedSearch,
  describeSavedSearch,
  getSavedSearches,
  hasSearchCondition,
  parseSaved,
  removeSavedSearch,
  resetSavedSearchesForTest,
  SAVED_MAX,
  updateSavedSearch,
} from './savedSearches';

beforeEach(() => {
  window.localStorage.clear();
  resetSavedSearchesForTest();
});

const filterKey = serializeFilter({ conditions: [relicCondition('블래스트', 7, null)] });

describe('검색 조건', () => {
  it('검색어, 카테고리, 상세 조건 가운데 하나라도 있으면 조건이 있다', () => {
    expect(hasSearchCondition({ keyword: '소드', category: '', filterKey: '' })).toBe(true);
    expect(hasSearchCondition({ keyword: '', category: '검', filterKey: '' })).toBe(true);
    expect(hasSearchCondition({ keyword: '', category: '', filterKey })).toBe(true);
  });

  it('모두 비었으면 조건이 없다', () => {
    expect(hasSearchCondition({ keyword: '', category: '', filterKey: '' })).toBe(false);
    expect(hasSearchCondition({ keyword: '   ', category: '', filterKey: '' })).toBe(false);
  });
});

describe('즐겨찾기 저장', () => {
  it('이름, 설명과 함께 조건을 저장하고 localStorage 에 남긴다', () => {
    const result = addSavedSearch({ name: '싼 블래스트', description: '7레벨 이상', keyword: '유물', category: '유물', filterKey });

    expect(result.ok).toBe(true);
    expect(getSavedSearches()).toHaveLength(1);
    expect(getSavedSearches()[0]).toMatchObject({ name: '싼 블래스트', description: '7레벨 이상', keyword: '유물', category: '유물', filterKey });
    expect(JSON.parse(window.localStorage.getItem('mabikuma:savedSearches') ?? '[]')).toHaveLength(1);
  });

  it('조건이 하나도 없으면 거절한다', () => {
    expect(addSavedSearch({ name: '빈것', keyword: '', category: '', filterKey: '' })).toEqual({ ok: false, reason: 'empty' });
    expect(getSavedSearches()).toHaveLength(0);
  });

  it('이름이 비었으면 거절한다', () => {
    expect(addSavedSearch({ name: '   ', keyword: '소드', category: '', filterKey: '' })).toEqual({ ok: false, reason: 'name' });
  });

  it('이름과 설명은 길이를 자르고 앞뒤 공백을 뗀다', () => {
    const result = addSavedSearch({ name: `  ${'가'.repeat(80)}  `, description: ` ${'나'.repeat(300)} `, keyword: '소드', category: '', filterKey: '' });

    expect(result.ok && result.item.name).toHaveLength(30);
    expect(result.ok && result.item.description).toHaveLength(100);
  });

  it('새로 저장한 것이 목록 맨 위다', () => {
    addSavedSearch({ name: '첫째', keyword: '가', category: '', filterKey: '' });
    addSavedSearch({ name: '둘째', keyword: '나', category: '', filterKey: '' });

    expect(getSavedSearches().map((item) => item.name)).toEqual(['둘째', '첫째']);
  });

  it('가득 차면 더 저장하지 않는다', () => {
    for (let i = 0; i < SAVED_MAX; i += 1) addSavedSearch({ name: `검색 ${i}`, keyword: `k${i}`, category: '', filterKey: '' });

    expect(addSavedSearch({ name: '넘침', keyword: 'x', category: '', filterKey: '' })).toEqual({ ok: false, reason: 'full' });
    expect(getSavedSearches()).toHaveLength(SAVED_MAX);
  });
});

describe('수정과 삭제', () => {
  it('이름과 설명을 고친다. 검색 조건은 그대로다', () => {
    const result = addSavedSearch({ name: '옛 이름', keyword: '소드', category: '검', filterKey: '' });
    if (!result.ok) throw new Error('저장 실패');

    expect(updateSavedSearch(result.item.id, { name: '새 이름', description: '메모' })).toBe(true);

    expect(getSavedSearches()[0]).toMatchObject({ name: '새 이름', description: '메모', keyword: '소드', category: '검' });
  });

  it('이름을 비우거나 없는 항목은 고치지 않는다', () => {
    const result = addSavedSearch({ name: '이름', keyword: '소드', category: '', filterKey: '' });
    if (!result.ok) throw new Error('저장 실패');

    expect(updateSavedSearch(result.item.id, { name: ' ', description: '' })).toBe(false);
    expect(updateSavedSearch('없는-id', { name: 'x', description: '' })).toBe(false);
    expect(getSavedSearches()[0].name).toBe('이름');
  });

  it('삭제한다', () => {
    const a = addSavedSearch({ name: 'a', keyword: '가', category: '', filterKey: '' });
    addSavedSearch({ name: 'b', keyword: '나', category: '', filterKey: '' });
    if (!a.ok) throw new Error('저장 실패');

    removeSavedSearch(a.item.id);

    expect(getSavedSearches().map((item) => item.name)).toEqual(['b']);
  });
});

describe('저장된 값 읽기', () => {
  it('배열이 아니거나 깨졌으면 빈 목록이다', () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved('x')).toEqual([]);
    expect(parseSaved({})).toEqual([]);
  });

  it('읽을 수 없는 항목만 버리고 나머지는 살린다', () => {
    const items = parseSaved([
      { id: 'a', name: '좋음', keyword: '소드', category: '', filterKey: '', description: '' },
      { id: 'b', name: '', keyword: '소드' },
      { id: 'c', name: '조건 없음', keyword: '', category: '', filterKey: '' },
      'text',
      { id: 'a', name: '같은 id', keyword: '활' },
    ]);

    expect(items.map((item) => item.id)).toEqual(['a']);
  });

  it('상세 조건 글자가 깨졌으면 그 조건만 빠지고 검색어는 남는다', () => {
    const [item] = parseSaved([{ id: 'a', name: '깨짐', keyword: '소드', category: '', filterKey: '{broken' }]);

    expect(item).toMatchObject({ keyword: '소드', filterKey: '' });
  });

  it('상세 조건만 있고 그것이 깨졌으면 조건이 없어 버린다', () => {
    expect(parseSaved([{ id: 'a', name: '깨짐', keyword: '', category: '', filterKey: '{broken' }])).toEqual([]);
  });
});

describe('목록에 보일 요약', () => {
  it('카테고리, 검색어, 상세 조건을 차례로 적는다', () => {
    expect(describeSavedSearch({ keyword: '유물', category: '유물', filterKey })).toEqual([
      '유물',
      '"유물"',
      expect.stringContaining('블래스트'),
    ]);
  });

  it('없는 것은 건너뛴다', () => {
    expect(describeSavedSearch({ keyword: '소드', category: '', filterKey: '' })).toEqual(['"소드"']);
  });
});
