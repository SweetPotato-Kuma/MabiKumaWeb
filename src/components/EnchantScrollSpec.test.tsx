import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
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
      { slot: 0, level: 6, desc: ['마법 공격력 3 증가'] },
    ],
  },
};

function renderSpec(name: string, body: unknown = FILE) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: body ? 200 : 404 })),
  );
  return render(
    <AppProviders>
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <EnchantScrollSpec name={name} />
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

  it('사양이 없는 이름이면 아무것도 그리지 않는다', async () => {
    const { container } = renderSpec('인챈트 스크롤 - 없는이름');

    await waitFor(() => expect(container.querySelector('.ant-skeleton')).toBeNull());
    expect(container.querySelector('.ant-descriptions')).toBeNull();
  });
});
