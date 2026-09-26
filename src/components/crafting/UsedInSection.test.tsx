import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { UsedInSection } from '@/components/crafting/UsedInSection';
import { buildRecipeBook, recipeBookQueryOptions } from '@/features/crafting/recipes';

/**
 * 투어마린(1)은 매직 크래프트로 스태프(2)와 원드(3)에, 핸디크래프트로 목걸이(4)에 들어간다.
 * 젬스톤 파우더(5)는 어디에도 들어가지 않는다.
 */
const book = buildRecipeBook({
  updated: '2026-09-26',
  skills: [
    { id: 10041, name: '매직 크래프트', count: 2 },
    { id: 10013, name: '핸디크래프트', count: 1 },
  ],
  items: {
    1: ['투어마린', 1],
    2: ['페러시우스 미스틱 스태프', 1],
    3: ['페러시우스 아케인 원드', 1],
    4: ['투어마린 목걸이', 1],
    5: ['젬스톤 파우더', 1],
    6: ['대못', 1],
  },
  recipes: [
    { item: 2, skill: 10041, rank: 7, yield: 1, materials: [[[6], 10], [[1], 3]] },
    { item: 3, skill: 10041, rank: 7, yield: 1, materials: [[[6], 10], [[1], 2]] },
    { item: 4, skill: 10013, rank: 3, yield: 2, materials: [[[1], 1]] },
  ],
});

function renderSection(name: string, onOpen = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(recipeBookQueryOptions.queryKey, book);
  render(
    <QueryClientProvider client={client}>
      <AppProviders>
        <UsedInSection name={name} onOpen={onOpen} />
      </AppProviders>
    </QueryClientProvider>,
  );
  return onOpen;
}

beforeEach(() => {
  // 이름 사전은 이 시험의 관심사가 아니다. 없다고 답한다.
  vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('이 아이템으로 만들 수 있는 것', () => {
  it('재료로 쓰는 제작법을 모두 보여 주고 넣는 양을 적는다', () => {
    renderSection('투어마린');

    expect(screen.getByText('이 아이템으로 만들 수 있는 것')).toBeInTheDocument();
    const staff = screen.getByText('페러시우스 미스틱 스태프').closest('tr') as HTMLElement;
    expect(within(staff).getByText('3개')).toBeInTheDocument();
    const necklace = screen.getByText('투어마린 목걸이').closest('tr') as HTMLElement;
    expect(within(necklace).getByText('한 번에 2개 생산')).toBeInTheDocument();
  });

  it('스킬로 좁혀 볼 수 있다', () => {
    renderSection('투어마린');

    fireEvent.click(within(screen.getByRole('group', { name: '제작 스킬로 좁히기' })).getByText('핸디크래프트'));

    expect(screen.getByText('투어마린 목걸이')).toBeInTheDocument();
    expect(screen.queryByText('페러시우스 아케인 원드')).not.toBeInTheDocument();
  });

  it('줄을 누르면 만들어지는 아이템으로 넘어간다', () => {
    const onOpen = renderSection('투어마린');

    fireEvent.click(screen.getByText('페러시우스 아케인 원드'));

    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ item: 3 }), book);
  });

  it('재료로 쓰이지 않는 아이템이면 아무것도 그리지 않는다', () => {
    renderSection('젬스톤 파우더');

    expect(screen.queryByText('이 아이템으로 만들 수 있는 것')).not.toBeInTheDocument();
  });
});
