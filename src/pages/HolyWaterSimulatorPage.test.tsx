import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
import { oddsCounts } from '@/features/holyWater/odds';
import { tierChance } from '@/features/holyWater/simulator';
import { formatChance } from '@/features/simulator/trials';
import { HolyWaterSimulatorPage } from '@/pages/HolyWaterSimulatorPage';

vi.mock('@/features/auction/api', () => ({ fetchAuctionList: vi.fn() }));

/** antd 표를 여러 번 다시 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

/** 연출이 끝나 통계가 올라갈 때까지 기다리는 시간. 금빛까지 더해도 넉넉하다. */
const FX_WAIT = 4000;

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/holy-water-simulator']}>
          <HolyWaterSimulatorPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** 최대 대미지 E(25~30, 다섯 번째 스크롤)가 폭 안의 step 번째 수치로 나오게 한다. 누르기 바로 앞에서 건다. */
function rigMaxDamageE(step: number) {
  return vi
    .spyOn(Math, 'random')
    .mockReturnValueOnce(4.5 / 102)
    .mockReturnValueOnce((step + 0.5) / 6);
}

const latest = () => screen.getByRole('region', { name: /^방금 붙은 효과/ });

describe('무리아스의 성수 시뮬레이터', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item:
        itemName === '무리아스의 성수'
          ? [
              {
                item_name: itemName,
                item_display_name: itemName,
                item_count: 3,
                auction_item_category: '포션',
                auction_price_per_unit: 2_500_000,
                date_auction_expire: '2026-09-30T00:00:00Z',
              },
            ]
          : [],
      next_cursor: null,
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchAuctionList).mockReset();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('붙은 효과와 수치, 등급을 보이고 쓴 골드를 성수 최저가로 센다', async () => {
    renderPage();
    expect(within(latest()).getByText('아직 바르지 않았습니다.')).toBeInTheDocument();
    expect(await screen.findByText(/성수 최저가 2,500,000/)).toBeInTheDocument();

    rigMaxDamageE(5);
    fireEvent.click(screen.getByRole('button', { name: '바르기' }));
    expect(within(latest()).getByText('최대 대미지')).toBeInTheDocument();
    // 단계 글자와 폭은 확률을 세는 데만 쓰고 보이지 않는다.
    expect(latest()).not.toHaveTextContent(/최대 대미지 E|25~30/);
    expect(within(latest()).getByText('+30')).toBeInTheDocument();
    expect(within(latest()).getByText('98% 이상')).toBeInTheDocument();

    expect(await screen.findByText('바른 기록 1번', {}, { timeout: FX_WAIT })).toBeInTheDocument();
    expect(screen.getByText('쓴 골드').closest('.ant-statistic')).toHaveTextContent('2,500,000 G');

    fireEvent.click(screen.getByRole('button', { name: /처음부터/ }));
    expect(within(latest()).getByText('아직 바르지 않았습니다.')).toBeInTheDocument();
  });

  it('등급이 오를수록 연출이 더해지고, 98% 이상만 금빛이 돈다', () => {
    renderPage();
    // 27 은 최대치 30 의 90% 다.
    rigMaxDamageE(2);
    fireEvent.click(screen.getByRole('button', { name: '바르기' }));
    const stage = () => document.querySelector('.hw-stage')!;
    expect(stage().className).toContain('hw-play');
    expect(stage().className).toContain('hw-t50');
    expect(stage().className).toContain('hw-t90');
    expect(stage().className).not.toContain('hw-t95');
    expect(document.querySelector('.hw-gold-layer')).toBeNull();
    // 27 이상은 최대 대미지 가운데 4/30, 한 번에 (4/6)/102 = 1/153.
    expect(latest()).toHaveTextContent('상위 13.33%');
    expect(latest()).toHaveTextContent('평균 153번에 한 번');
    expect(latest()).toHaveTextContent('1번째처음 붙음');

    rigMaxDamageE(5);
    fireEvent.click(screen.getByRole('button', { name: '바르기' }));
    expect(stage().className).toContain('hw-t95');
    expect(stage().className).toContain('hw-t98');
    expect(document.querySelector('.hw-gold-layer')).not.toBeNull();
    expect(latest()).toHaveTextContent('0.163%평균 612번에 한 번');
    expect(latest()).toHaveTextContent('2번째새 최고, 이전 +27');

    // 최대 대미지 A 의 1 은 등급이 없어 기본 연출만 돈다.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.5 / 102)
      .mockReturnValueOnce(0);
    fireEvent.click(screen.getByRole('button', { name: '바르기' }));
    expect(stage().className).toContain('hw-play');
    expect(stage().className).not.toContain('hw-t50');
    expect(latest()).toHaveTextContent('3번째최고 +30');
  });

  it('최대 대미지 29 도 30 처럼 최상위(98% 이상)로 금빛이 돈다', () => {
    renderPage();
    rigMaxDamageE(4);
    fireEvent.click(screen.getByRole('button', { name: '바르기' }));
    expect(within(latest()).getByText('+29')).toBeInTheDocument();
    expect(within(latest()).getByText('98% 이상')).toBeInTheDocument();
    expect(document.querySelector('.hw-stage')!.className).toContain('hw-t98');
    expect(document.querySelector('.hw-gold-layer')).not.toBeNull();
  });

  it('10번 바르기는 연출 없이 목록으로 보인다', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '10번 바르기' }));
    expect(document.querySelector('.hw-play')).toBeNull();
    expect(screen.getByRole('region', { name: '방금 붙은 효과 10개' })).toHaveTextContent(
      /50% 이상\d+개90% 이상\d+개95% 이상\d+개98% 이상\d+개/,
    );
    expect(screen.getByText('바른 기록 10번')).toBeInTheDocument();
  });
});

