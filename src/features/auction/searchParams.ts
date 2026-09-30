import { PAGE_SIZE_OPTIONS, DEFAULT_PAGE_SIZE } from '@/lib/useListPagination';
import { RELIC_MAX_LEVEL } from '@/features/relics/murias';
import { parseFilter, serializeFilter } from './filterUrl';
import { relicCondition, type OptionFilter } from './optionFilter';

/**
 * 경매장 화면의 상태를 주소 쿼리스트링으로 옮기고 되돌린다.
 *
 * 주소가 검색의 주인이다. 찾기, 카테고리 고르기, 탭 바꾸기는 주소를 새로 쓰고(history push),
 * 정렬과 쪽 넘기기는 바꿔 끼운다(replace). 화면은 주소를 읽어 그리므로 뒤로 가기, 새로고침,
 * 링크 공유가 모두 같은 길을 탄다. 기본값과 같은 값은 주소에서 뺀다.
 */

export type AuctionTab = 'items' | 'history';
export type SortOrder = 'ascend' | 'descend';

export interface AuctionSort {
  key: string;
  order: SortOrder;
}

/** 탭마다 정렬할 수 있는 열. 이름이 같아도 기준이 다르다(만료 / 거래 시각). */
const SORT_KEYS: Record<AuctionTab, readonly string[]> = {
  items: ['price', 'count', 'expire'],
  history: ['price', 'count', 'time'],
};

/** 정렬을 고르지 않았을 때. 매물은 싼 순, 거래 내역은 최근 순이다. */
const DEFAULT_SORT: Record<AuctionTab, AuctionSort> = {
  items: { key: 'price', order: 'ascend' },
  history: { key: 'time', order: 'descend' },
};

/** 검색 조건. 찾기를 눌렀을 때 정해지는 것이고, 바뀌면 새로 찾는다. */
export interface AuctionSearchState {
  category: string;
  keyword: string;
  filter: OptionFilter;
  /** 조건을 글자로 만든 것. 같은 조건인지 견주고 효과의 의존성으로 쓴다. */
  filterKey: string;
}

/** 결과를 어떻게 보여 줄지. 바뀌어도 새로 찾지 않는다. */
export interface AuctionViewState {
  tab: AuctionTab;
  sort: AuctionSort;
  page: number;
  size: number;
  /** 검색어와 이름이 정확히 같은 매물만 보인다. 새로 찾지 않고 불러온 것을 거른다. */
  exact: boolean;
  /** 가격 열을 묶음 전체 값으로 정렬한다. 아니면 개당 가격으로 정렬한다. */
  byTotal: boolean;
}

const MAX_TEXT = 200;
/** 쪽 번호의 상한. 주소를 고쳐 쓴 큰 수가 끝없이 불러오게 하지 않는다. */
const MAX_PAGE = 1000;

const text = (params: URLSearchParams, key: string) => (params.get(key) ?? '').slice(0, MAX_TEXT);

/**
 * 예전 링크. 유물 시세에서 칸을 누르면 `relic`, `relicMin`, `relicMax` 로 왔다.
 * 새 조건(`f`)이 없을 때만 읽는다. 레벨이 1~10 이 아니면 그쪽 끝은 비운다.
 */
function readLegacyRelic(params: URLSearchParams): OptionFilter | null {
  const name = params.get('relic');
  if (name === null) return null;
  const level = (key: string) => {
    const value = Number(params.get(key));
    return Number.isInteger(value) && value >= 1 && value <= RELIC_MAX_LEVEL ? value : null;
  };
  return { conditions: [relicCondition(name.slice(0, MAX_TEXT), level('relicMin'), level('relicMax'))] };
}

export function readSearchState(params: URLSearchParams): AuctionSearchState {
  const filter = params.has('f') ? parseFilter(params.get('f')) : (readLegacyRelic(params) ?? parseFilter(null));
  return {
    category: text(params, 'category'),
    keyword: text(params, 'keyword'),
    filter,
    filterKey: serializeFilter(filter),
  };
}

export function readViewState(params: URLSearchParams): AuctionViewState {
  const tab: AuctionTab = params.get('tab') === 'history' ? 'history' : 'items';

  const rawSort = params.get('sort') ?? '';
  const descending = rawSort.startsWith('-');
  const key = descending ? rawSort.slice(1) : rawSort;
  const sort: AuctionSort = SORT_KEYS[tab].includes(key)
    ? { key, order: descending ? 'descend' : 'ascend' }
    : DEFAULT_SORT[tab];

  const page = Number(params.get('page'));
  const size = Number(params.get('size'));
  return {
    tab,
    sort,
    page: Number.isInteger(page) && page >= 1 && page <= MAX_PAGE ? page : 1,
    size: PAGE_SIZE_OPTIONS.includes(size) ? size : DEFAULT_PAGE_SIZE,
    exact: params.get('exact') === '1',
    byTotal: params.get('by') === 'total',
  };
}

const sameSort = (a: AuctionSort, b: AuctionSort) => a.key === b.key && a.order === b.order;

/** 값이 비었거나 기본값이면 지우고, 아니면 쓴다. */
function put(params: URLSearchParams, key: string, value: string, fallback = '') {
  if (value === '' || value === fallback) params.delete(key);
  else params.set(key, value);
}

/** 검색 조건을 주소에 쓴다. 예전 유물 조건 글자는 새 조건으로 옮겨지므로 지운다. */
export function writeSearchState(
  params: URLSearchParams,
  search: Pick<AuctionSearchState, 'category' | 'keyword' | 'filterKey'>,
) {
  put(params, 'keyword', search.keyword.trim());
  put(params, 'category', search.category);
  put(params, 'f', search.filterKey);
  params.delete('relic');
  params.delete('relicMin');
  params.delete('relicMax');
}

/** 보는 방식을 주소에 쓴다. 기본값과 같은 것은 뺀다. 넘기지 않은 칸은 건드리지 않는다. */
export function writeViewState(params: URLSearchParams, view: Partial<AuctionViewState>) {
  const tab = view.tab ?? readViewState(params).tab;
  if (view.tab !== undefined) put(params, 'tab', view.tab, 'items');
  if (view.sort !== undefined) {
    const value = `${view.sort.order === 'descend' ? '-' : ''}${view.sort.key}`;
    const fallback = DEFAULT_SORT[tab];
    put(params, 'sort', sameSort(view.sort, fallback) ? '' : value);
  }
  if (view.page !== undefined) put(params, 'page', String(view.page), '1');
  if (view.size !== undefined) put(params, 'size', String(view.size), String(DEFAULT_PAGE_SIZE));
  if (view.exact !== undefined) put(params, 'exact', view.exact ? '1' : '');
  if (view.byTotal !== undefined) put(params, 'by', view.byTotal ? 'total' : '');
}

/** 새로 찾을 때의 주소. 쪽과 정렬은 처음으로 돌아가고, 쪽 크기와 탭은 그대로다. */
export function searchParamsFor(
  base: URLSearchParams,
  search: Pick<AuctionSearchState, 'category' | 'keyword' | 'filterKey'>,
): URLSearchParams {
  const next = new URLSearchParams(base);
  writeSearchState(next, search);
  next.delete('page');
  next.delete('sort');
  return next;
}

/** 탭을 바꿀 때의 주소. 정렬 기준이 탭마다 달라 정렬과 쪽은 처음으로 돌린다. */
export function tabParamsFor(base: URLSearchParams, tab: AuctionTab): URLSearchParams {
  const next = new URLSearchParams(base);
  next.delete('sort');
  next.delete('page');
  put(next, 'tab', tab, 'items');
  return next;
}
