import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ItemInfoDetail } from '@/components/ItemInfoDetail';

function renderDetail(item: { category: string; name: string }) {
  return render(
    <AppProviders>
      <MemoryRouter>
        <ItemInfoDetail category={item.category} name={item.name} />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe('장비가 아닌 아이템의 상세', () => {
  it('이름과 카테고리를 경매장 상세와 같은 자리에 보여 준다', async () => {
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    expect(await screen.findByRole('heading', { name: '생명력 50 포션' })).toBeInTheDocument();
    expect(screen.getByText('포션')).toBeInTheDocument();
  });

  it('설명이 없으면 없다고 말해 준다', async () => {
    // 테스트 환경에는 카드 저장소가 없다. 빈칸으로 두지 않고 이유를 적는다.
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    expect(await screen.findByText(/아직 설명이 없습니다/)).toBeInTheDocument();
  });

  it('그 아이템의 시세로 바로 갈 수 있다', async () => {
    renderDetail({ category: '포션', name: '생명력 50 포션' });

    const link = (await screen.findByRole('button', { name: /시세 보기/ })).closest('a');
    expect(link?.getAttribute('href')).toBe(
      `/auction?keyword=${encodeURIComponent('생명력 50 포션')}&category=${encodeURIComponent('포션')}`,
    );
  });
});
