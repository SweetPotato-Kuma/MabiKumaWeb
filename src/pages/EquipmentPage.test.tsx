import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { EquipmentPage } from '@/pages/EquipmentPage';
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
    },
  },
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
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/item-equip?')) return new Response(JSON.stringify(lookup));
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
          <EquipmentPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

const SWORD_PATH = `/equipment?category=${encodeURIComponent('검')}&name=${encodeURIComponent('소울 리버레이트 소드')}`;

describe('장비 시뮬레이터 화면', () => {
  it('장비를 고르기 전에는 무엇을 하면 되는지 알려 준다', () => {
    renderPage('/equipment');

    expect(screen.getByText(/장비 이름을 고르면/)).toBeInTheDocument();
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

  it('세공과 특별 개조는 표 밖에 따로 적는다', async () => {
    renderPage(`${SWORD_PATH}&rf=1_1-10&sp=s7`);

    expect(await screen.findByText('세공 체력 15 증가')).toBeInTheDocument();
    expect(screen.getByText('특별 개조 S 7단계 (수치 미포함)')).toBeInTheDocument();
  });

  it('장비 정보가 없는 아이템이면 그렇다고 말한다', async () => {
    lookup = { item: null };
    renderPage(SWORD_PATH);

    expect(await screen.findByText(/장비 정보가 없습니다/)).toBeInTheDocument();
  });
});
