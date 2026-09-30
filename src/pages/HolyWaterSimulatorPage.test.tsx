import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { fetchAuctionList } from '@/features/auction/api';
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

  it('특정 효과 기댓값은 떠 있는 계산기에서 센다', async () => {
    renderPage();
    await screen.findByText(/성수 최저가 2,500,000/);
    fireEvent.click(screen.getByRole('button', { name: /특정 효과 기댓값/ }));
    fireEvent.mouseDown(await screen.findByLabelText('특정 효과'));
    fireEvent.click(
      await screen.findByText('4대 속성 연금 대미지', {
        selector: '.ant-select-item-option-content',
      }),
    );

    // 고르면 최대치(50)부터: 1/102 x 1/10 = 1/1020. 10번이면 1 - (1019/1020)^10 = 0.976%.
    expect(screen.getByText(/^한 번에/)).toHaveTextContent('한 번에 0.098%, 평균 1,020번에 한 번');
    expect(screen.getByRole('region', { name: '바르기 횟수별 확률' })).toHaveTextContent(
      '한 번 이상 나올 확률 0.976%',
    );
    expect(screen.getByRole('region', { name: '바르기 횟수별 확률' })).toHaveTextContent(
      '25,000,000 G',
    );

    // 41 이상이면 E 한 장 전부: 1/102.
    fireEvent.change(screen.getByLabelText('특정 효과의 가장 낮은 수치'), {
      target: { value: '41' },
    });
    await waitFor(() =>
      expect(screen.getByText(/^한 번에/)).toHaveTextContent('한 번에 0.98%, 평균 102번에 한 번'),
    );

    fireEvent.click(screen.getByRole('button', { name: '특정 효과 기댓값 닫기' }));
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: '바르기 횟수별 확률' })).not.toBeInTheDocument(),
    );
  });
});
