import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { ErinnClockButton, ErinnClockDetail, ShopResetCountdown } from '@/components/ErinnClock';
import { ERIN_DAY_REAL_MS } from '@/lib/erinTime';
import { applyServerTime, resetServerClockForTest } from '@/lib/serverClock';

/** 에린 h 시 m 분이 되는 현실 시각(ms). */
const at = (hour: number, minute: number, erinDays = 100) =>
  ((hour * 60 + minute) * 60 * 1000) / 40 + erinDays * ERIN_DAY_REAL_MS;

beforeEach(() => {
  vi.useFakeTimers();
  resetServerClockForTest();
});
afterEach(() => {
  vi.useRealTimers();
  resetServerClockForTest();
});

function withProviders(node: React.ReactElement) {
  return render(<AppProviders>{node}</AppProviders>);
}

describe('에린 시계', () => {
  it('헤더 단추에 에린 시각이 보인다', () => {
    vi.setSystemTime(at(14, 16));
    withProviders(<ErinnClockButton />);

    expect(screen.getByRole('button', { name: /에린 시각 14:16/ })).toHaveTextContent('에린 14:16');
  });

  it('시간이 흐르면 저절로 바뀐다. 에린 1분은 현실 1.5초다', () => {
    vi.setSystemTime(at(14, 16));
    withProviders(<ErinnClockButton />);

    act(() => vi.advanceTimersByTime(3000));

    // 현실 3초는 에린 2분이다.
    expect(screen.getByRole('button')).toHaveTextContent('에린 14:18');
  });

  it('누르면 낮밤과 상점 교체까지 남은 시간이 뜬다', () => {
    vi.setSystemTime(at(14, 47));
    withProviders(<ErinnClockButton />);

    fireEvent.click(screen.getByRole('button'));
    // 팝오버는 타이머로 열린다. 가짜 시계를 조금 돌려 준다.
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(screen.getByText(/에린 시각/)).toHaveTextContent('에린 시각 14:47 (낮)');
    // 자정까지 현실 829.5초, 곧 13분 49.5초다.
    expect(screen.getByText(/다음 상점 교체까지/)).toHaveTextContent(/13분 \d+초 남음/);
  });

  it('밤에는 밤이라고 적는다', () => {
    vi.setSystemTime(at(23, 10));
    withProviders(<ErinnClockDetail />);

    expect(screen.getByText(/에린 시각/)).toHaveTextContent('23:10 (밤)');
  });

  it('상점 교체 카운트다운이 1초마다 줄고, 자정이 지나면 하루가 다시 시작된다', () => {
    // 자정 2초 전.
    vi.setSystemTime(at(0, 0, 101) - 2000);
    withProviders(<ShopResetCountdown />);
    expect(screen.getByText(/상점 교체까지/)).toHaveTextContent('상점 교체까지 2초 남음');

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/상점 교체까지/)).toHaveTextContent('1초 남음');

    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText(/상점 교체까지/)).toHaveTextContent('36분 0초 남음');
  });

  it('서버 시계와 차이가 있으면 서버 기준으로 보인다', () => {
    // PC 시계는 14:16 인데 서버는 에린 1시간(현실 90초) 앞서 있다.
    const now = at(14, 16);
    vi.setSystemTime(now);
    applyServerTime(now + 90_000, now, now);

    withProviders(<ErinnClockButton />);

    expect(screen.getByRole('button')).toHaveTextContent('에린 15:16');
  });

  it('오래 열어 두어도 오차가 쌓이지 않는다', () => {
    vi.setSystemTime(at(14, 16));
    withProviders(<ErinnClockButton />);

    // 두 시간 동안 1초씩 틱이 돈다. 시계를 한 번에 앞으로 보낸 것과 같은 시각이 보여야 한다.
    const expected = at(14, 16) + 2 * 60 * 60 * 1000;
    act(() => vi.advanceTimersByTime(2 * 60 * 60 * 1000));

    const direct = Math.floor((((expected * 40) % 86_400_000) / 60_000));
    const hh = String(Math.floor(direct / 60)).padStart(2, '0');
    const mm = String(direct % 60).padStart(2, '0');
    expect(screen.getByRole('button')).toHaveTextContent(`에린 ${hh}:${mm}`);
  });
});
