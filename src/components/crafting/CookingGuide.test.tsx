import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { CookingGuide } from '@/components/crafting/CookingGuide';
import { buildRecipeBook } from '@/features/crafting/recipes';

vi.setConfig({ testTimeout: 20_000 });

/** 마요네즈(1) = 달걀(2) 75 + 올리브유(3) 20. 소금(4) 10 을 하나 더 넣을 수 있다. */
const book = buildRecipeBook({
  updated: '2026-09-22',
  skills: [{ id: 10020, name: '요리', count: 1 }],
  items: { 1: ['마요네즈', 1], 2: ['달걀', 1], 3: ['올리브유', 1], 4: ['소금', 1] },
  recipes: [
    {
      item: 1,
      skill: 10020,
      rank: 0,
      yield: 1,
      tool: '혼합',
      exp: 100,
      materials: [
        [[2], 1, 75],
        [[3], 1, 20],
      ],
      extras: [[[4], 1, 10]],
    },
  ],
});

function renderGuide() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CookingGuide book={book} recipe={book.recipesOf(1)[0]} />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

/** 표의 줄마다 [재료, 비율, 게이지]. */
function rows() {
  return screen
    .getAllByRole('row')
    .slice(1)
    .map((row) =>
      within(row)
        .getAllByRole('cell')
        .slice(1)
        .map((cell) => cell.textContent),
    );
}

describe('요리 재료 넣는 순서', () => {
  beforeEach(() => {
    // 이름 인덱스 파일은 없는 것으로 둔다. 그림만 빠진다.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 404 })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('재료마다 비율과 게이지를 멈출 자리를 적는다', () => {
    renderGuide();

    expect(rows()).toEqual([
      ['달걀', '78.9%', '78.9%까지'],
      ['올리브유', '21.1%', '100%까지'],
    ]);
    expect(screen.getByRole('img', { name: '재료 비율: 달걀 78.9%, 올리브유 21.1%' })).toBeTruthy();
  });

  it('추가 재료를 고르면 비율을 다시 나눈다', () => {
    renderGuide();

    fireEvent.click(screen.getByText('소금'));

    expect(rows()).toEqual([
      ['달걀', '71.4%', '71.4%까지'],
      ['올리브유', '19.1%', '90.5%까지'],
      ['소금추가', '9.5%', '100%까지'],
    ]);
  });
});
