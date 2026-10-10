import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
  cleanup,
  within,
} from '@testing-library/react';
import { App } from 'antd';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './HomePage';
import { switchPersonalAccount } from '@/lib/personalStorage';
import { HOME_LAYOUT_KEY } from '@/features/home/layout';
import { HomeWidgetSettings } from '@/components/home/HomeWidgetSettings';

vi.mock('@/features/news/api', () => ({ canReadNews: () => true }));
vi.mock('@/components/news/BannerCarousel', () => ({ BannerCarousel: () => <div>배너 내용</div> }));
vi.mock('@/components/news/HomeWidgets', () => ({
  NewsBlock: () => <div>공지 내용</div>,
  KitWidget: () => <div>키트 내용</div>,
  DevNoteWidget: () => <div>노트 내용</div>,
}));
vi.mock('@/components/home/PersonalWidgets', () => ({
  FavoritesWidget: () => <div>즐겨찾기 내용</div>,
  HornWidget: () => <div>뿔피리 내용</div>,
  MemoWidget: () => <div>목표 내용</div>,
}));
const order = () =>
  screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'));
const draw = () =>
  render(
    <App>
      <MemoryRouter>
        <HomePage />
        <HomeWidgetSettings />
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
  it('설정에서 편집을 켜고 우클릭으로 숨긴 위젯을 팔레트에서 복원한다', async () => {
    const view = draw();
    expect(screen.getAllByRole('region')).toHaveLength(7);
    expect(screen.queryByRole('button', { name: '편집 완료' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    fireEvent.contextMenu(screen.getByRole('region', { name: '뿔피리' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '위젯 숨기기' }));
    expect(screen.queryByText('뿔피리 내용')).not.toBeInTheDocument();
    expect(localStorage.getItem(HOME_LAYOUT_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '편집 완료' }));
    expect(
      JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY)!).find(
        ({ id }: { id: string }) => id === 'horn',
      ).visible,
    ).toBe(false);
    view.unmount();
    draw();
    expect(screen.queryByText('뿔피리 내용')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    fireEvent.click(screen.getByRole('button', { name: '뿔피리 추가' }));
    expect(screen.getByText('뿔피리 내용')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '편집 완료' }));
    expect(screen.queryByRole('button', { name: '뿔피리 설정' })).not.toBeInTheDocument();
  });
  it('손잡이를 드래그해 순서를 저장하고 숨긴 위젯도 원하는 위치에 놓는다', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key),
    };
    fireEvent.dragStart(screen.getByRole('button', { name: '목표 아이템 메모 이동 손잡이' }), {
      dataTransfer,
    });
    fireEvent.dragOver(screen.getByRole('region', { name: '이벤트 배너' }), { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: '이벤트 배너' }), { dataTransfer });
    expect(order()[0]).toBe('목표 아이템 메모');
    expect(localStorage.getItem(HOME_LAYOUT_KEY)).toBeNull();
    fireEvent.contextMenu(screen.getByRole('region', { name: '뿔피리' }));
    fireEvent.click(screen.getAllByRole('menuitem', { name: '위젯 숨기기' }).at(-1)!);
    expect(screen.getAllByRole('region')).toHaveLength(6);
    fireEvent.dragStart(screen.getByRole('button', { name: '뿔피리 추가' }), { dataTransfer });
    fireEvent.drop(screen.getByRole('region', { name: '목표 아이템 메모' }), { dataTransfer });
    expect(order()[0]).toBe('뿔피리');
    expect(screen.getAllByRole('region')).toHaveLength(7);
    fireEvent.dragStart(screen.getByRole('button', { name: '뿔피리 이동 손잡이' }), {
      dataTransfer,
    });
    fireEvent.drop(screen.getByLabelText('마지막 위치에 위젯 놓기'), { dataTransfer });
    expect(order().at(-1)).toBe('뿔피리');
    fireEvent.click(screen.getByRole('button', { name: '편집 완료' }));
    expect(JSON.parse(localStorage.getItem(HOME_LAYOUT_KEY)!).at(-1).id).toBe('horn');
  });
  it('취소하면 편집 중에 바꾼 배치를 저장하지 않는다', async () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    fireEvent.contextMenu(screen.getByRole('region', { name: '뿔피리' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '위젯 숨기기' }));
    expect(screen.queryByRole('region', { name: '뿔피리' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(localStorage.getItem(HOME_LAYOUT_KEY)).toBeNull();
    expect(screen.getByRole('region', { name: '뿔피리' })).toBeInTheDocument();
  });
  it('끄는 동안 놓을 자리를 문구로 알리고 뒤쪽 절반에 놓으면 다음 위젯 앞에 배치한다', () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    const data = new Map<string, string>();
    const dataTransfer = {
      setData: (key: string, value: string) => data.set(key, value),
      getData: (key: string) => data.get(key),
    };
    fireEvent.dragStart(screen.getByRole('button', { name: '뿔피리 이동 손잡이' }), {
      dataTransfer,
    });
    const banner = screen.getByRole('region', { name: '이벤트 배너' });
    banner.getBoundingClientRect = () => ({ top: 0, height: 100, left: 0, width: 100 }) as DOMRect;
    // jsdom 은 DragEvent 가 없어 좌표를 받지 못하므로 직접 붙인다.
    const at = (kind: 'dragOver' | 'drop', clientY: number) => {
      const event = createEvent[kind](banner, { dataTransfer });
      Object.defineProperties(event, { clientX: { value: 50 }, clientY: { value: clientY } });
      fireEvent(banner, event);
    };
    at('dragOver', 20);
    expect(screen.getByText("'이벤트 배너' 위에 배치됩니다")).toBeInTheDocument();
    at('dragOver', 80);
    expect(screen.getByText("'이벤트 배너' 아래에 배치됩니다")).toBeInTheDocument();
    at('drop', 80);
    expect(order()[1]).toBe('뿔피리');
    expect(screen.queryByText(/배치됩니다/)).not.toBeInTheDocument();
  });
  it('터치·키보드용 메뉴로 크기와 순서를 바꾸고 기본 배치를 복원한다', async () => {
    draw();
    fireEvent.click(screen.getByRole('button', { name: '위젯 편집' }));
    fireEvent.click(screen.getByRole('button', { name: '뿔피리 설정' }));
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByRole('menuitem', { name: /^너비/ }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '5칸' }));
    expect(
      screen.getByRole('region', { name: '뿔피리' }).style.getPropertyValue('--widget-columns'),
    ).toBe('5');
    fireEvent.click(screen.getByRole('button', { name: '뿔피리 설정' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: '앞으로 이동' }));
    expect(order()[4]).toBe('뿔피리');
    fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
    expect(
      screen.getByRole('region', { name: '뿔피리' }).style.getPropertyValue('--widget-columns'),
    ).toBe('2');
    act(() => switchPersonalAccount('11111111-1111-1111-1111-111111111111'));
    expect(screen.getAllByRole('region')).toHaveLength(7);
  });
});