describe('성수 확률과 비용', () => {
  const PRICE = 2_500_000;

  function stubMarket(price: number | null) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
    vi.mocked(fetchAuctionList).mockImplementation(async ({ itemName }) => ({
      auction_item:
        itemName === '무리아스의 성수' && price !== null
          ? [
              {
                item_name: itemName,
                item_display_name: itemName,
                item_count: 3,
                auction_item_category: '포션',
                auction_price_per_unit: price,
                date_auction_expire: '2026-09-30T00:00:00Z',
              },
            ]
          : [],
      next_cursor: null,
    }));
  }

  beforeEach(() => stubMarket(PRICE));

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(fetchAuctionList).mockReset();
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  const odds = () => screen.getByRole('region', { name: '확률과 비용' });
  const won = (n: number) => `${n.toLocaleString('ko-KR')} G`;

  it('제목 옆에 추정치 배지가 있고, 올리면 확률의 출처와 계산 방식을 알려 준다', async () => {
    renderPage();

    const badge = within(odds()).getByLabelText('추정치, 확률의 출처와 계산 방식');
    expect(badge).toHaveTextContent('추정치');
    fireEvent.mouseEnter(badge);

    expect(await screen.findByText(/공식 확률이 아닙니다/)).toBeInTheDocument();
    expect(screen.getByText(/102장을 같은 확률로 고르고/)).toBeInTheDocument();
  });

  it('구간마다 평균, 절반, 90% 확률 횟수와 그 횟수의 비용이 보인다', async () => {
    renderPage();
    await screen.findByText(/성수 최저가 2,500,000/);

    const chance = tierChance(98);
    const counts = oddsCounts(chance)!;
    const group = within(odds()).getByRole('group', { name: '98% 이상' });

    expect(group).toHaveTextContent(`확률 ${formatChance(chance)}`);
    expect(group).toHaveTextContent(`${counts.mean}번에 한 번`);
    expect(group).toHaveTextContent(won(counts.mean * PRICE));
    expect(group).toHaveTextContent(`${counts.half}번 안`);
    expect(group).toHaveTextContent(won(counts.half * PRICE));
    expect(group).toHaveTextContent(`${counts.ninety}번 안`);
    expect(group).toHaveTextContent(won(counts.ninety * PRICE));
  });

  it('네 구간이 모두 있다', async () => {
    renderPage();

    for (const tier of [50, 90, 95, 98]) {
      expect(within(odds()).getByRole('group', { name: `${tier}% 이상` })).toBeInTheDocument();
    }
  });

  /** 확률과 비용 카드에서 현재 내 효과와 수치를 고른다. */
  async function pickMine(effect: string, value: number) {
    fireEvent.mouseDown(within(odds()).getByLabelText('현재 내 효과'));
    fireEvent.click(
      await screen.findByText(effect, { selector: '.ant-select-item-option-content' }),
    );
    fireEvent.change(within(odds()).getByLabelText('현재 내 수치'), {
      target: { value: String(value) },
    });
  }

  it('현재 내 효과와 수치를 고르면 그보다 높게 나올 확률과 횟수, 비용이 계산된다', async () => {
    renderPage();
    await screen.findByText(/성수 최저가 2,500,000/);

    // 최대 대미지 27 보다 높게는 28~30: E 한 장의 3/6 이라 (3/6)/102 = 1/204.
    await pickMine('최대 대미지', 27);
    const chance = 3 / 6 / 102;
    const counts = oddsCounts(chance)!;
    const group = await within(odds()).findByRole('group', { name: '최대 대미지 27 초과' });
    expect(group).toHaveTextContent(`확률 ${formatChance(chance)}`);
    expect(group).toHaveTextContent('204번에 한 번');
    expect(group).toHaveTextContent(won(counts.ninety * PRICE));
    expect(group).toHaveTextContent('지금까지 0번');
  });

  it('시행 횟수를 넣으면 그 안에 한 번 이상 나올 확률과 나오는 횟수를 센다', async () => {
    renderPage();
    await screen.findByText(/성수 최저가 2,500,000/);

    // 4대 속성 연금 대미지 49 보다 높게는 50 하나: 1/1020. 10번이면 1 - (1019/1020)^10 = 0.976%.
    await pickMine('4대 속성 연금 대미지', 49);
    let group = await within(odds()).findByRole('group', { name: '4대 속성 연금 대미지 49 초과' });
    expect(group).toHaveTextContent('1,020번에 한 번');
    expect(group).toHaveTextContent('10번 하면');
    expect(group).toHaveTextContent('한 번 이상 0.976%');
    expect(odds()).toHaveTextContent(won(10 * PRICE));

    // 40 보다 높게는 E 한 장 전부: 1/102. 102번이면 평균 1번 나온다.
    fireEvent.change(within(odds()).getByLabelText('현재 내 수치'), { target: { value: '40' } });
    fireEvent.change(within(odds()).getByLabelText('시행 횟수'), { target: { value: '102' } });
    group = await within(odds()).findByRole('group', { name: '4대 속성 연금 대미지 40 초과' });
    expect(group).toHaveTextContent('102번 하면');
    expect(group).toHaveTextContent('평균 1번 나옴');
  });

  it('더 높은 수치가 없으면 그렇게 알린다', async () => {
    renderPage();

    await pickMine('최대 대미지', 30);
    const group = await within(odds()).findByRole('group', { name: '최대 대미지 30 초과' });
    expect(group).toHaveTextContent('이 수치보다 높게는 나오지 않습니다.');
  });

  it('지금까지 바른 것 가운데 내 수치보다 높게 나온 횟수를 센다', async () => {
    window.localStorage.setItem('mabikuma:holyWaterFx', 'off');
    renderPage();
    await pickMine('최대 대미지', 27);

    // 최대 대미지 29 가 한 번 나온다.
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(4.5 / 102)
      .mockReturnValueOnce(4.5 / 6);
    fireEvent.click(screen.getByRole('button', { name: '바르기' }));
    expect(
      await within(odds()).findByRole('group', { name: '최대 대미지 27 초과' }),
    ).toHaveTextContent('지금까지 1번');
  });

  it('성수 가격을 직접 바꾸면 모든 비용이 다시 계산된다', async () => {
    renderPage();
    await screen.findByText(/성수 최저가 2,500,000/);
    expect(within(odds()).getByLabelText('성수 가격')).toHaveValue('2,500,000');

    fireEvent.change(within(odds()).getByLabelText('성수 가격'), { target: { value: '1000000' } });

    const counts = oddsCounts(tierChance(98))!;
    const group = within(odds()).getByRole('group', { name: '98% 이상' });
    expect(group).toHaveTextContent(won(counts.mean * 1_000_000));
    expect(group).toHaveTextContent(won(counts.ninety * 1_000_000));
    // 쓴 골드와 안내 줄도 같은 값을 쓴다.
    expect(screen.getByText(/직접 정한 성수 가격 1,000,000 G으로 셉니다\./)).toBeInTheDocument();
  });

  it('직접 바꾼 값은 경매장 최저가로 되돌릴 수 있다', async () => {
    renderPage();
    await screen.findByText(/성수 최저가 2,500,000/);
    fireEvent.change(within(odds()).getByLabelText('성수 가격'), { target: { value: '1000000' } });

    fireEvent.click(
      await within(odds()).findByRole('button', { name: /경매장 최저가 2,500,000 G로/ }),
    );

    const counts = oddsCounts(tierChance(98))!;
    expect(within(odds()).getByRole('group', { name: '98% 이상' })).toHaveTextContent(
      won(counts.mean * PRICE),
    );
    expect(screen.getByText(/성수 최저가 2,500,000/)).toBeInTheDocument();
  });

  it('성수 시세가 없으면 횟수만 보이고 비용은 비어 있다가, 가격을 넣으면 채워진다', async () => {
    stubMarket(null);
    renderPage();
    await screen.findByText('성수 시세가 없습니다.');

    const group = within(odds()).getByRole('group', { name: '98% 이상' });
    expect(group).not.toHaveTextContent(/\d G/);
    const counts = oddsCounts(tierChance(98))!;

    fireEvent.change(within(odds()).getByLabelText('성수 가격'), { target: { value: '500000' } });

    expect(within(odds()).getByRole('group', { name: '98% 이상' })).toHaveTextContent(
      won(counts.mean * 500_000),
    );
  });

  it('넓은 화면에서는 표로 그린다', async () => {
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
    renderPage();

    for (const name of ['구간', '확률', '평균', '절반 확률로', '90% 확률로', '10번 하면']) {
      expect(within(odds()).getByRole('columnheader', { name })).toBeInTheDocument();
    }
    expect(within(odds()).getAllByRole('row')).toHaveLength(5);
  });
});
