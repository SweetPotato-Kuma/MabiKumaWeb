import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { EnchantScrollSpec } from '@/components/EnchantScrollSpec';

const FILE = {
  scrolls: {
    '인챈트 스크롤 - 올빼미': [
      {
        slot: 1,
        level: 8,
        desc: ['무기에 인챈트 가능', '최대대미지 10~12 증가', '[수리비 200% 증가]'],
        src: ['브리 레흐'],
      },
      { slot: 0, level: 6, desc: ['마법 공격력 3 증가'], alt: '부엉이' },
    ],
    '전용 인챈트 스크롤 - 망집': [{ slot: 1, level: 10, desc: ['최대 대미지 20 증가'], src: ['탈라 가흐'] }],
    '전용 인챈트 스크롤 - 나비': [{ slot: 1, level: 6, desc: ['마나실드 사용 중일 때 최대대미지 7~12 증가'], alt: '버터플라이' }],
  },
};

function renderSpec(name: string, kind?: { slot: 0 | 1; level: number }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(FILE), { status: 200 })),
  );
  return render(
    <AppProviders>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <EnchantScrollSpec name={name} kind={kind} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('인챈트 스크롤 사양', () => {
  it('접두를 먼저, 접미를 다음에 접두/접미와 랭크로 보여 준다', async () => {
    renderSpec('인챈트 스크롤 - 올빼미');

    const titles = await screen.findAllByText(/랭크$/);
    expect(titles.map((node) => node.textContent)).toEqual(['접두 A 랭크', '접미 8 랭크']);
  });

  it('효과와 조건과 나오는 곳을 나눠 적는다', async () => {
    renderSpec('인챈트 스크롤 - 올빼미');

    expect(await screen.findByText('최대대미지 10~12 증가')).toBeInTheDocument();
    // 적용 조건과 부가 규칙은 효과 줄과 따로 조건 칸에 둔다. 대괄호는 벗긴다.
    expect(screen.getByText('무기에 인챈트 가능')).toBeInTheDocument();
    expect(screen.getByText('수리비 200% 증가')).toBeInTheDocument();
    expect(screen.getByText('브리 레흐')).toBeInTheDocument();
  });

  it('개방된 전용 스크롤은 같은 인챈트 이름의 사양을 보여 주고 다른 이름도 적는다', async () => {
    renderSpec('개방된 전용 인챈트 스크롤 - 나비');

    expect(await screen.findByText('마나실드 사용 중일 때 최대대미지 7~12 증가')).toBeInTheDocument();
    expect(screen.getByText('버터플라이')).toBeInTheDocument();
  });

  it('첫 번째 이름으로 불린 스크롤도 같은 사양을 보여 준다', async () => {
    renderSpec('인챈트 스크롤 - 버터플라이');

    expect(await screen.findByText('마나실드 사용 중일 때 최대대미지 7~12 증가')).toBeInTheDocument();
  });

  it('매물 옵션의 접두/접미와 랭크를 받으면 그 사양만 보여 준다', async () => {
    renderSpec('인챈트 스크롤 - 올빼미', { slot: 0, level: 6 });

    expect(await screen.findByText('접두 A 랭크')).toBeInTheDocument();
    expect(screen.queryByText('접미 8 랭크')).toBeNull();
  });

  it('탈라 가흐 인챈트는 선택 스크롤로 얻는다고 그 스크롤로 가는 링크를 둔다', async () => {
    renderSpec('전용 인챈트 스크롤 - 망집');

    const link = await screen.findByRole('link', { name: '탈라 가흐 인챈트 선택 스크롤' });
    expect(link.getAttribute('href')).toBe('/item/탈라_가흐_인챈트_선택_스크롤');
    expect(screen.getByText('얻는 방법')).toBeInTheDocument();
  });

  it('선택 스크롤과 이어지지 않는 인챈트에는 얻는 방법 칸이 없다', async () => {
    renderSpec('인챈트 스크롤 - 올빼미');

    await screen.findByText('최대대미지 10~12 증가');
    expect(screen.queryByText('얻는 방법')).toBeNull();
  });

  it('사양이 없는 이름이면 아무것도 그리지 않는다', async () => {
    const { container } = renderSpec('인챈트 스크롤 - 없는이름');

    await waitFor(() => expect(container.querySelector('.ant-skeleton')).toBeNull());
    expect(container.querySelector('.ant-descriptions')).toBeNull();
  });
});
