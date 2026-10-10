import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { FavoritesWidget, HornWidget } from './PersonalWidgets';
import { addSavedSearch, resetSavedSearchesForTest } from '@/features/auction/savedSearches';

import { switchPersonalAccount } from '@/lib/personalStorage';
import { useAuctionItemsQuery } from '@/features/auction/hooks';

vi.mock('@/lib/settings', () => ({ useCanQuery: () => true }));
vi.mock('@/features/auction/nameIndex', async (original) => ({
  ...(await original<object>()),
  useItemNameIndexQuery: () => ({ data: null }),
}));
vi.mock('@/features/auction/optionNames', () => ({
  useOptionNamesQuery: () => ({ data: null }),
  scanCategoriesFor: () => [],
}));
vi.mock('@/features/auction/hooks', async (original) => ({
  ...(await original<object>()),
  useAuctionItemsQuery: vi.fn(() => ({
    data: {
      items: [
        { item_name: '철광석', item_display_name: '철광석', auction_price_per_unit: 1000 },
        { item_name: '철광석', item_display_name: '철광석', auction_price_per_unit: 500 },
        { item_name: '금광석', item_display_name: '금광석', auction_price_per_unit: 100 },
      ],
    },
    isPending: false,
  })),
  useAuctionSnapshotQuery: () => ({ status: 'off' }),
  useAuctionScanQuery: () => ({}),
}));
const refetchHorns = vi.hoisted(() => vi.fn());
vi.mock('@/features/horn/api', () => ({
  canSearchHorns: () => true,
  useHornSearch: () => ({ data: { posts: [] }, refetch: refetchHorns, isFetching: false }),
}));
beforeEach(() => {
  localStorage.clear();
  switchPersonalAccount(null);
  resetSavedSearchesForTest();
});
afterEach(() => {
  cleanup();
  switchPersonalAccount(null);
});
describe('홈 개인 위젯', () => {
  it('빈 즐겨찾기는 추가 경로를 제공하고 조건에 맞는 매물과 가격을 보여준다', () => {
    render(
      <MemoryRouter>
        <FavoritesWidget />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: '즐겨찾기 추가하러 가기 →' })).toHaveAttribute(
      'href',
      '/auction',
    );
    act(() => {
      addSavedSearch({ name: '광석', keyword: '철광석', category: '', filterKey: '' });
    });
    expect(screen.queryByText('금광석')).not.toBeInTheDocument();
    expect(screen.getByText('500 G')).toBeInTheDocument();
    expect(screen.getByText('1,000 G')).toBeInTheDocument();
    expect(vi.mocked(useAuctionItemsQuery).mock.calls.at(-1)?.[1]).toBe(true);
    expect(
      screen.getByRole('link', { name: '조건으로 전체 보기 →' }).getAttribute('href'),
    ).toContain('keyword=');
  });
  it('뿔피리 빈 결과를 알리고 검색 조건으로 전체 목록을 연결한다', () => {
    render(
      <MemoryRouter>
        <HornWidget />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: '뿔피리 새로고침' }));
    expect(refetchHorns).toHaveBeenCalledTimes(1);
    expect(screen.getByText('최근 하루 동안 일치하는 뿔피리가 없습니다.')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: '뿔피리 검색어' }), {
      target: { value: '광석' },
    });
    fireEvent.keyDown(screen.getByRole('searchbox', { name: '뿔피리 검색어' }), {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
    });
    expect(screen.getByRole('link', { name: '전체 보기' }).getAttribute('href')).toContain(
      encodeURIComponent('광석'),
    );
  });
});
