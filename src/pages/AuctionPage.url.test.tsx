import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { serializeFilter } from '@/features/auction/filterUrl';
import { addSavedSearch, getSavedSearches, resetSavedSearchesForTest } from '@/features/auction/savedSearches';
import { resetSettingsForTest, updateSettings } from '@/lib/userSettings';
import { AuctionPage } from '@/pages/AuctionPage';

/** 판매 중 매물 25건. 1번이 가장 비싸고 25번이 가장 싸다. 조회는 이 목록을 그대로 돌려준다. */
const FAKE_ITEMS = Array.from({ length: 25 }, (_, index) => ({
  item_name: `시험 검 ${index + 1}`,
  item_display_name: `시험 검 ${index + 1}`,
  item_count: ((index * 7) % 9) + 1,
  auction_item_category: '검',
  auction_price_per_unit: (25 - index) * 1000,
  date_auction_expire: new Date(Date.now() + (index + 1) * 3_600_000).toISOString(),
}));

/**
 * 이름이 검색어에 들어맞는 정도가 제각각인 매물. 검색어 "소울 보우" 에서 가격은 뒤집힌 순서다.
 * 가장 싼 것이 단어만 걸린 크로스보우라, 가격순으로만 세우면 진짜 이름이 맨 아래로 간다.
 */
const TIER_ITEMS = [
  ['창백한 명사수 소울 크로스보우', 1000],
  ['창백한 소울 보우', 2000],
  ['소울 보우 강화형', 3000],
  ['소울 보우', 5000],
].map(([name, price]) => ({
  item_name: name as string,
  item_display_name: name as string,
  item_count: 1,
  auction_item_category: '활',
  auction_price_per_unit: price as number,
  date_auction_expire: new Date(Date.now() + 3_600_000).toISOString(),
}));

/** 심볼, 도면, 옷본이 섞인 매물. 검색어에 "전투" 가 들어 있으면 이 목록을 돌려준다. */
const SYMBOL_ITEMS = ['전투 검', '전투 방패', '전투 심볼', '전투 도면'].map((name, index) => ({
  item_name: name,
  item_display_name: name,
  item_count: 1,
  auction_item_category: '검',
  auction_price_per_unit: (index + 1) * 1000,
  date_auction_expire: new Date(Date.now() + 3_600_000).toISOString(),
}));

/** 무리아스의 유물 매물. 이름이 모두 같고 옵션 문장이 레벨을 가른다. 1레벨 10억은 2레벨 천만 원보다 비싸 사기 위험이다. */
const RELIC_TEXT = (value: string) => `오버 드라이브 폭발 공격 대미지 ${value} 증가 (최대 700%)`;
const RELIC_ITEMS = [
  ['70%', 1_000_000_000],
  ['140%', 10_000_000],
  ['210%', 30_000_000],
].map(([value, price]) => ({
  item_name: '무리아스의 유물',
  item_display_name: '무리아스의 유물',
  item_count: 1,
  auction_item_category: '유물',
  auction_price_per_unit: price as number,
  date_auction_expire: new Date(Date.now() + 3_600_000).toISOString(),
  item_option: [{ option_type: '무리아스 유물', option_value: RELIC_TEXT(value as string) }],
}));

vi.mock('@/features/auction/hooks', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useAuctionItemsQuery: (input: { keyword: string }, enabled: boolean) => ({
    data: enabled
      ? (() => {
          const items =
            input.keyword === '소울 보우'
              ? TIER_ITEMS
              : input.keyword.includes('전투')
                ? SYMBOL_ITEMS
                : input.keyword === '유물시험'
                  ? RELIC_ITEMS
                  : input.keyword === '유물한줄'
                    ? RELIC_ITEMS.slice(1, 2)
                    : FAKE_ITEMS;
          return { items, loadedCount: items.length };
        })()
      : undefined,
    isPending: !enabled,
    error: null,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined,
  }),
  // 거래 내역은 비어 있는 것으로 답한다.
  useAuctionHistoryQuery: (_input: unknown, _index: unknown, enabled: boolean) => ({
    data: enabled ? { items: [], loadedCount: 0, since: null } : undefined,
    isPending: !enabled,
    error: null,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined,
  }),
}));

