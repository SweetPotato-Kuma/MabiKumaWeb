import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { NpcShopNotReady } from '@/components/NpcShopNotReady';

describe('NPC 상점 데이터 준비 중 안내', () => {
  it('없는 것이 아니라 아직 받지 못한 것이라고 알리고, 스스로 다시 받는 간격을 적는다', () => {
    render(
      <AppProviders>
        <NpcShopNotReady what="주머니" onRetry={() => {}} />
      </AppProviders>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('넥슨이 상점 데이터를 준비하는 중입니다');
    expect(screen.getByRole('status')).toHaveTextContent('주머니 조회가 되지 않습니다. 없는 것이 아니라 아직 받지 못한 것');
    expect(screen.getByRole('status')).toHaveTextContent('20초마다 스스로 다시 받습니다');
  });

  it('지금 다시 받기를 누르면 다시 받는다', () => {
    const onRetry = vi.fn();
    render(
      <AppProviders>
        <NpcShopNotReady what="통행증 값" onRetry={onRetry} />
      </AppProviders>,
    );

    fireEvent.click(screen.getByRole('button', { name: '지금 다시 받기' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
