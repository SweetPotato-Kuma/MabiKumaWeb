import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import type * as Settings from '@/lib/settings';
import { getSettings, resetSettingsForTest, updateSettings } from '@/lib/userSettings';
import { BagsPage } from '@/pages/BagsPage';
import { HornPage } from '@/pages/HornPage';
import { MagmellPassPage } from '@/pages/MagmellPassPage';

// 테스트 환경에는 워커 주소가 없다. 있는 것으로 두되 조회는 나가지 않게 fetch 를 막는다.
vi.mock('@/lib/settings', async (importOriginal) => ({
  ...(await importOriginal<typeof Settings>()),
  getProxyUrl: () => 'https://w.example',
}));

function renderPage(page: React.ReactElement, url: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  let search = '';
  function Watcher() {
    search = useLocation().search;
    return null;
  }
  render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[url]}>
          <Watcher />
          {page}
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
  return { search: () => search };
}

/**
 * 세그먼트 버튼에서 고른 칸. 시험 환경의 antd 는 라디오 name 을 모두 "test-id" 로 붙여서, 한 화면에 세그먼트가 둘
 * 이상이면 브라우저 규칙상 앞 묶음의 checked 가 풀린다. 그래서 checked 대신 antd 가 붙이는 선택 클래스를 본다.
 */
const isSelected = (name: string) =>
  screen.getByRole('radio', { name }).closest('label')?.classList.contains('ant-segmented-item-selected');

beforeEach(() => {
  window.localStorage.clear();
  resetSettingsForTest();
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
  // jsdom 은 모든 폭 조건이 거짓이라 좁은 화면(고르기 상자)으로 그려진다. 넓은 화면(세그먼트 버튼)으로 그린다.
  vi.stubGlobal(
    'matchMedia',
    (query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
  resetSettingsForTest();
});

describe('기본 서버', () => {
  it.each([
    ['뿔피리', <HornPage />, '/horn'],
    ['마그 멜', <MagmellPassPage />, '/magmell-pass'],
    ['튼튼한 주머니', <BagsPage />, '/bags'],
  ] as const)('기본 서버를 하프로 두면 %s 가 하프로 열리고 주소는 그대로다', (_name, page, url) => {
    updateSettings({ server: '하프' });

    const view = renderPage(page, url);

    expect(isSelected('하프')).toBe(true);
    expect(view.search()).toBe('');
  });

  it('주소의 서버가 기본 서버보다 우선한다', () => {
    updateSettings({ server: '하프' });

    renderPage(<HornPage />, '/horn?server=울프');

    expect(isSelected('울프')).toBe(true);
    expect(getSettings().server).toBe('하프');
  });

  it('화면에서 서버를 고르면 주소에 적고 기본 서버도 그 서버로 바뀐다', async () => {
    const view = renderPage(<BagsPage />, '/bags');

    fireEvent.click(screen.getByRole('radio', { name: '만돌린' }));

    await waitFor(() => expect(view.search()).toContain('server=%EB%A7%8C%EB%8F%8C%EB%A6%B0'));
    expect(getSettings().server).toBe('만돌린');
  });

  it('마그 멜의 모든 서버는 기본 서버로 삼지 않는다', async () => {
    updateSettings({ server: '하프' });
    const view = renderPage(<MagmellPassPage />, '/magmell-pass');

    fireEvent.click(screen.getByRole('radio', { name: '모든 서버' }));

    await waitFor(() => expect(view.search()).toBe('?server=all'));
    expect(getSettings().server).toBe('하프');
  });

  it('마그 멜 주소의 모든 서버를 읽는다', () => {
    renderPage(<MagmellPassPage />, '/magmell-pass?server=all');

    expect(isSelected('모든 서버')).toBe(true);
  });

  it('낯선 서버 값은 기본 서버로 돌린다', () => {
    updateSettings({ server: '울프' });

    renderPage(<BagsPage />, '/bags?server=없는서버');

    expect(isSelected('울프')).toBe(true);
  });
});
