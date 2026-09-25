import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ItemsPage } from '@/pages/ItemsPage';
import { LegacyRedirect } from '@/pages/LegacyRedirect';
import type { EquipmentLookup } from '@/features/equipment/types';
import type * as Settings from '@/lib/settings';

vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://worker.test',
}));

/** 이 화면은 antd 컴포넌트를 많이 그린다. 느린 기계에서 기본 제한 5초를 넘길 수 있다. */
vi.setConfig({ testTimeout: 20_000 });

/** 워커가 돌려주는 모양 그대로. 값은 2026-09 게임 데이터에서 줄여 옮겼다. */
const LOOKUP: EquipmentLookup = {
  item: {
    id: 1000059,
    name: '소울 리버레이트 소드',
    category: '검',
    base: { attack_min: 89, attack_max: 139, critical: 10 },
    random: [['attack_max', 0, 10]],
    upgrade: { max: 2, gemMax: 0, ids: [52507] },
    reforge: { type: 'OHSword', races: 'heg' },
    special: { s: 201, r: 301, max: 8 },
  },
  upgrades: {
    52507: {
      name: '소울 리버레이트 소드 전용 개조 1',
      ep: 100,
      gold: 99000,
      min: 0,
      max: 0,
      stats: [['attack_max', 30, 30]],
      npcs: ['네리스', '퍼거스'],
      npcUnknown: 1,
    },
  },
  enchants: [
    {
      id: 21643,
      name: '거침없는',
      slot: 0,
      level: 10,
      desc: ['양손 무기에 인챈트 가능', '윈드밀 랭크 3단 이상일 때 최대 대미지 50~60 증가'],
      effects: [['attack_max', 50, 60, 1]],
      personal: true,
    },
  ],
  abilities: [
    {
      id: 1,
      name: '체력',
      unit: '증가',
      init: 1.5,
      per: 1.5,
      std: 1,
      lv: [20, 10, 5],
      lb: true,
      types: ['OHSword'],
      races: 'heg',
    },
  ],
  levels: [[10, 1, 3, 1, 6, 1, 10, 11, 12]],
  updated: '2026-09-24',
};

let lookup: EquipmentLookup = LOOKUP;

beforeEach(() => {
  lookup = LOOKUP;
  // jsdom 에는 화면 이동이 없다. 상세로 넘어갈 때 맨 위로 올리는 호출을 비워 둔다.
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/item-equip?')) return new Response(JSON.stringify(lookup));
      if (url.endsWith('data/items/names.json')) {
        return new Response(
          JSON.stringify({
            updated: '2026-09-24',
            categories: ['검', '포션'],
            items: [
              ['소울 리버레이트 소드', 0],
              ['생명력 50 포션', 1],
            ],
          }),
        );
      }
      // 카드는 이 시험의 관심사가 아니다. 없다고 답한다.
      return new Response('not found', { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(path: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/items" element={<ItemsPage />} />
            <Route path="/dictionary" element={<LegacyRedirect to="/items" />} />
            <Route path="/equipment" element={<LegacyRedirect to="/items" />} />
          </Routes>
          <CurrentUrl />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** 지금 주소를 화면에 적어 둔다. 어디로 넘어갔는지 확인하려는 것이다. */
function CurrentUrl() {
  const location = useLocation();
  return (
    <output data-testid="url">{decodeURIComponent(location.pathname + location.search)}</output>
  );
}

/** 목록 표의 줄. 검색어를 치면 같은 이름이 자동완성 칸에도 떠서 표 쪽만 고른다. */
async function findListRow(name: string): Promise<HTMLElement> {
  const matches = await screen.findAllByText(name);
  const row = matches.map((element) => element.closest('tr')).find(Boolean);
  expect(row).toBeTruthy();
  return row as HTMLElement;
}

const SWORD_PATH = `/items?category=${encodeURIComponent('검')}&name=${encodeURIComponent('소울 리버레이트 소드')}`;

describe('아이템 정보 목록', () => {
  it('카테고리를 고르지 않아도 전체에서 이름으로 찾는다', async () => {
    renderPage('/items');

    expect(await screen.findByText(/이름을 입력하거나 카테고리를 고르면/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('이름으로 찾기'), { target: { value: '포션' } });

    // 전체에서 찾을 때는 어느 카테고리의 줄인지 같이 적는다.
    const row = await findListRow('생명력 50 포션');
    expect(within(row).getByText('포션')).toBeInTheDocument();
    expect(screen.queryByText('소울 리버레이트 소드')).not.toBeInTheDocument();
  });

  it('초성으로도 찾는다', async () => {
    renderPage('/items');

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), { target: { value: 'ㅅㅇㄹㅂ' } });

    expect(await findListRow('소울 리버레이트 소드')).toBeInTheDocument();
  });

  it('고른 카테고리에 맞는 이름이 없으면 전체에서 찾고 그렇다고 알린다', async () => {
    // 포션을 고른 것을 잊고 무기 이름을 쳐도 빈 화면이 아니라 검 카테고리의 무기가 나와야 한다.
    renderPage('/items?category=포션');

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), { target: { value: 'ㅅㅇㄹㅂ' } });

    expect(await findListRow('소울 리버레이트 소드')).toBeInTheDocument();
    expect(screen.getByText(/포션에는 "ㅅㅇㄹㅂ" 와 맞는 이름이 없어 전체/)).toBeInTheDocument();
  });

  it('자동완성에서 고르면 그 아이템 상세로 바로 간다', async () => {
    renderPage('/items');

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), { target: { value: '소울' } });
    const matches = await screen.findAllByText('소울 리버레이트 소드');
    const option = matches.map((element) => element.closest('.ant-select-item-option')).find(Boolean);
    fireEvent.click(option as HTMLElement);

    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=검&name=소울 리버레이트 소드');
    expect(await screen.findByText('장비 미리보기')).toBeInTheDocument();
  });

  it('카테고리 트리에 고르지 않음 줄이 없다', async () => {
    renderPage('/items');

    await screen.findByLabelText('이름으로 찾기');
    expect(screen.queryByText('고르지 않음')).not.toBeInTheDocument();
  });

  it('전체에서 찾다 상세를 열고 돌아와도 치던 검색어가 그대로다', async () => {
    renderPage('/items');

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), { target: { value: '포션' } });
    fireEvent.click(await findListRow('생명력 50 포션'));
    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=포션&name=생명력 50 포션');

    fireEvent.click(await screen.findByRole('link', { name: '목록' }));
    expect(screen.getByTestId('url')).toHaveTextContent(/^\/items$/);
    expect(screen.getByLabelText('이름으로 찾기')).toHaveValue('포션');
  });
});

