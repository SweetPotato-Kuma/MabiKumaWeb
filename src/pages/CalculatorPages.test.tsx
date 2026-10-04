import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { CalculatorView } from '@/components/calculators/CalculatorView';
import { fetchAuctionList } from '@/features/auction/api';
import { couponName } from '@/features/calculators/fee';
import type { CalculatorDef } from '@/features/calculators/schema';
import { resetSettingsForTest } from '@/lib/userSettings';
import { CalculatorListPage, CalculatorPage } from '@/pages/CalculatorPages';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** 1일 중위는 쿠폰마다 최저가의 2배로 답한다. */
vi.mock('@/features/market/api', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  canLookupMarket: () => true,
  useMarketRecentQuery: (names: readonly string[], enabled = true) => ({
    items: enabled
      ? Object.fromEntries(
          names.map((name) => [
            name,
            { n: 3, qty: 3, lo: 1, hi: 1, mid: (COUPON_PRICES[name] ?? 0) * 2, avg: 1, last: '2026-10-01T00:00:00Z' },
          ]),
        )
      : {},
    isLoading: false,
    failed: false,
    updated: new Date(Date.now() - 6 * 60_000).toISOString(),
  }),
}));

/** 경매장 쿠폰 최저가. */
const COUPON_PRICES: Record<string, number> = {
  [couponName(10)]: 400_000,
  [couponName(20)]: 900_000,
  [couponName(30)]: 1_300_000,
  [couponName(50)]: 2_000_000,
  [couponName(100)]: 4_000_000,
};

let search = '';
function Watcher() {
  search = useLocation().search;
  return null;
}

function renderAt(url: string, ui: React.ReactElement = <CalculatorPage id="fee" />, path = '/fee-calculator') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Watcher />
          <Routes>
            <Route path={path} element={ui} />
            <Route path="/calculators" element={<CalculatorListPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

function wideScreen() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsForTest();
  search = '';
  vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
    auction_item: COUPON_PRICES[itemName ?? '']
      ? [
          {
            item_name: itemName ?? '',
            item_display_name: itemName ?? '',
            item_count: 1,
            auction_item_category: '기타',
            auction_price_per_unit: COUPON_PRICES[itemName ?? ''],
            date_auction_expire: '2026-10-02T00:00:00Z',
          },
        ]
      : [],
    next_cursor: null,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(fetchAuctionList).mockReset();
  window.localStorage.clear();
  resetSettingsForTest();
});

const result = () => screen.getByRole('region', { name: '계산 결과' });

