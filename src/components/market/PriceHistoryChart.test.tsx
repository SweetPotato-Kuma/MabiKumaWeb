import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { PriceHistoryChart, type ChartSlot } from '@/components/market/PriceHistoryChart';

/** 시간별 그래프와 같은 168칸. 13시 칸에만 거래가 있다. */
const SLOTS: ChartSlot[] = Array.from({ length: 168 }, (_, index) => ({
  key: String(index),
  date: '2026-09-25',
  title: `${index}번 칸`,
  summary: index === 13 ? { n: 3, qty: 30, lo: 900, hi: 1500, mid: 1100, avg: 1150 } : null,
}));

/** jsdom 에는 PointerEvent 가 없어 clientX 가 사라진다. 마우스 이벤트로 대신한다. */
beforeAll(() => {
  if (typeof window.PointerEvent === 'undefined') {
    window.PointerEvent = class extends MouseEvent {} as typeof PointerEvent;
  }
});

function renderChart() {
  const view = render(
    <AppProviders>
      <PriceHistoryChart
        slots={SLOTS}
        ticks={[{ index: 24, label: '09-26 (토)', at: 'start' }]}
        ariaLabel="그래프"
      />
    </AppProviders>,
  );
  // jsdom 은 크기를 모른다. 덮개 한 겹을 가로 1680px 로 본다(한 칸 10px).
  const layer = screen.getByTestId('chart-hover-layer');
  layer.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 1680, height: 234, right: 1680, bottom: 234 }) as DOMRect;
  return { ...view, layer };
}

describe('가격 그래프 풍선', () => {
  it('마우스를 여러 칸 지나가도 풍선은 하나만 뜬다', () => {
    const { layer } = renderChart();

    for (const x of [5, 15, 25, 135]) fireEvent.pointerMove(layer, { clientX: x });

    // 13번 칸(130~140px)에서 멈췄다. 앞에서 지나간 칸의 풍선은 남지 않는다.
    expect(screen.getAllByTestId('chart-tooltip')).toHaveLength(1);
    expect(screen.getByText('13번 칸')).toBeInTheDocument();
    expect(screen.getByText('거래 3건, 30개')).toBeInTheDocument();
    expect(screen.queryByText(/2번 칸 거래 없음/)).not.toBeInTheDocument();
  });

  it('그래프 밖으로 나가면 풍선을 닫는다', () => {
    const { layer } = renderChart();
    fireEvent.pointerMove(layer, { clientX: 15 });
    expect(screen.getByText('1번 칸 거래 없음')).toBeInTheDocument();

    fireEvent.pointerLeave(layer);
    expect(screen.queryByTestId('chart-tooltip')).not.toBeInTheDocument();
  });
});
