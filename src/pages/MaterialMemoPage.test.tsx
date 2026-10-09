import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import {
  buildRecipeBook,
  recipeBookQueryOptions,
  type RawRecipeData,
} from '@/features/crafting/recipes';
import { resetMemoCache } from '@/features/materialMemo/store';
import { MaterialMemoPage } from '@/pages/MaterialMemoPage';

/**
 * 활(1)은 거래 불가 시위(2) 2개로 만들고, 시위는 실(3) 4개로 만든다. 실은 거래된다.
 */
const RAW: RawRecipeData = {
  updated: '2026-10-01',
  skills: [{ id: 10015, name: '제련', count: 3 }],
  items: { 1: ['활', 1], 2: ['시위', 0], 3: ['실', 1] },
  recipes: [
    { item: 1, skill: 10015, rank: 1, yield: 1, materials: [[[2], 2]] },
    { item: 2, skill: 10015, rank: 1, yield: 1, materials: [[[3], 4]] },
  ],
};

function renderPage(book: ReturnType<typeof buildRecipeBook> | null = buildRecipeBook(RAW)) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(recipeBookQueryOptions.queryKey, book);
  return render(
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/materials-calculator']}>
          <MaterialMemoPage />
        </MemoryRouter>
      </QueryClientProvider>
    </AppProviders>,
  );
}

function addBow() {
  fireEvent.change(screen.getByLabelText('목표 아이템'), { target: { value: '활' } });
  fireEvent.click(screen.getByRole('button', { name: /추가/ }));
}

describe('제작 재료 메모 화면', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetMemoCache();
  });

  it('목표가 없으면 빈 상태를 보이고, 이름이 맞기 전에는 추가할 수 없다', () => {
    renderPage();
    expect(screen.getByText('만들 아이템을 추가하면 재료 트리가 나옵니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /추가/ })).toBeDisabled();
  });

  it('제작법 데이터가 없으면 오류를 보인다', () => {
    renderPage(null);
    expect(screen.getByRole('alert')).toHaveTextContent('제작법 데이터를 받지 못했습니다');
  });

  it('목표를 추가하면 재료 트리가 펼쳐지고 구해야 할 재료가 합쳐진다', () => {
    renderPage();
    addBow();

    expect(screen.getByLabelText('시위 가진 개수')).toHaveValue('0');
    expect(screen.getByLabelText('실 가진 개수')).toBeInTheDocument();
    expect(screen.getByText(/부족 1종 \/ 전체 1종/)).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem('mabikuma:materialMemo') ?? 'null').targets).toHaveLength(1);
  });

  it('가진 개수를 적으면 부족한 재료가 줄고 다 채우면 완료가 된다', () => {
    renderPage();
    addBow();

    fireEvent.change(screen.getByLabelText('실 가진 개수'), { target: { value: '8' } });
    expect(screen.getByText(/부족 0종 \/ 전체 1종/)).toBeInTheDocument();
    expect(screen.getByText('모두 준비')).toBeInTheDocument();
  });

  it('만들기로 한 재료를 가졌다면 그 아래 재료는 필요 없다', () => {
    renderPage();
    addBow();

    fireEvent.change(screen.getByLabelText('시위 가진 개수'), { target: { value: '2' } });
    expect(screen.getByText('모두 준비')).toBeInTheDocument();
  });

  it('목표를 지우면 빈 상태로 돌아간다', () => {
    renderPage();
    addBow();

    fireEvent.click(screen.getByRole('button', { name: /삭제/ }));
    expect(screen.getByText('만들 아이템을 추가하면 재료 트리가 나옵니다')).toBeInTheDocument();
    expect(within(document.body).queryByLabelText('실 가진 개수')).not.toBeInTheDocument();
  });

  it('저장된 목표가 있으면 다시 열어도 그대로 보인다', () => {
    renderPage();
    addBow();
    fireEvent.change(screen.getByLabelText('실 가진 개수'), { target: { value: '3' } });
    document.body.innerHTML = '';
    resetMemoCache();

    renderPage();
    expect(screen.getByLabelText('실 가진 개수')).toHaveValue('3');
  });
});