// 1일 중위는 모든 아이템이 10,000 G 로 답한다. 유물은 옵션 문장(레벨)마다 따로 답한다.
vi.mock('@/features/market/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useRelicRecentQuery: () => ({
    isLoading: false,
    data: {
      items: {
        [RELIC_TEXT('70%')]: { n: 2, qty: 2, lo: 1000, hi: 2000, mid: 1500, avg: 1500, last: '2026-09-30T00:00:00Z' },
        [RELIC_TEXT('140%')]: { n: 3, qty: 3, lo: 9_000_000, hi: 12_000_000, mid: 10_500_000, avg: 10_500_000, last: '2026-09-30T00:00:00Z' },
      },
    },
  }),
  useMarketRecentQuery: (names: readonly string[]) => ({
    items: Object.fromEntries(
      names.map((name) => [name, { n: 5, qty: 5, lo: 9000, hi: 11000, mid: 10_000, avg: 10_000, last: '2026-09-30T00:00:00Z' }]),
    ),
    isLoading: false,
  }),
}));

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useCanQuery: () => true,
}));

/** 화면 밖에서 주소를 읽고 뒤로 가기를 누르는 손잡이. */
interface Probe {
  search: () => string;
  back: () => void;
}

/**
 * 검색 조건이 주소에 실리고, 주소에서 되살아나는지 본다.
 * 조회는 나가지 않게 fetch 를 막아 둔다. 여기서 보는 것은 주소와 입력칸의 오감이다.
 */
function renderAt(url: string): Probe {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let location = '';
  let goBack = () => {};
  function Watcher() {
    location = useLocation().search;
    const navigate = useNavigate();
    goBack = () => navigate(-1);
    return null;
  }
  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Watcher />
          <AuctionPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
  return { search: () => location, back: () => act(() => goBack()) };
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  resetSettingsForTest();
  resetSavedSearchesForTest();
});

// 페이지 전체를 그리는 시험이라 다른 시험과 함께 돌면 기본 5초를 넘기기도 한다.
vi.setConfig({ testTimeout: 30_000 });

