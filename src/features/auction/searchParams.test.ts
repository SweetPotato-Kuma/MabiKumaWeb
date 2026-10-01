import { describe, expect, it } from 'vitest';
import {
  readSearchState,
  readViewState,
  searchParamsFor,
  tabParamsFor,
  writeViewState,
} from './searchParams';

const params = (query: string) => new URLSearchParams(query);

describe('경매장 주소 읽기', () => {
  it('묶음 카테고리는 이름이 맞을 때만 읽고, 없는 묶음은 비운다', () => {
    expect(readSearchState(params('?category=group:원거리 장비')).category).toBe('group:원거리 장비');
    expect(readSearchState(params('?category=group:없는 묶음')).category).toBe('');
    expect(readSearchState(params('?category=활')).category).toBe('활');
  });

  it('아무것도 없으면 기본 화면이다', () => {
    expect(readSearchState(params(''))).toMatchObject({ category: '', keyword: '', filterKey: '' });
    expect(readViewState(params(''))).toEqual({
      tab: 'items',
      sort: { key: 'price', order: 'ascend' },
      page: 1,
      size: 10,
      exact: false,
      byTotal: false,
    });
  });

  it('검색어와 카테고리를 읽는다', () => {
    const search = readSearchState(params('keyword=소울&category=근거리 장비'));

    expect(search.keyword).toBe('소울');
    expect(search.category).toBe('근거리 장비');
  });

  it('탭마다 기본 정렬이 다르다', () => {
    expect(readViewState(params('tab=history')).sort).toEqual({ key: 'time', order: 'descend' });
  });

  it('정렬은 앞에 -가 붙으면 내림차순이다', () => {
    expect(readViewState(params('sort=-price')).sort).toEqual({ key: 'price', order: 'descend' });
    expect(readViewState(params('sort=count')).sort).toEqual({ key: 'count', order: 'ascend' });
  });

  it('알 수 없거나 형식이 잘못된 값은 기본으로 돌린다', () => {
    expect(readViewState(params('tab=zzz&sort=nope&page=-3&size=7'))).toEqual({
      tab: 'items',
      sort: { key: 'price', order: 'ascend' },
      page: 1,
      size: 10,
      exact: false,
      byTotal: false,
    });
    expect(readViewState(params('page=abc')).page).toBe(1);
    expect(readViewState(params('page=1.5')).page).toBe(1);
    expect(readViewState(params('page=999999')).page).toBe(1);
  });

  it('다른 탭의 정렬 열은 받지 않는다', () => {
    // 만료는 판매 중 매물에만, 거래 시각은 거래 내역에만 있다.
    expect(readViewState(params('tab=history&sort=expire')).sort.key).toBe('time');
    expect(readViewState(params('sort=time')).sort.key).toBe('price');
  });

  it('정확히 일치는 exact=1 일 때만 켜진다', () => {
    expect(readViewState(params('exact=1')).exact).toBe(true);
    expect(readViewState(params('exact=0')).exact).toBe(false);
    expect(readViewState(params('exact=yes')).exact).toBe(false);
  });

  it('가격을 묶음 전체로 정렬하는 것은 by=total 일 때만 켜진다', () => {
    expect(readViewState(params('by=total')).byTotal).toBe(true);
    expect(readViewState(params('by=unit')).byTotal).toBe(false);
    expect(readViewState(params('')).byTotal).toBe(false);
  });

  it('쪽 번호와 크기를 읽는다', () => {
    expect(readViewState(params('page=3&size=50'))).toMatchObject({ page: 3, size: 50 });
  });

  it('상세 검색 조건이 깨졌으면 빈 조건이다', () => {
    expect(readSearchState(params('f=%7Bbroken')).filterKey).toBe('');
  });

  it('예전 유물 링크를 유물 조건으로 읽는다', () => {
    const search = readSearchState(
      params('category=무리아스의 유물&relic=블래스트&relicMin=3&relicMax=99'),
    );

    expect(search.filter.conditions).toMatchObject([
      { kind: 'relic', name: '블래스트', minLevel: 3, maxLevel: null },
    ]);
  });

  it('새 조건이 있으면 예전 유물 글자는 무시한다', () => {
    const f = encodeURIComponent('[{"kind":"reforge","name":"스매시 대미지"}]');
    const search = readSearchState(params(`f=${f}&relic=블래스트`));

    expect(search.filter.conditions).toMatchObject([{ kind: 'reforge' }]);
  });
});

