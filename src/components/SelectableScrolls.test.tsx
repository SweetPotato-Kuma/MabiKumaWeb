import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { SelectableScrolls } from '@/components/SelectableScrolls';

const FILE = {
  scrolls: {
    '전용 인챈트 스크롤 - 망집': [
      { slot: 1, level: 10, desc: ['무기에 인챈트 가능', '최대 대미지 20 증가'], src: ['탈라 가흐'] },
    ],
    '전용 인챈트 스크롤 - 감싸는': [{ slot: 0, level: 10, desc: ['방어 5 증가'], src: ['탈라 가흐'] }],
    '인챈트 스크롤 - 올빼미': [{ slot: 1, level: 8, desc: ['최대대미지 10 증가'], src: ['브리 레흐'] }],
  },
};

function renderList(name: string) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(FILE), { status: 200 })));
  return render(
    <AppProviders>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <SelectableScrolls name={name} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('선택 스크롤로 고를 수 있는 인챈트 스크롤', () => {
  it('같은 나오는 곳의 스크롤을 이름순으로 개수와 함께 보여 주고 이름으로 상세에 닿는다', async () => {
    renderList('탈라 가흐 인챈트 선택 스크롤');

    expect(await screen.findByText('선택할 수 있는 인챈트 스크롤 2개')).toBeInTheDocument();
    const links = screen.getAllByRole('link').map((link) => link.textContent);
    expect(links).toEqual(['전용 인챈트 스크롤 - 감싸는', '전용 인챈트 스크롤 - 망집']);
    expect(screen.getAllByRole('link')[1].getAttribute('href')).toBe(
      '/item/전용_인챈트_스크롤_-_망집?category=%EC%9D%B8%EC%B1%88%ED%8A%B8%20%EC%8A%A4%ED%81%AC%EB%A1%A4',
    );
  });

  it('접두/접미와 랭크, 적용 조건을 뺀 효과를 줄마다 보여 준다', async () => {
    renderList('탈라 가흐 인챈트 선택 스크롤');

    const row = (await screen.findByText('전용 인챈트 스크롤 - 망집')).closest('tr') as HTMLElement;
    expect(within(row).getByText('접미 6 랭크')).toBeInTheDocument();
    expect(within(row).getByText('최대 대미지 20 증가')).toBeInTheDocument();
    expect(within(row).queryByText(/인챈트 가능/)).toBeNull();
  });

  it('선택 스크롤이 아닌 아이템에는 아무것도 그리지 않는다', async () => {
    const { container } = renderList('인챈트 스크롤');

    await waitFor(() => expect(container.querySelector('.ant-skeleton')).toBeNull());
    expect(container.querySelector('.ant-table')).toBeNull();
  });
});
