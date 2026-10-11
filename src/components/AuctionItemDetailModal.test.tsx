import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionItemDetailModal, type AuctionItemDetail } from '@/components/AuctionItemDetailModal';
import type * as Settings from '@/lib/settings';

// 대부분의 시험은 워커가 없는 환경이다. 미리보기 시험만 주소를 둔다.
const proxy = vi.hoisted(() => ({ url: '' }));

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => proxy.url,
}));

const DETAIL: AuctionItemDetail = {
  displayName: '글라디우스',
  rawName: '@글라디우스',
  category: '검',
  count: 1,
  pricePerUnit: 599,
  options: [
    { option_type: '공격', option_value: '17', option_value2: '34' },
    { option_type: '크리티컬', option_value: '15%' },
    { option_type: '밸런스', option_value: '49%' },
    { option_type: '내구력', option_value: '15', option_value2: '15' },
    { option_type: '숙련', option_value: '0' },
  ],
  timeLabel: '만료',
  timeValue: '2026-09-24T11:24:00.000Z',
  showRemaining: true,
};

function renderModal(detail: AuctionItemDetail | null) {
  return render(
    <AppProviders>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <AuctionItemDetailModal detail={detail} onClose={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

describe('매물 상세 모달', () => {
  it('닫혀 있으면 아무것도 보이지 않는다', () => {
    renderModal(null);

    expect(screen.queryByText('글라디우스')).not.toBeInTheDocument();
  });

  it('이름과 카테고리를 보여 주고 원래 이름은 되풀이하지 않는다', () => {
    renderModal(DETAIL);

    expect(screen.getByText('글라디우스')).toBeInTheDocument();
    // 인챈트를 뗀 원래 이름은 회색으로 되풀이하지 않는다.
    expect(screen.queryByText('@글라디우스')).not.toBeInTheDocument();
    expect(screen.getByText('검')).toBeInTheDocument();
  });

  it('이 가격에 팔면 수령액을 볼 수 있게 수수료 계산기로 잇는다. 묶음이면 전체 값을 넘긴다', () => {
    renderModal({ ...DETAIL, count: 15, pricePerUnit: 1200 });

    expect(screen.getByRole('link', { name: /수수료 계산기에서 보기/ })).toHaveAttribute('href', '/fee-calculator?price=18000');
  });

  it('옵션을 잘라내지 않고 전부 보여 준다', () => {
    renderModal(DETAIL);

    /**
     * 표 안에서는 자리가 좁아 3개까지만 보여 준다. 줄을 눌러 여기까지 온 이유가
     * 나머지를 보려는 것이므로 여기서는 하나도 감추지 않는다.
     */
    for (const option of DETAIL.options ?? []) {
      expect(screen.getByText(option.option_type)).toBeInTheDocument();
    }
    expect(screen.getByText('17 ~ 34')).toBeInTheDocument();
  });

  it('옵션이 없으면 옵션 자리를 아예 그리지 않는다', () => {
    renderModal({ ...DETAIL, options: [] });

    expect(screen.queryByText(/세부 옵션이 없습니다/)).not.toBeInTheDocument();
    expect(screen.queryByText('17 ~ 34')).not.toBeInTheDocument();
  });


  it('색상은 숫자 대신 칠한 네모로 보여 준다', () => {
    renderModal({
      ...DETAIL,
      options: [
        { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '255,255,255' },
        { option_type: '아이템 색상', option_sub_type: '파트 D', option_value: '43,62,58' },
      ],
    });

    // 숫자 셋을 읽는 것보다 칠해진 네모를 보는 편이 빠르다.
    const swatch = screen.getByLabelText('아이템 색상 파트 D 43,62,58');
    expect(swatch).toHaveStyle({ background: 'rgb(43, 62, 58)' });
    expect(screen.getByLabelText('아이템 색상 파트 A 255,255,255')).toBeInTheDocument();

    // 다섯 칸의 option_type 이 모두 같으므로 파트 이름은 option_sub_type 에서 와야 한다.
    expect(screen.getByText('파트 A')).toBeInTheDocument();
    expect(screen.getByText('파트 D')).toBeInTheDocument();
  });

  it('읽을 수 없는 색상 값은 원래 문자열을 남긴다', () => {
    renderModal({
      ...DETAIL,
      options: [{ option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '알 수 없음' }],
    });

    expect(screen.getByText('알 수 없음')).toBeInTheDocument();
  });

  it('쉼표로 붙은 효과를 줄 단위로 끊어 보여 준다', () => {
    renderModal({
      ...DETAIL,
      options: [
        {
          option_type: '인챈트 접두',
          option_value: '파괴적인 (랭크 6)',
          option_desc: '수리비 200% 증가,체력 10 증가,최소대미지 40 증가',
        },
      ],
    });

    // 한 줄로 이어 두면 어디서 끊어 읽어야 할지 알 수 없다.
    expect(screen.getByText('수리비 200% 증가')).toBeInTheDocument();
    expect(screen.getByText('체력 10 증가')).toBeInTheDocument();
    expect(screen.getByText('최소대미지 40 증가')).toBeInTheDocument();
  });

  it('옵션을 종류별로 묶어 보여 준다', () => {
    renderModal(DETAIL);

    expect(screen.getByText('기본 능력')).toBeInTheDocument();
  });

  it('거래 내역처럼 지난 시각이면 남은 시간을 내세우지 않는다', () => {
    renderModal({ ...DETAIL, timeLabel: '거래 시각', showRemaining: false });

    expect(screen.getAllByText('거래 시각').length).toBeGreaterThan(0);
    expect(screen.queryByText('남은 시간')).not.toBeInTheDocument();
  });

  it('아이템 정보로 가는 단추를 둔다', () => {
    renderModal(DETAIL);

    const link = screen.getByRole('link', { name: /아이템 정보 보기/ });
    // 경매장 이름 앞의 @ 는 떼고 아이템 정보의 이름으로 보낸다.
    expect(link).toHaveAttribute('href', '/item/글라디우스?category=%EA%B2%80');
    expect(screen.getByText(/장비 시뮬레이터에서/)).toBeInTheDocument();
  });

  it('장비가 아니어도 아이템 정보로 갈 수 있다', () => {
    renderModal({ ...DETAIL, category: '포션' });

    expect(screen.getByRole('link', { name: /아이템 정보 보기/ })).toHaveAttribute(
      'href',
      '/item/글라디우스?category=%ED%8F%AC%EC%85%98',
    );
    expect(screen.queryByText(/장비 시뮬레이터에서/)).not.toBeInTheDocument();
  });
});

describe('인챈트 스크롤 매물', () => {
  const SPEC = '마나실드 사용 중일 때 최대대미지 7~12 증가';
  const SCROLL: AuctionItemDetail = {
    displayName: '개방된 전용 인챈트 스크롤 - 나비',
    rawName: '개방된 전용 인챈트 스크롤',
    category: '인챈트 스크롤',
    count: 1,
    pricePerUnit: 870,
    options: [
      { option_type: '내구도', option_value: '100%' },
      { option_type: '인챈트 종류', option_sub_type: '접미', option_value: '나비 (랭크 A)' },
    ],
    timeLabel: '만료',
    timeValue: '2026-10-03T09:00:00.000Z',
    showRemaining: true,
  };

  afterEach(() => vi.unstubAllGlobals());

  function renderScroll(detail: AuctionItemDetail) {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('data/enchant-scrolls.json')
          ? new Response(
              JSON.stringify({
                scrolls: {
                  '인챈트 스크롤 - 나비': [
                    { slot: 1, level: 6, desc: [SPEC], alt: '버터플라이' },
                    { slot: 0, level: 6, desc: ['접두 쪽 사양'] },
                  ],
                },
              }),
            )
          : new Response('not found', { status: 404 }),
      ),
    );
    return render(
      <AppProviders>
        <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
          <MemoryRouter>
            <AuctionItemDetailModal detail={detail} onClose={vi.fn()} />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProviders>,
    );
  }

  it('개방된 전용 스크롤은 같은 이름 인챈트의 사양을 옵션의 접두/접미와 랭크에 맞춰 보여 준다', async () => {
    renderScroll(SCROLL);

    expect(await screen.findByText(SPEC)).toBeInTheDocument();
    expect(screen.getByText('버터플라이')).toBeInTheDocument();
    expect(screen.queryByText('접두 쪽 사양')).toBeNull();
  });

  it('인챈트 스크롤이 아닌 매물에는 사양 자리를 그리지 않는다', () => {
    const { container } = renderModal(DETAIL);

    expect(container.ownerDocument.querySelector('.ant-skeleton')).toBeNull();
  });
});

describe('매물 상세의 공식 미리보기', () => {
  afterEach(() => {
    proxy.url = '';
  });

  it('인챈트를 뗀 이름으로 미리보기를 찾아 설명 아래에 둔다', async () => {
    proxy.url = 'https://w.example';
    const asked: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: URL | string) => {
        const url = new URL(String(input));
        if (url.pathname !== '/news/preview') return new Response('{}', { status: 404 });
        asked.push(url.searchParams.get('name') ?? '');
        return Response.json({
          name: '글라디우스',
          kind: 'image',
          url: 'https://icons.example/previews/a.webp',
          postId: 1,
          title: '박스',
        });
      }),
    );
    renderModal({ ...DETAIL, displayName: '[접두] 글라디우스' });

    const image = await screen.findByRole('img', { name: '글라디우스 공식 미리보기' });
    expect(asked).toEqual(['글라디우스']);
    const price = screen.getByText('가격');
    expect(image.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
