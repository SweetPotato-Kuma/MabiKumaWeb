import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionItemDetailModal } from '@/components/AuctionItemDetailModal';

const iconProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock('@/components/ItemIcon', () => ({
  ItemIcon: (props: Record<string, unknown>) => {
    iconProps.push(props);
    return null;
  },
}));

describe('매물 상세 그림', () => {
  it('표와 같이 그림 목록에서 찾고 매물의 파트 색으로 칠한다', () => {
    render(
      <AppProviders>
        <QueryClientProvider client={new QueryClient()}>
          <MemoryRouter>
            <AuctionItemDetailModal
              detail={{
                displayName: '왕의 모자(남성용)',
                rawName: '왕의 모자(남성용)',
                category: '모자/가발',
                count: 1,
                pricePerUnit: 700000,
                options: [
                  {
                    option_type: '아이템 색상',
                    option_sub_type: '파트 A',
                    option_value: '200,210,208',
                  },
                ],
                timeLabel: '만료',
                timeValue: '2026-10-13T05:52:00.000Z',
                showRemaining: true,
              }}
              onClose={vi.fn()}
            />
          </MemoryRouter>
        </QueryClientProvider>
      </AppProviders>,
    );

    const last = iconProps.at(-1);
    expect(last?.category).toBe('모자/가발');
    expect(last?.name).toBe('왕의 모자(남성용)');
    expect(last?.colors).toEqual({ A: [200, 210, 208] });
  });
});