describe('경매장 주소 쓰기', () => {
  it('새로 찾으면 검색 조건을 쓰고 쪽과 정렬은 처음으로 돌린다', () => {
    const next = searchParamsFor(params('keyword=옛것&page=4&sort=-price&size=50&tab=history'), {
      category: '검',
      keyword: ' 소드 ',
      filterKey: '',
    });

    expect(next.get('keyword')).toBe('소드');
    expect(next.get('category')).toBe('검');
    expect(next.has('page')).toBe(false);
    expect(next.has('sort')).toBe(false);
    // 쪽 크기와 탭은 찾는 방식이 아니라 보는 방식이라 그대로다.
    expect(next.get('size')).toBe('50');
    expect(next.get('tab')).toBe('history');
  });

  it('비어 있는 값은 주소에서 뺀다', () => {
    const next = searchParamsFor(params('keyword=소드&category=검'), {
      category: '',
      keyword: '',
      filterKey: '',
    });

    expect(next.toString()).toBe('');
  });

  it('예전 유물 글자는 새 조건으로 옮겨지며 지워진다', () => {
    const next = searchParamsFor(params('relic=블래스트&relicMin=2'), {
      category: '무리아스의 유물',
      keyword: '',
      filterKey: '[{"kind":"relic","name":"블래스트","minLevel":2}]',
    });

    expect(next.has('relic')).toBe(false);
    expect(next.has('relicMin')).toBe(false);
    expect(next.get('f')).toContain('블래스트');
  });

  it('기본값과 같은 보기 설정은 쓰지 않는다', () => {
    const next = params('page=3&size=50&sort=-price');
    writeViewState(next, { page: 1, size: 10, sort: { key: 'price', order: 'ascend' } });

    expect(next.toString()).toBe('');
  });

  it('탭마다 기본 정렬을 기준으로 정렬을 쓴다', () => {
    const next = params('tab=history');
    writeViewState(next, { sort: { key: 'time', order: 'descend' } });
    expect(next.has('sort')).toBe(false);

    writeViewState(next, { sort: { key: 'price', order: 'descend' } });
    expect(next.get('sort')).toBe('-price');
  });

  it('정확히 일치를 쓰고, 끄면 주소에서 뺀다', () => {
    const next = params('keyword=소드');
    writeViewState(next, { exact: true });
    expect(next.get('exact')).toBe('1');

    writeViewState(next, { exact: false });
    expect(next.has('exact')).toBe(false);
  });

  it('새로 찾아도 탭을 바꿔도 정확히 일치는 그대로다', () => {
    const searched = searchParamsFor(params('keyword=옛것&exact=1'), {
      category: '',
      keyword: '소드',
      filterKey: '',
    });

    expect(searched.get('exact')).toBe('1');
    expect(tabParamsFor(searched, 'history').get('exact')).toBe('1');
  });

  it('가격 정렬 기준을 쓰고, 개당으로 돌리면 주소에서 뺀다', () => {
    const next = params('keyword=소드');
    writeViewState(next, { byTotal: true });
    expect(next.get('by')).toBe('total');

    writeViewState(next, { byTotal: false });
    expect(next.has('by')).toBe(false);
  });

  it('탭을 바꾸면 정렬과 쪽은 처음으로 돌아간다', () => {
    const next = tabParamsFor(params('keyword=소드&page=3&sort=count'), 'history');

    expect(next.get('tab')).toBe('history');
    expect(next.get('keyword')).toBe('소드');
    expect(next.has('page')).toBe(false);
    expect(next.has('sort')).toBe(false);
    expect(tabParamsFor(next, 'items').has('tab')).toBe(false);
  });
});
