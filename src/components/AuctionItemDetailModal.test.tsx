import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { AuctionItemDetailModal, type AuctionItemDetail } from '@/components/AuctionItemDetailModal';

const DETAIL: AuctionItemDetail = {
  displayName: '글라디우스',
  rawName: '@글라디우스',
  category: '검',
  count: 1,
  pricePerUnit: 599,
  options: [
    { option_type: '공격', option_value: '17', option_value2: '34' },
    { option_type: '크리티컬', option_value: '15%' },
    { option_type: '밸런스', option_value: '49%' },
    { option_type: '내구력', option_value: '15', option_value2: '15' },
    { option_type: '숙련', option_value: '0' },
  ],
  timeLabel: '만료',
  timeValue: '2026-09-24T11:24:00.000Z',
  showRemaining: true,
};

function renderModal(detail: AuctionItemDetail | null) {
  return render(
    <AppProviders>
      <AuctionItemDetailModal detail={detail} onClose={vi.fn()} />
    </AppProviders>,
  );
}

describe('매물 상세 모달', () => {
  it('닫혀 있으면 아무것도 보이지 않는다', () => {
    renderModal(null);

    expect(screen.queryByText('글라디우스')).not.toBeInTheDocument();
  });

  it('이름과 원래 이름, 카테고리를 보여 준다', () => {
    renderModal(DETAIL);

    expect(screen.getByText('글라디우스')).toBeInTheDocument();
    expect(screen.getByText('@글라디우스')).toBeInTheDocument();
    expect(screen.getByText('검')).toBeInTheDocument();
  });

  it('옵션을 잘라내지 않고 전부 보여 준다', () => {
    renderModal(DETAIL);

    /**
     * 표 안에서는 자리가 좁아 3개까지만 보여 준다. 줄을 눌러 여기까지 온 이유가
     * 나머지를 보려는 것이므로 여기서는 하나도 감추지 않는다.
     */
    for (const option of DETAIL.options ?? []) {
      expect(screen.getByText(option.option_type)).toBeInTheDocument();
    }
    expect(screen.getByText('17 ~ 34')).toBeInTheDocument();
  });

  it('옵션이 없으면 없다고 말한다', () => {
    renderModal({ ...DETAIL, options: [] });

    expect(screen.getByText(/세부 옵션이 없습니다/)).toBeInTheDocument();
  });

  it('거래 내역처럼 지난 시각이면 남은 시간을 내세우지 않는다', () => {
    renderModal({ ...DETAIL, timeLabel: '거래 시각', showRemaining: false });

    expect(screen.getAllByText('거래 시각').length).toBeGreaterThan(0);
    expect(screen.queryByText('남은 시간')).not.toBeInTheDocument();
  });
});
