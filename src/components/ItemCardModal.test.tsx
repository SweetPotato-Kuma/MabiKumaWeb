import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ItemCardModal } from '@/components/ItemCardModal';

function renderModal(item: { category: string; name: string } | null) {
  return render(
    <AppProviders>
      <MemoryRouter>
        <ItemCardModal item={item} onClose={() => {}} />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe('사전 상세 창', () => {
  it('아무것도 고르지 않았으면 뜨지 않는다', () => {
    renderModal(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('이름과 카테고리를 경매장 상세와 같은 자리에 보여 준다', async () => {
    renderModal({ category: '검', name: '롱 소드' });

    expect(await screen.findByRole('heading', { name: '롱 소드' })).toBeInTheDocument();
    expect(screen.getByText('검')).toBeInTheDocument();
  });

  it('설명이 없으면 없다고 말해 준다', async () => {
    // 테스트 환경에는 카드 저장소가 없다. 빈칸으로 두지 않고 이유를 적는다.
    renderModal({ category: '검', name: '롱 소드' });

    expect(await screen.findByText(/아직 설명이 없습니다/)).toBeInTheDocument();
  });

  it('그 아이템의 시세로 바로 갈 수 있다', async () => {
    renderModal({ category: '검', name: '롱 소드' });

    const link = (await screen.findByRole('button', { name: /시세 보기/ })).closest('a');
    expect(link?.getAttribute('href')).toBe(
      `/auction?keyword=${encodeURIComponent('롱 소드')}&category=${encodeURIComponent('검')}`,
    );
  });
});
