import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionPriceCell } from '@/components/AuctionPriceCell';

function renderCell(pricePerUnit: number) {
  return render(
    <AppProviders>
      <AuctionPriceCell pricePerUnit={pricePerUnit} />
    </AppProviders>,
  );
}

describe('가격 칸', () => {
  it('늘 개당 가격 하나만 보여 준다. 전체 값이나 개수를 적지 않는다', () => {
    renderCell(1200);

    expect(screen.getByText('1,200 G')).toBeInTheDocument();
    expect(screen.queryByText(/전체/)).not.toBeInTheDocument();
    expect(screen.queryByText(/개당/)).not.toBeInTheDocument();
  });

  it('가격이 이상하게 와도 깨지지 않는다', () => {
    renderCell(Number.NaN);

    expect(screen.getByText('0 G')).toBeInTheDocument();
  });
});
