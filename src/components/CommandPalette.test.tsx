import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { NAV_TREE } from '@/app/navigation';
import { CommandPalette } from '@/components/CommandPalette';
import type * as NameIndexModule from '@/features/auction/nameIndex';

// 이름 색인은 파일에서 받는다. 테스트에서는 몇 개만 든 색인을 바로 돌려준다.
// 렌더마다 새 객체를 주면 결과 목록이 매번 새로 만들어져 고른 줄이 첫 줄로 돌아간다. 하나를 계속 쓴다.
const { INDEX } = vi.hoisted(() => ({ INDEX: { current: null as unknown } }));
vi.mock('@/features/auction/nameIndex', async (importOriginal) => {
  const actual = await importOriginal<typeof NameIndexModule>();
  INDEX.current = actual.buildNameIndex({
    updated: '2026-09-29',
    categories: ['한손 장비', '재료'],
    items: [
      ['숏 소드', 0],
      ['주방장 숏 소드', 0],
      ['성수 가루', 1],
    ],
  });
  return {
    ...actual,
    useItemNameIndexQuery: () => ({ data: INDEX.current as NameIndexModule.NameIndex, isPending: false }),
  };
});

function Where() {
  const location = useLocation();
  return <output data-testid="where">{`${location.pathname}${location.search}`}</output>;
}

function renderPalette(onClose = () => {}) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <AppProviders>
          <CommandPalette open onClose={onClose} entries={NAV_TREE} />
          <Where />
        </AppProviders>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const input = () => screen.getByRole('combobox', { name: '전체 검색' });
const optionLabels = () => screen.getAllByRole('option').map((option) => option.textContent ?? '');

describe('전체 검색', () => {
  // jsdom 에는 scrollIntoView 가 없다. 고른 줄을 보이게 미는 동작이라 테스트에서는 비워 둔다.
  beforeAll(() => {
    Element.prototype.scrollIntoView = () => {};
  });

  it('비워 두면 메뉴의 페이지가 메뉴 순서대로 전부 나온다', () => {
    renderPalette();

    const labels = optionLabels();
    expect(labels.some((label) => label.startsWith('경매장'))).toBe(true);
    // 시뮬레이터 안에서는 세공이 성수보다 앞이다. 위 분류는 옆에 함께 적는다.
    const reforge = labels.findIndex((label) => label.startsWith('세공'));
    const holyWater = labels.findIndex((label) => label.startsWith('성수'));
    expect(reforge).toBeGreaterThanOrEqual(0);
    expect(holyWater).toBeGreaterThan(reforge);
    expect(labels[holyWater]).toContain('시뮬레이터, 장비');
    // 유물은 무리아스에 묶이지 않고 자기 묶음 아래에 시세와 복원이 함께 있다.
    expect(labels.some((label) => label.startsWith('유물 시세') && label.includes('유물'))).toBe(true);
    expect(labels.some((label) => label.startsWith('유물 복원'))).toBe(true);
  });

  it('페이지 이름과 초성으로 찾는다', () => {
    renderPalette();

    fireEvent.change(input(), { target: { value: '성수' } });
    expect(optionLabels().some((label) => label.startsWith('성수시뮬') || label.startsWith('성수'))).toBe(true);
    expect(optionLabels().some((label) => label.startsWith('세공'))).toBe(false);

    fireEvent.change(input(), { target: { value: 'ㅅㄱ' } });
    expect(optionLabels().some((label) => label.startsWith('세공'))).toBe(true);
  });

  it('아이템은 이름 일부로 찾고 Enter 로 상세에 간다', () => {
    const onClose = vi.fn();
    renderPalette(onClose);

    fireEvent.change(input(), { target: { value: '숏소드' } });
    const labels = optionLabels();
    // 앞글자가 맞는 짧은 이름이 먼저다.
    const short = labels.findIndex((label) => label.startsWith('숏 소드'));
    const long = labels.findIndex((label) => label.startsWith('주방장 숏 소드'));
    expect(short).toBeGreaterThanOrEqual(0);
    expect(long).toBeGreaterThan(short);
    expect(labels[short]).toContain('한손 장비');

    for (let step = 0; step < short; step += 1) fireEvent.keyDown(input(), { key: 'ArrowDown' });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(decodeURIComponent(screen.getByTestId('where').textContent ?? '')).toBe(
      '/item/숏_소드?category=한손 장비',
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('맨 아래 줄은 그 말로 경매장을 찾는다', () => {
    renderPalette();

    fireEvent.change(input(), { target: { value: '숏 소드' } });
    fireEvent.keyDown(input(), { key: 'ArrowUp' });
    fireEvent.keyDown(input(), { key: 'Enter' });

    expect(decodeURIComponent(screen.getByTestId('where').textContent ?? '')).toBe('/auction?keyword=숏 소드');
  });

  it('한글을 조립하는 중의 Enter 는 고르지 않는다', () => {
    renderPalette();

    fireEvent.change(input(), { target: { value: '성수' } });
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true });

    expect(screen.getByTestId('where').textContent).toBe('/');
  });
});