describe('경매장 수수료 계산기', () => {
  it('판매가를 넣으면 가장 유리한 쿠폰과 수령액을 보여 준다', async () => {
    renderAt('/fee-calculator');

    // 1억 골드, 쿠폰 시세는 위 표. 100% 쿠폰이 500만 - 400만 = 100만 이득으로 가장 남는다.
    await waitFor(() => expect(within(result()).getByText('100% 할인')).toBeInTheDocument());
    expect(within(result()).getByText('96,000,000 G')).toBeInTheDocument();
  });

  it('직접 넣은 쿠폰 값과 멤버십은 메뉴로 다시 들어와도 남아 있고, 판매가는 기본값으로 돌아간다', async () => {
    const first = renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');
    fireEvent.change(screen.getByLabelText('10% 쿠폰 값'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('checkbox', { name: /프리미엄 라이프/ }));
    fireEvent.change(screen.getByLabelText('판매가'), { target: { value: '5000000' } });
    await waitFor(() => expect(search).toContain('c10=123456'));
    first.unmount();

    // 주소에 쿼리가 없는 채로 다시 들어온다.
    renderAt('/fee-calculator');

    expect(await screen.findByLabelText('10% 쿠폰 값')).toHaveValue('123,456');
    expect(screen.getByRole('checkbox', { name: /프리미엄 라이프/ })).toBeChecked();
    expect(screen.getByLabelText('판매가')).toHaveValue('100,000,000');
  });

  it('공유 링크의 쿠폰 값이 이기고, 링크를 열어도 내 저장값은 바뀌지 않는다', async () => {
    const mine = renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');
    fireEvent.change(screen.getByLabelText('10% 쿠폰 값'), { target: { value: '123456' } });
    await waitFor(() => expect(search).toContain('c10=123456'));
    mine.unmount();

    const shared = renderAt('/fee-calculator?c10=7000');
    expect(await screen.findByLabelText('10% 쿠폰 값')).toHaveValue('7,000');
    shared.unmount();

    renderAt('/fee-calculator');
    expect(await screen.findByLabelText('10% 쿠폰 값')).toHaveValue('123,456');
  });

  it('쿠폰 값을 비우면 시세로 돌아가고 다음에도 비어 있다', async () => {
    const first = renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');
    fireEvent.change(screen.getByLabelText('10% 쿠폰 값'), { target: { value: '123456' } });
    await waitFor(() => expect(search).toContain('c10=123456'));
    fireEvent.click(await screen.findAllByRole('button', { name: '시세로 되돌리기' }).then((buttons) => buttons[0]));
    await waitFor(() => expect(search).not.toContain('c10='));
    first.unmount();

    renderAt('/fee-calculator');

    expect(await screen.findByLabelText('10% 쿠폰 값')).toHaveValue('');
  });

  it('판매가를 바꾸면 결과가 바뀌고 주소에 실린다', async () => {
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');

    // 판매가가 낮으면 할인액이 쿠폰 값보다 작아 쿠폰을 쓰지 않는다.
    fireEvent.change(screen.getByLabelText('판매가'), { target: { value: '1000000' } });

    await waitFor(() => expect(within(result()).getByText('쿠폰 안 씀')).toBeInTheDocument());
    expect(within(result()).getByText('950,000 G')).toBeInTheDocument();
    await waitFor(() => expect(search).toContain('price=1000000'));
  });

  it('판매가 옆에 입력한 금액을 한글로 적는다', async () => {
    renderAt('/fee-calculator');
    expect(await screen.findByText('(1억)')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('판매가'), { target: { value: '30000456' } });

    expect(await screen.findByText('(3천만 456)')).toBeInTheDocument();
  });

  it('주소의 입력으로 같은 결과를 다시 만든다', async () => {
    renderAt('/fee-calculator?price=1000000&premium=1');

    // 프리미엄은 수수료 4%.
    await waitFor(() => expect(within(result()).getByText('960,000 G')).toBeInTheDocument());
    expect(screen.getByRole('checkbox', { name: /프리미엄/ })).toBeChecked();
    expect(screen.getByLabelText('판매가')).toHaveValue('1,000,000');
  });

  it('잘못된 주소 값은 기본으로 돌리고 오류 없이 뜬다', async () => {
    renderAt('/fee-calculator?price=abc&people=-3&premium=maybe');

    expect(await screen.findByRole('heading', { name: '경매장 수수료 계산기' })).toBeInTheDocument();
    expect(screen.getByLabelText('판매가')).toHaveValue('100,000,000');
  });

  it('빠른 증가 단추가 금액을 올린다', async () => {
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');

    fireEvent.click(screen.getByRole('button', { name: '판매가 +1억' }));

    expect(screen.getByLabelText('판매가')).toHaveValue('200,000,000');
  });

  it('쿠폰 값 칸은 비워 두면 시세를 보이고, 직접 넣으면 덮어쓴다', async () => {
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');

    const field = screen.getByLabelText('100% 쿠폰 값');
    expect(field).toHaveAttribute('placeholder', '시세 4,000,000 G');

    fireEvent.change(field, { target: { value: '99000000' } });

    // 쿠폰이 너무 비싸 쓰지 않는다.
    await waitFor(() => expect(within(result()).queryByText('100% 할인')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '시세로 되돌리기' }));
    await waitFor(() => expect(within(result()).getByText('100% 할인')).toBeInTheDocument());
  });

  it('시세 기준을 1일 중위로 바꾸면 그 값으로 다시 계산하고 주소에 실린다', async () => {
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');

    fireEvent.click(screen.getByRole('radio', { name: '1일 중위' }));

    // 중위는 최저가의 2배라 100% 쿠폰 값이 800만. 500만 수수료를 아끼므로 쿠폰을 쓰지 않는다.
    await waitFor(() => expect(within(result()).getByText('쿠폰 안 씀')).toBeInTheDocument());
    expect(search).toContain('basis=mid');
    expect(screen.getByText(/6분 전에 시세/)).toBeInTheDocument();
  });

  it('결과 복사와 공유 링크가 클립보드에 넣는다', async () => {
    const writeText = vi.fn(async (_text: string) => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    renderAt('/fee-calculator?price=1000000');
    await within(result()).findByText('쿠폰 안 씀');

    fireEvent.click(screen.getByRole('button', { name: '결과 복사' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const text = writeText.mock.calls[0][0];
    expect(text).toContain('경매장 수수료');
    expect(text).toContain('수령액: 950,000 G');

    fireEvent.click(screen.getByRole('button', { name: '공유 링크' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
  });

  it('결과 옆 도움말에 계산식이 있다', async () => {
    renderAt('/fee-calculator');

    expect(await screen.findByLabelText(/계산식: 수수료 = 판매가 × 5%/)).toBeInTheDocument();
  });

  it('상세 내역은 접혀 있다가 열면 쿠폰별 표가 보인다', async () => {
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');
    expect(screen.queryByRole('columnheader', { name: '쿠폰 값' })).toBeNull();

    fireEvent.click(screen.getByText('상세 내역'));

    expect(await screen.findByRole('columnheader', { name: '쿠폰 값' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: '이 쿠폰이 유리한 판매가' })).toBeInTheDocument();
  });

  it('좁은 화면에서는 핵심 숫자를 화면 아래 고정 바에도 보인다', async () => {
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');

    const bar = screen.getByRole('status', { name: '핵심 결과' });

    expect(bar).toHaveTextContent('가장 유리한 쿠폰');
    expect(bar).toHaveTextContent('96,000,000 G');
    expect(bar).toHaveStyle({ position: 'fixed' });
  });

  it('넓은 화면에서는 고정 바 없이 결과가 스크롤을 따라온다', async () => {
    wideScreen();
    renderAt('/fee-calculator');
    await within(result()).findByText('100% 할인');

    expect(screen.queryByRole('status', { name: '핵심 결과' })).toBeNull();
    expect(result().parentElement).toHaveStyle({ position: 'sticky' });
  });

  it('관련 화면 칩이 있다', async () => {
    renderAt('/fee-calculator');

    expect(await screen.findByRole('link', { name: '경매장' })).toHaveAttribute('href', '/auction');
    expect(screen.getByRole('link', { name: '다른 계산기' })).toHaveAttribute('href', '/calculators');
  });
});

describe('계산기 목록', () => {
  it('계산기마다 카드가 있고 누르면 그 계산기로 간다', () => {
    renderAt('/calculators', <CalculatorListPage />, '/calculators');

    expect(screen.getByRole('link', { name: '경매장 수수료 계산기' })).toHaveAttribute('href', '/fee-calculator');
  });

  it('모르는 계산기는 목록으로 보낸다', async () => {
    renderAt('/zzz-calculator', <CalculatorPage id="zzz" />, '/zzz-calculator');

    expect(await screen.findByRole('heading', { name: '계산기' })).toBeInTheDocument();
  });
});

describe('새 계산기를 스키마와 계산 함수만으로 더한다', () => {
  /** 틀이 주는 것만 쓰는 두 번째 계산기. 입력 스키마와 계산 함수뿐이다. */
  const DOUBLE: CalculatorDef = {
    id: 'double',
    title: '두 배',
    summary: '금액을 두 배로 만든다.',
    fields: [
      { type: 'gold', key: 'amount', label: '금액', default: 1_000, quick: [1_000] },
      { type: 'number', key: 'times', label: '횟수', default: 2, min: 1, max: 9, suffix: '번' },
      { type: 'toggle', key: 'tax', label: '세금 10%', default: false },
    ],
    compute: (values) => {
      const amount = Number(values.amount ?? 0);
      const gross = amount * Number(values.times);
      return {
        headline: [{ label: '합계', gold: values.tax === true ? Math.floor(gross * 0.9) : gross, strong: true }],
        formula: '합계 = 금액 × 횟수',
      };
    },
  };

  it('입력칸, 결과, 주소 반영을 틀이 그려 준다', async () => {
    renderAt('/double-calculator?times=3', <CalculatorView def={DOUBLE} />, '/double-calculator');

    expect(await screen.findByRole('heading', { name: '두 배 계산기' })).toBeInTheDocument();
    expect(within(result()).getByText('3,000 G')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('checkbox', { name: '세금 10%' }));

    expect(within(result()).getByText('2,700 G')).toBeInTheDocument();
    await waitFor(() => expect(search).toContain('tax=1'));
    // 시세를 쓰지 않는 계산기에는 시세 기준 선택이 없다.
    expect(screen.queryByRole('radiogroup', { name: '시세 기준' })).toBeNull();
    await act(async () => undefined);
  });
});