describe('경매장 검색 조건과 주소', () => {
  it('주소의 검색어가 입력칸에 채워진다', async () => {
    renderAt('/auction?keyword=소울&category=검');

    expect(await screen.findByDisplayValue('소울')).toBeInTheDocument();
  });

  it('찾기를 누르면 검색어가 주소에 실리고 뒤로 가면 이전 검색으로 돌아간다', async () => {
    const router = renderAt('/auction?keyword=소드');
    const input = await screen.findByPlaceholderText(/아이템명 검색/);

    fireEvent.change(input, { target: { value: '활' } });
    fireEvent.click(screen.getByRole('button', { name: '찾기' }));

    await waitFor(() => expect(router.search()).toBe('?keyword=%ED%99%9C'));

    router.back();

    expect(router.search()).toBe('?keyword=소드');
    expect(await screen.findByDisplayValue('소드')).toBeInTheDocument();
  });

  it('검색 초기화를 누르면 주소가 비고 입력칸도 빈다', async () => {
    const router = renderAt('/auction?keyword=소드&category=검');
    await screen.findByDisplayValue('소드');

    fireEvent.click(screen.getByRole('button', { name: /검색 초기화/ }));

    await waitFor(() => expect(router.search()).toBe(''));
    expect(screen.getByPlaceholderText(/아이템명 검색/)).toHaveValue('');
  });

  it('잘못된 파라미터로 들어와도 오류 없이 화면이 뜬다', async () => {
    renderAt('/auction?tab=zzz&sort=nope&page=-5&size=7&f=%7Bbroken&category=&keyword=');

    expect(await screen.findByRole('heading', { name: '경매장 조회' })).toBeInTheDocument();
    expect(screen.getByText(/카테고리를 고르거나, 아이템명이나 상세 검색 조건을 넣은 뒤/)).toBeInTheDocument();
  });

  it('거래 내역 탭을 고르면 주소에 실리고 판매 중 매물로 돌아오면 빠진다', async () => {
    const router = renderAt('/auction?keyword=소드');
    await screen.findByRole('tab', { name: '거래 내역' });

    fireEvent.click(screen.getByRole('tab', { name: '거래 내역' }));
    await waitFor(() => expect(router.search()).toContain('tab=history'));

    fireEvent.click(screen.getByRole('tab', { name: '판매 중 매물' }));
    await waitFor(() => expect(router.search()).not.toContain('tab='));
  });

  describe('표의 정렬과 쪽 넘기기', () => {
    /** 표 본문의 이름 열을 위에서부터 읽는다. */
    const firstNames = () =>
      screen
        .getAllByText(/^시험 검 \d+$/)
        .map((node) => node.textContent)
        .slice(0, 3);

    it('주소의 정렬과 쪽 번호가 표에 그대로 나타난다', async () => {
      // 가격이 비싼 순(1번부터)으로 10건씩 나누면 두 번째 쪽은 11번부터다.
      renderAt('/auction?keyword=시험&sort=-price&page=2');

      await screen.findByText('시험 검 11');
      expect(firstNames()[0]).toBe('시험 검 11');
    });

    it('표 머리를 누르면 정렬이 주소에 실리고 쪽은 처음으로 돌아간다', async () => {
      const router = renderAt('/auction?keyword=시험&page=2');
      await screen.findByRole('columnheader', { name: /가격/ });

      fireEvent.click(screen.getByRole('columnheader', { name: /가격/ }));

      await waitFor(() => expect(router.search()).toContain('sort=-price'));
      expect(router.search()).not.toContain('page=');
    });

    it('쪽을 넘기면 주소에 실리고, 첫 쪽으로 돌아오면 주소에서 빠진다', async () => {
      const router = renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      fireEvent.click(screen.getByTitle('2'));
      await waitFor(() => expect(router.search()).toContain('page=2'));

      fireEvent.click(screen.getByTitle('1'));
      await waitFor(() => expect(router.search()).not.toContain('page='));
    });
  });

  describe('이름이 들어맞는 정도', () => {
    const shownNames = () =>
      screen
        .getAllByText(/소울/)
        .map((node) => node.textContent)
        .filter((text): text is string => Boolean(text) && !text!.includes('일치'));

    it('정확히 일치가 가격과 상관없이 맨 위로 오고, 단어만 걸린 것은 맨 아래로 간다', async () => {
      renderAt('/auction?keyword=소울 보우');

      await screen.findByText('소울 보우 강화형');

      expect(shownNames()).toEqual([
        '소울 보우',
        '소울 보우 강화형',
        '창백한 소울 보우',
        '창백한 명사수 소울 크로스보우',
      ]);
    });

    it('이름이 그대로 들어맞는 줄이 있으면 나머지에 부분 일치 라벨을 단다', async () => {
      renderAt('/auction?keyword=소울 보우');
      await screen.findByText('소울 보우 강화형');

      // 앞부분 일치까지는 라벨이 없고, 그 밖의 둘에 붙는다.
      expect(screen.getAllByText('부분 일치')).toHaveLength(2);
    });

    it('전부 부분 일치이면 라벨을 달지 않는다', async () => {
      renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      expect(screen.queryByText('부분 일치')).toBeNull();
    });

    it('정확히 일치만 보기를 켜면 이름이 같은 것만 남고 주소에 실린다', async () => {
      const router = renderAt('/auction?keyword=소울 보우');
      await screen.findByText('소울 보우 강화형');

      fireEvent.click(screen.getByRole('checkbox', { name: '정확히 일치' }));

      await waitFor(() => expect(router.search()).toContain('exact=1'));
      expect(shownNames()).toEqual(['소울 보우']);
      expect(screen.queryByText('소울 보우 강화형')).toBeNull();

      fireEvent.click(screen.getByRole('checkbox', { name: '정확히 일치' }));
      await waitFor(() => expect(router.search()).not.toContain('exact'));
      expect(await screen.findByText('소울 보우 강화형')).toBeInTheDocument();
    });

    it('주소의 정확히 일치가 토글에 나타난다', async () => {
      renderAt('/auction?keyword=소울 보우&exact=1');

      expect(await screen.findByRole('checkbox', { name: '정확히 일치' })).toBeChecked();
    });
  });

  describe('심볼·도면·옷본 제외', () => {
    it('설정을 켜지 않았으면 모두 보이고 안내도 없다', async () => {
      renderAt('/auction?keyword=전투');

      expect(await screen.findByText('전투 심볼')).toBeInTheDocument();
      expect(screen.getByText('전투 도면')).toBeInTheDocument();
      expect(screen.queryByText(/건 숨김/)).toBeNull();
    });

    it('설정을 켜면 결과에서 빠지고 몇 건을 숨겼는지 알린다', async () => {
      updateSettings({ hideSymbols: true });
      renderAt('/auction?keyword=전투');

      expect(await screen.findByText('전투 검')).toBeInTheDocument();
      expect(screen.queryByText('전투 심볼')).toBeNull();
      expect(screen.queryByText('전투 도면')).toBeNull();
      expect(screen.getByText('심볼·도면·옷본 2건 숨김')).toBeInTheDocument();
    });

    it('보기를 누르면 숨긴 것이 나타나고, 숨기기로 다시 숨긴다', async () => {
      updateSettings({ hideSymbols: true });
      renderAt('/auction?keyword=전투');
      await screen.findByText('전투 검');

      fireEvent.click(screen.getByRole('button', { name: '보기' }));
      expect(await screen.findByText('전투 심볼')).toBeInTheDocument();
      expect(screen.getByText('심볼·도면·옷본 2건 표시 중')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: '숨기기' }));
      await waitFor(() => expect(screen.queryByText('전투 심볼')).toBeNull());
    });

    it('검색어가 그 단어를 직접 말하면 숨기지 않는다', async () => {
      updateSettings({ hideSymbols: true });
      renderAt('/auction?keyword=전투 심볼');

      expect(await screen.findByText('전투 심볼')).toBeInTheDocument();
      expect(screen.queryByText(/건 숨김/)).toBeNull();
    });
  });

  describe('가격 열', () => {
    /** 매물 수량과 개당 가격은 위 FAKE_ITEMS 규칙과 같다. */
    const totalOf = (index: number) => (25 - index) * 1000 * (((index * 7) % 9) + 1);

    it('묶음 매물에는 개당 가격이 전체 가격 아래에 보이고, 한 개짜리에는 없다', async () => {
      renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      // 수량이 2 이상인 줄에만 전체와 개당이 함께 붙는다.
      expect(screen.getAllByText(/^개당 /).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/^전체 /).length).toBe(screen.getAllByText(/^개당 /).length);
    });

    it('묶음이 있으면 가격순 기준(개당, 전체)을 고를 수 있다', async () => {
      renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      expect(screen.getByRole('radiogroup', { name: '가격 정렬 기준' })).toBeInTheDocument();
    });

    it('묶음이 하나도 없으면 가격순 기준은 나오지 않는다', async () => {
      renderAt('/auction?keyword=소울 보우');
      await screen.findByText('소울 보우 강화형');

      expect(screen.queryByRole('radiogroup', { name: '가격 정렬 기준' })).toBeNull();
    });

    it('전체로 바꾸면 주소에 실리고 묶음 전체 값이 싼 순으로 정렬된다', async () => {
      const router = renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      fireEvent.click(screen.getByRole('radio', { name: '전체' }));

      await waitFor(() => expect(router.search()).toContain('by=total'));
      const cheapest = Array.from({ length: 25 }, (_, index) => index).sort((a, b) => totalOf(a) - totalOf(b))[0];
      await waitFor(() =>
        expect(screen.getAllByText(/^시험 검 \d+$/)[0].textContent).toBe(`시험 검 ${cheapest + 1}`),
      );
    });

    it('주소의 by=total 이 기준 선택에 나타난다', async () => {
      renderAt('/auction?keyword=시험&by=total');
      await screen.findAllByText(/^시험 검 \d+$/);

      expect(screen.getByRole('radio', { name: '전체' }).closest('label')?.classList.contains('ant-segmented-item-selected')).toBe(true);
    });

    it('중위가와 견준 %를 이름 아래에 적는다', async () => {
      renderAt('/auction?keyword=시험');
      await screen.findByText('시험 검 25');

      // 시험 검 25 의 개당 가격은 1,000 G 이고 중위가는 10,000 G 다: -90%.
      expect(screen.getByText(/1일 중위 10,000 G \(-90%\)/)).toBeInTheDocument();
    });
  });

  describe('거래 내역이 비었을 때', () => {
    it('기간으로 안내하고, 조회 한도(건수)는 드러내지 않는다', async () => {
      renderAt('/auction?keyword=소울 보우&tab=history');

      expect(await screen.findByText(/최근 1시간 동안 이 조건으로 거래된 기록이 없습니다./)).toBeInTheDocument();
      expect(screen.queryByText(/건 중/)).toBeNull();
      expect(screen.queryByText(/검색어를 줄여 보세요/)).toBeNull();
    });

    it('더 긴 기간을 볼 수 있는 아이템 정보로 잇는다', async () => {
      renderAt('/auction?keyword=소울 보우&tab=history');

      const link = await screen.findByRole('link', { name: '더 긴 기간의 시세 기록 보기' });
      expect(link).toHaveAttribute('href', '/items');
    });
  });

  describe('조건으로 거른 결과가 비었을 때', () => {
    it('불러온 건수를 적지 않고 조건을 넓히라고만 한다', async () => {
      const f = serializeFilter({ conditions: [{ id: 1, kind: 'reforge', name: '없는 세공', minLevel: 20 }] });
      renderAt(`/auction?category=검&f=${encodeURIComponent(f)}`);

      expect(await screen.findByText('조건에 맞는 매물이 없습니다. 조건을 넓혀 보세요.')).toBeInTheDocument();
      expect(screen.queryByText(/불러온 .*건/)).toBeNull();
    });
  });

  describe('무리아스의 유물 줄', () => {
    it('이름이 같은 유물이라도 줄마다 그 옵션 문장(레벨)의 1일 중위를 붙인다', async () => {
      renderAt('/auction?keyword=유물시험');

      // 2레벨(140%) 줄의 중위는 10,500,000 이다. 모든 유물을 한 통계로 묶은 값이 아니다.
      // 테스트 화면은 좁아 중위가 이름 아래 글로 붙는다.
      expect(await screen.findByText(/1일 중위 10,500,000 G/)).toBeInTheDocument();
      expect(screen.getByText(/1일 중위 1,500 G/)).toBeInTheDocument();
      // 문장이 여럿이면 이름 하나로 센 "최근 1일 거래" 카드는 두지 않는다.
      expect(screen.queryByText('최근 1일 거래')).toBeNull();
    });

    it('옵션과 레벨 하나로 좁혀 보면 그 레벨의 최근 1일 거래를 위에 보인다', async () => {
      renderAt('/auction?keyword=유물한줄');

      expect(await screen.findByText('최근 1일 거래, 오버 드라이브 폭발 공격 대미지 2레벨')).toBeInTheDocument();
    });

    it('더 높은 레벨 최저가보다 비싼 낮은 레벨 매물에 사기 위험 표시를 단다', async () => {
      renderAt('/auction?keyword=유물시험');
      await screen.findByText(/1일 중위 10,500,000 G/);

      const warnings = screen.getAllByRole('button', { name: /^\(사기 위험\)/ });

      // 1레벨 10억만 위험이다. 2레벨 천만 원과 3레벨 3천만 원은 아니다.
      expect(warnings).toHaveLength(1);
      expect(warnings[0].getAttribute('aria-label')).toContain('10,000,000 G');
      fireEvent.click(warnings[0]);
      expect(await screen.findByText(/보다 비쌉니다/)).toBeInTheDocument();
    });
  });

  describe('상세 검색 창', () => {
    it('창에서 옵션을 더하고 검색을 누르면 조건이 주소에 실리고 입력칸에 배지로 남는다', async () => {
      const router = renderAt('/auction?category=분양 메달');
      await screen.findByRole('button', { name: /상세 옵션/ });

      fireEvent.click(screen.getByRole('button', { name: /상세 옵션/ }));
      const dialog = within(await screen.findByRole('dialog'));
      fireEvent.click(dialog.getByRole('button', { name: '펫 정보' }));
      fireEvent.change(dialog.getByLabelText('펫 종족명'), { target: { value: '스쿠터' } });
      fireEvent.click(dialog.getByRole('button', { name: /검색/ }));

      await waitFor(() => expect(new URLSearchParams(router.search()).get('f')).toContain('스쿠터'));
      expect(new URLSearchParams(router.search()).get('category')).toBe('분양 메달');
      expect(await screen.findByText('펫 정보 종족명 "스쿠터"')).toBeInTheDocument();
    });

    it('주소의 조건이 배지로 요약된다', async () => {
      const f = serializeFilter({ conditions: [{ id: 1, kind: 'pet', field: '레벨', text: '', min: 100 }] });
      renderAt(`/auction?category=분양 메달&f=${encodeURIComponent(f)}`);

      expect(await screen.findByText('펫 정보 레벨 100 이상')).toBeInTheDocument();
    });
  });

  describe('분류 경로 배지', () => {
    const crumbs = () => within(screen.getByRole('navigation', { name: '카테고리 경로' }));

    it('고른 카테고리까지 전체, 묶음, 카테고리 순으로 배지를 보인다', async () => {
      renderAt('/auction?category=활');

      expect(await screen.findByRole('navigation', { name: '카테고리 경로' })).toBeInTheDocument();
      expect(crumbs().getByText('전체')).toBeInTheDocument();
      expect(crumbs().getByText('원거리 장비')).toBeInTheDocument();
      expect(crumbs().getByText('활')).toHaveAttribute('aria-current', 'true');
    });

    it('고른 것이 없으면 경로를 두지 않는다', () => {
      renderAt('/auction');

      expect(screen.queryByRole('navigation', { name: '카테고리 경로' })).toBeNull();
    });

    it('상위 배지를 누르면 그 묶음을 찾는다', async () => {
      const router = renderAt('/auction?category=활');
      await screen.findByRole('navigation', { name: '카테고리 경로' });

      fireEvent.click(crumbs().getByText('원거리 장비'));

      await waitFor(() => expect(new URLSearchParams(router.search()).get('category')).toBe('group:원거리 장비'));
      expect(crumbs().queryByText('활')).toBeNull();
      expect(crumbs().getByText('원거리 장비')).toHaveAttribute('aria-current', 'true');
    });

    it('전체 배지를 누르면 카테고리를 푼다', async () => {
      const router = renderAt('/auction?category=활&keyword=소울');
      await screen.findByRole('navigation', { name: '카테고리 경로' });

      fireEvent.click(crumbs().getByText('전체'));

      await waitFor(() => expect(router.search()).not.toContain('category'));
      expect(router.search()).toContain('keyword=');
    });

    it('주소에 없는 묶음 이름이 실려 오면 카테고리를 고르지 않은 것으로 본다', async () => {
      renderAt('/auction?category=group:없는 묶음');

      expect(await screen.findByText(/카테고리를 고르거나/)).toBeInTheDocument();
      expect(screen.queryByRole('navigation', { name: '카테고리 경로' })).toBeNull();
    });
  });

  describe('검색 즐겨찾기', () => {
    const dialog = () => screen.getByRole('dialog');
    // 즐겨찾기 단추 하나가 펼치는 메뉴에서 칸을 고른다.
    const pick = async (name: RegExp) => {
      fireEvent.click(screen.getByRole('button', { name: /즐겨찾기/ }));
      fireEvent.click(await screen.findByRole('menuitem', { name }));
    };

    it('검색 줄에는 즐겨찾기 단추 하나만 두고, 눌러서 등록과 목록을 고른다', async () => {
      renderAt('/auction');

      expect(screen.getAllByRole('button', { name: /즐겨찾기/ })).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: /즐겨찾기/ }));
      expect(await screen.findByRole('menuitem', { name: /지금 검색 등록/ })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /목록 보기/ })).toBeInTheDocument();
    });

    it('검색 조건이 하나도 없으면 등록할 수 없다고 알리고 창을 열지 않는다', async () => {
      renderAt('/auction');

      await pick(/지금 검색 등록/);

      expect(await screen.findByText(/저장할 검색 조건이 없습니다/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(getSavedSearches()).toHaveLength(0);
    });

    it('지금 조건에 이름과 설명을 붙여 저장한다', async () => {
      renderAt('/auction?keyword=소울 보우&category=활');
      await screen.findByDisplayValue('소울 보우');

      await pick(/지금 검색 등록/);
      await screen.findByRole('dialog');
      // 이름은 검색어로 미리 채워 둔다.
      expect(within(dialog()).getByLabelText('이름')).toHaveValue('소울 보우');
      expect(within(dialog()).getByText('"소울 보우"')).toBeInTheDocument();
      fireEvent.change(within(dialog()).getByLabelText('이름'), { target: { value: '내 활' } });
      fireEvent.change(within(dialog()).getByLabelText('설명 (선택)'), { target: { value: '가격 비교용' } });
      fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

      await waitFor(() => expect(getSavedSearches()).toHaveLength(1));
      expect(getSavedSearches()[0]).toMatchObject({ name: '내 활', description: '가격 비교용', keyword: '소울 보우', category: '활' });
      fireEvent.click(screen.getByRole('button', { name: /즐겨찾기/ }));
      expect(await screen.findByRole('menuitem', { name: /목록 보기 1/ })).toBeInTheDocument();
    });

    it('이미 저장한 조건은 다시 저장하지 못하게 막고 먼저 알린다', async () => {
      addSavedSearch({ name: '내 소드', keyword: '소드', category: '', filterKey: '' });
      renderAt('/auction?keyword=소드');
      await screen.findByDisplayValue('소드');

      await pick(/지금 검색 등록/);

      expect(await screen.findByText(/"내 소드" 이름으로 이미 저장돼 있습니다/)).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(getSavedSearches()).toHaveLength(1);
    });

    it('이름 없이는 저장하지 않는다', async () => {
      renderAt('/auction?keyword=소드');
      await screen.findByDisplayValue('소드');
      await pick(/지금 검색 등록/);
      await screen.findByRole('dialog');

      fireEvent.change(within(dialog()).getByLabelText('이름'), { target: { value: '   ' } });
      fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));

      expect(await within(dialog()).findByText('이름을 적어 주세요.')).toBeInTheDocument();
      expect(getSavedSearches()).toHaveLength(0);
    });

    it('목록에서 고르면 바로 그 조건으로 검색한다', async () => {
      addSavedSearch({ name: '소드 검색', keyword: '소드', category: '검', filterKey: '' });
      const router = renderAt('/auction?keyword=활');
      await screen.findByDisplayValue('활');

      await pick(/목록 보기/);
      await screen.findByRole('dialog');
      expect(within(dialog()).getByText('소드 검색')).toBeInTheDocument();
      fireEvent.click(within(dialog()).getByRole('button', { name: '소드 검색 검색' }));

      await waitFor(() => expect(router.search()).toContain('keyword=%EC%86%8C%EB%93%9C'));
      expect(router.search()).toContain('category=%EA%B2%80');
      expect(await screen.findByDisplayValue('소드')).toBeInTheDocument();
    });

    it('상세 검색 조건도 저장되고 목록에 요약이 보인다', async () => {
      const f = encodeURIComponent(serializeFilter({ conditions: [{ id: 1, kind: 'reforge', name: '스매시 대미지', minLevel: 5 }] }));
      renderAt(`/auction?category=검&f=${f}`);
      await screen.findByRole('button', { name: /즐겨찾기/ });

      await pick(/지금 검색 등록/);
      await screen.findByRole('dialog');
      fireEvent.change(within(dialog()).getByLabelText('이름'), { target: { value: '스매시 5' } });
      fireEvent.click(within(dialog()).getByRole('button', { name: '저장' }));
      await waitFor(() => expect(getSavedSearches()).toHaveLength(1));

      await pick(/목록 보기/);
      await screen.findByText('스매시 5');
      expect(getSavedSearches()[0].filterKey).toContain('스매시 대미지');
      expect(screen.getAllByText(/세공 스매시 대미지 5레벨 이상/).length).toBeGreaterThan(0);
    });

    it('이름과 설명을 고칠 수 있고 검색 조건은 그대로다', async () => {
      addSavedSearch({ name: '옛 이름', keyword: '소드', category: '', filterKey: '' });
      renderAt('/auction');
      await pick(/목록 보기/);
      await screen.findByRole('dialog');

      fireEvent.click(within(dialog()).getByRole('button', { name: '옛 이름 수정' }));
      const editor = (await screen.findAllByRole('dialog')).at(-1) as HTMLElement;
      fireEvent.change(within(editor).getByLabelText('이름'), { target: { value: '새 이름' } });
      fireEvent.click(within(editor).getByRole('button', { name: '수정' }));

      await waitFor(() => expect(getSavedSearches()[0].name).toBe('새 이름'));
      expect(getSavedSearches()[0].keyword).toBe('소드');
    });

    it('지울 수 있다. 확인을 거친다', async () => {
      addSavedSearch({ name: '지울 것', keyword: '소드', category: '', filterKey: '' });
      renderAt('/auction');
      await pick(/목록 보기/);
      await screen.findByRole('dialog');

      fireEvent.click(within(dialog()).getByRole('button', { name: '지울 것 삭제' }));
      expect(getSavedSearches()).toHaveLength(1);
      fireEvent.click(await screen.findByRole('button', { name: '지우기' }));

      await waitFor(() => expect(getSavedSearches()).toHaveLength(0));
      expect(await within(dialog()).findByText(/저장한 검색이 없습니다/)).toBeInTheDocument();
    });
  });
});