describe('아이템 정보의 장비 시뮬레이터', () => {
  it('장비 카테고리의 줄을 누르면 아이템 정보 안에서 시뮬레이터가 열린다', async () => {
    renderPage(`/items?category=${encodeURIComponent('검')}`);

    fireEvent.click(await screen.findByText('소울 리버레이트 소드'));

    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=검&name=소울 리버레이트 소드');
    expect(await screen.findByText('장비 미리보기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '검' })).toHaveAttribute(
      'href',
      `/items?category=${encodeURIComponent('검')}`,
    );
  });

  it('상세에서 카테고리로 돌아오면 치던 검색어가 그대로다', async () => {
    renderPage(`/items?category=${encodeURIComponent('검')}`);

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), { target: { value: '소울' } });
    fireEvent.click(await findListRow('소울 리버레이트 소드'));
    fireEvent.click(await screen.findByRole('link', { name: '검' }));

    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=검');
    expect(screen.getByLabelText('이름으로 찾기')).toHaveValue('소울');
  });

  it('장비가 아니면 그림과 설명을 보여 주는 상세가 열린다', async () => {
    renderPage(`/items?category=${encodeURIComponent('포션')}`);

    fireEvent.click(await screen.findByText('생명력 50 포션'));

    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=포션&name=생명력 50 포션');
    expect(await screen.findByRole('heading', { name: '생명력 50 포션' })).toBeInTheDocument();
    expect(screen.queryByText('장비 미리보기')).not.toBeInTheDocument();
  });

  it('예전 시뮬레이터 주소는 고른 조합을 그대로 들고 아이템 정보로 넘어간다', async () => {
    renderPage(
      `/equipment?category=${encodeURIComponent('검')}&name=${encodeURIComponent('소울 리버레이트 소드')}&sp=s7`,
    );

    expect(
      await screen.findAllByText('최소 공격력 +60, 최대 공격력 +120, 보너스 대미지 +5%'),
    ).not.toHaveLength(0);
    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=검');
  });

  it('예전 사전 주소도 아이템 정보로 넘어간다', async () => {
    renderPage(`/dictionary?category=${encodeURIComponent('포션')}`);

    expect(await screen.findByText('생명력 50 포션')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/items?category=포션');
  });

  it('주소에 담긴 조합을 불러와 최종 능력치에 더한다', async () => {
    // 유동 최대공 10, 첫 칸 전용 개조 1(+30). 139 + 10 + 30 = 179
    renderPage(`${SWORD_PATH}&rv=10&up=52507.`);

    // 유동 능력치 칸에도 같은 이름표가 있다. 표의 줄만 고른다.
    const labels = await screen.findAllByText('최대 공격력');
    const row = labels.map((label) => label.closest('tr')).find(Boolean);
    expect(row).toBeTruthy();
    expect(within(row as HTMLElement).getByText('179')).toBeInTheDocument();
  });

  it('인챈트와 특별 개조까지 합친 이름과 능력치를 미리보기에 보여 준다', async () => {
    // 139 + 전용 개조 30 + 거침없는 50~60 + S201 7단계 120 = 339~349
    renderPage(`${SWORD_PATH}&up=52507.&en=21643.&sp=s7`);

    expect(await screen.findByText('거침없는 소울 리버레이트 소드')).toBeInTheDocument();
    const labels = screen.getAllByText('최대 공격력');
    const row = labels.map((label) => label.closest('tr')).find(Boolean);
    expect(within(row as HTMLElement).getByText('339~349')).toBeInTheDocument();
    // 특별 개조 패널과 미리보기 두 곳에 같은 줄이 나온다.
    expect(
      screen.getAllByText('최소 공격력 +60, 최대 공격력 +120, 보너스 대미지 +5%'),
    ).toHaveLength(2);
  });

  it('세공은 표에 더하지 않고 따로 적는다', async () => {
    renderPage(`${SWORD_PATH}&rf=1_1-10`);

    // 세공 패널과 미리보기 두 곳에 같은 줄이 나온다.
    expect(await screen.findAllByText('체력 15 증가')).toHaveLength(2);
  });

  it('개조 NPC 가 모두 같으면 한 번만 적고 이름 모르는 NPC 는 수만 센다', async () => {
    renderPage(SWORD_PATH);

    expect(await screen.findByText('개조 NPC')).toBeInTheDocument();
    expect(screen.getByText('네리스, 퍼거스 외 1명(이름 미확인)')).toBeInTheDocument();
  });

  it('개조는 칸마다 한 줄에 고른 개조의 효과와 비용을 적는다', async () => {
    renderPage(`${SWORD_PATH}&up=52507.`);

    expect(await screen.findByText('최대 공격력 +30 (숙련 100, 99,000 G)')).toBeInTheDocument();
    // 두 번째 칸에는 할 수 있는 개조가 없다. "0가지 중에서" 라고 적지 않는다.
    expect(screen.getByText('이 칸에 할 수 있는 개조가 없습니다')).toBeInTheDocument();
  });

  it('바를 수 있는 인챈트를 펼쳐 두고 줄을 누르면 바른다', async () => {
    renderPage(SWORD_PATH);

    fireEvent.click(await screen.findByText('윈드밀 랭크 3단 이상일 때 최대 대미지 50~60 증가'));

    expect(await screen.findByText('거침없는 소울 리버레이트 소드')).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('en=21643.');
  });

  it('인챈트는 효과 글로도 찾는다', async () => {
    renderPage(SWORD_PATH);

    fireEvent.change(await screen.findByLabelText('이름이나 효과로 찾기'), {
      target: { value: '마법 공격력' },
    });

    expect(screen.getByText('"마법 공격력" 와 맞는 접두 인챈트가 없습니다.')).toBeInTheDocument();
  });

  it('유동 능력치는 기본값에 얹은 실제 값과 그 구성을 보여 준다', async () => {
    renderPage(`${SWORD_PATH}&rv=7`);

    // 한 줄 끝에 나올 수 있는 범위를 적는다. 구성은 그 위에 마우스를 올리면 보인다.
    expect(await screen.findByText('139~149')).toBeInTheDocument();
    // 미리보기 구성에도 유동 폭을 같이 적는다.
    expect(screen.getByText('기본 139, 유동 +7 (0~10)')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '최대 공격력' })).toHaveValue('146');
  });

  it('고를 것이 없는 능력치는 고정 능력치로 따로 묶는다', async () => {
    renderPage(SWORD_PATH);

    expect(await screen.findByText('고정 능력치')).toBeInTheDocument();
    expect(screen.getByText('유동 능력치')).toBeInTheDocument();
  });

  it('장비 정보가 없는 아이템이면 그렇다고 말한다', async () => {
    lookup = { item: null };
    renderPage(SWORD_PATH);

    expect(await screen.findByText(/장비 정보가 없습니다/)).toBeInTheDocument();
  });
});
