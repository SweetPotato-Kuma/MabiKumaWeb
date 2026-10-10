import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import { switchPersonalAccount } from '@/lib/personalStorage';
import { HOME_LAYOUT_KEY } from '@/features/home/layout';

vi.mock('@/features/news/api', () => ({ canReadNews: () => true }));
vi.mock('@/components/news/BannerCarousel', () => ({ BannerCarousel: () => <div>배너 내용</div> }));
vi.mock('@/components/news/HomeWidgets', () => ({
  NewsBlock: () => <div>공지 내용</div>,
  KitWidget: () => <div>키트 내용</div>,
  DevNoteWidget: () => <div>노트 내용</div>,
  EditedWidget: () => null,
}));
vi.mock('@/components/home/PersonalWidgets', () => ({
  FavoritesWidget: () => <div>즐겨찾기 내용</div>,
  HornWidget: () => <div>뿔피리 내용</div>,
  MemoWidget: () => <div>목표 내용</div>,
}));
const draw = () =>
  render(
    <App>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </App>,
  );
beforeEach(() => {
  localStorage.clear();
  switchPersonalAccount(null);
});
afterEach(() => {
  cleanup();
  switchPersonalAccount(null);
});
describe('홈 위젯 편집', () => {
  it('7개 위젯을 표시하고 숨김과 순서를 저장하여 다시 방문해도 유지한다', () => {
    const view = draw();
    expect(screen.getAllByRole('region')).toHaveLength(7);
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    fireEvent.click(screen.getByRole('switch', { name: '뿔피리 표시' }));
    expect(screen.queryByText('뿔피리 내용')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '목표 아이템 메모 앞으로' }));
    expect(JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY)!)[5].id).toBe('memo');
    view.unmount();
    draw();
    expect(screen.queryByText('뿔피리 내용')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    expect(screen.getByText('뿔피리 내용')).toBeInTheDocument();
  });
  it('모두 숨겨도 편집 진입과 복원을 제공한다', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    for (const control of screen.getAllByRole('switch')) {
      if (control.getAttribute('aria-checked') === 'true') fireEvent.click(control);
    }
    expect(screen.getByText('위젯 편집에서 홈에 표시할 위젯을 켜 주세요.')).toBeInTheDocument();
    act(() => switchPersonalAccount('11111111-1111-1111-1111-111111111111'));
    expect(screen.getAllByRole('region')).toHaveLength(7);
  });
});
