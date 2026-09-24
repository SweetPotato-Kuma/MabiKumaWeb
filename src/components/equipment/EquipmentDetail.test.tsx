import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { DictionaryPage } from '@/pages/DictionaryPage';
import { EquipmentRedirect } from '@/pages/EquipmentRedirect';
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
      if (url.endsWith('items/index.json')) {
        return new Response(
          JSON.stringify({
            updated: '2026-09-24',
            total: 2,
            categories: [
              { name: '검', file: 'sword.json', count: 1 },
              { name: '포션', file: 'potion.json', count: 1 },
            ],
          }),
        );
      }
      if (url.endsWith('items/sword.json')) {
        return new Response(
          JSON.stringify({ category: '검', items: [{ name: '소울 리버레이트 소드' }] }),
        );
      }
      if (url.endsWith('items/potion.json')) {
        return new Response(
          JSON.stringify({ category: '포션', items: [{ name: '생명력 50 포션' }] }),
        );
      }
      // 이름 사전과 카드는 이 시험의 관심사가 아니다. 없다고 답한다.
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
            <Route path="/dictionary" element={<DictionaryPage />} />
            <Route path="/equipment" element={<EquipmentRedirect />} />
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

const SWORD_PATH = `/dictionary?category=${encodeURIComponent('검')}&name=${encodeURIComponent('소울 리버레이트 소드')}`;

describe('아이템 사전의 장비 시뮬레이터', () => {
  it('장비 카테고리의 줄을 누르면 사전 안에서 시뮬레이터가 열린다', async () => {
    renderPage(`/dictionary?category=${encodeURIComponent('검')}`);

    fireEvent.click(await screen.findByText('소울 리버레이트 소드'));

    expect(screen.getByTestId('url')).toHaveTextContent(
      '/dictionary?category=검&name=소울 리버레이트 소드',
    );
    expect(await screen.findByText('장비 미리보기')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '검' })).toHaveAttribute(
      'href',
      `/dictionary?category=${encodeURIComponent('검')}`,
    );
  });

  it('상세에서 카테고리로 돌아오면 치던 검색어가 그대로다', async () => {
    renderPage(`/dictionary?category=${encodeURIComponent('검')}`);

    fireEvent.change(await screen.findByLabelText('이름으로 찾기'), { target: { value: '소울' } });
    fireEvent.click(await screen.findByText('소울 리버레이트 소드'));
    fireEvent.click(await screen.findByRole('link', { name: '검' }));

    expect(screen.getByTestId('url')).toHaveTextContent('/dictionary?category=검');
    expect(screen.getByLabelText('이름으로 찾기')).toHaveValue('소울');
  });

  it('장비가 아니면 사전을 떠나지 않고 창을 띄운다', async () => {
    renderPage(`/dictionary?category=${encodeURIComponent('포션')}`);

    fireEvent.click(await screen.findByText('생명력 50 포션'));

    expect(screen.getByTestId('url')).toHaveTextContent('/dictionary?category=포션');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('예전 시뮬레이터 주소는 고른 조합을 그대로 들고 사전으로 넘어간다', async () => {
    renderPage(
      `/equipment?category=${encodeURIComponent('검')}&name=${encodeURIComponent('소울 리버레이트 소드')}&sp=s7`,
    );

    expect(await screen.findByText(/^S 7단계: /)).toBeInTheDocument();
    expect(screen.getByTestId('url')).toHaveTextContent('/dictionary?category=검');
  });

  it('주소에 담긴 조합을 불러와 최종 능력치에 더한다', async () => {
    // 랜덤 최대공 10, 첫 칸 전용 개조 1(+30). 139 + 10 + 30 = 179
    renderPage(`${SWORD_PATH}&rv=10&up=52507.`);

    // 랜덤 능력치 칸에도 같은 이름표가 있다. 표의 줄만 고른다.
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
    expect(
      screen.getByText('S 7단계: 최소 공격력 +60, 최대 공격력 +120, 보너스 대미지 +5%'),
    ).toBeInTheDocument();
  });

  it('세공은 표에 더하지 않고 따로 적는다', async () => {
    renderPage(`${SWORD_PATH}&rf=1_1-10`);

    // 세공 패널과 미리보기 두 곳에 같은 줄이 나온다.
    expect(await screen.findAllByText('체력 15 증가')).toHaveLength(2);
  });

  it('개조마다 해 주는 NPC 를 적고 이름 모르는 NPC 는 수만 센다', async () => {
    renderPage(SWORD_PATH);

    expect(await screen.findByText('NPC 네리스, 퍼거스 외 1명(이름 미확인)')).toBeInTheDocument();
  });

  it('랜덤 능력치는 기본값에 얹은 실제 값과 그 구성을 보여 준다', async () => {
    renderPage(`${SWORD_PATH}&rv=7`);

    expect(await screen.findByText('기본 139 + 랜덤 7 (폭 0~10)')).toBeInTheDocument();
    // 슬라이더 양 끝에 실제 값의 최소와 최대가 붙는다.
    expect(screen.getByText('149')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: '최대 공격력' })).toHaveValue('146');
  });

  it('고를 것이 없는 능력치는 고정 능력치로 따로 묶는다', async () => {
    renderPage(SWORD_PATH);

    expect(await screen.findByText('고정 능력치')).toBeInTheDocument();
    expect(screen.getByText('랜덤 능력치')).toBeInTheDocument();
  });

  it('장비 정보가 없는 아이템이면 그렇다고 말한다', async () => {
    lookup = { item: null };
    renderPage(SWORD_PATH);

    expect(await screen.findByText(/장비 정보가 없습니다/)).toBeInTheDocument();
  });
});
