import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionPriceCell } from '@/components/AuctionPriceCell';

function renderCell(pricePerUnit: number, count: number) {
  return render(
    <AppProviders>
      <AuctionPriceCell pricePerUnit={pricePerUnit} count={count} />
    </AppProviders>,
  );
}

describe('가격 칸', () => {
  it('한 개짜리는 가격 하나만 보여 준다', () => {
    renderCell(599, 1);

    /**
     * 장비는 한 칸에 하나씩 올라오는 경우가 태반이다. 개당과 전체가 같은데 둘 다
     * 적으면 읽을 것만 늘어난다.
     */
    expect(screen.getByText('599 G')).toBeInTheDocument();
    expect(screen.queryByText(/개당/)).not.toBeInTheDocument();
    expect(screen.queryByText(/전체/)).not.toBeInTheDocument();
    expect(screen.queryByText(/1개/)).not.toBeInTheDocument();
  });

  it('여러 개 묶이면 개당과 전체를 함께 보여 준다', () => {
    renderCell(1200, 15);

    expect(screen.getByText('개당 1,200 G')).toBeInTheDocument();
    expect(screen.getByText('전체 18,000 G')).toBeInTheDocument();
    expect(screen.getByText('15개')).toBeInTheDocument();
  });

  it('개수가 0 으로 와도 공짜처럼 보이지 않는다', () => {
    renderCell(500, 0);

    expect(screen.getByText('500 G')).toBeInTheDocument();
  });
});
