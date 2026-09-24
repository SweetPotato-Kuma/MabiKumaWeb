import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
      <MemoryRouter>
        <AuctionItemDetailModal detail={detail} onClose={vi.fn()} />
      </MemoryRouter>
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


  it('색상은 숫자 대신 칠한 네모로 보여 준다', () => {
    renderModal({
      ...DETAIL,
      options: [
        { option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '255,255,255' },
        { option_type: '아이템 색상', option_sub_type: '파트 D', option_value: '43,62,58' },
      ],
    });

    // 숫자 셋을 읽는 것보다 칠해진 네모를 보는 편이 빠르다.
    const swatch = screen.getByLabelText('아이템 색상 파트 D 43,62,58');
    expect(swatch).toHaveStyle({ background: 'rgb(43, 62, 58)' });
    expect(screen.getByLabelText('아이템 색상 파트 A 255,255,255')).toBeInTheDocument();

    // 다섯 칸의 option_type 이 모두 같으므로 파트 이름은 option_sub_type 에서 와야 한다.
    expect(screen.getByText('파트 A')).toBeInTheDocument();
    expect(screen.getByText('파트 D')).toBeInTheDocument();
  });

  it('읽을 수 없는 색상 값은 원래 문자열을 남긴다', () => {
    renderModal({
      ...DETAIL,
      options: [{ option_type: '아이템 색상', option_sub_type: '파트 A', option_value: '알 수 없음' }],
    });

    expect(screen.getByText('알 수 없음')).toBeInTheDocument();
  });

  it('쉼표로 붙은 효과를 줄 단위로 끊어 보여 준다', () => {
    renderModal({
      ...DETAIL,
      options: [
        {
          option_type: '인챈트 접두',
          option_value: '파괴적인 (랭크 6)',
          option_desc: '수리비 200% 증가,체력 10 증가,최소대미지 40 증가',
        },
      ],
    });

    // 한 줄로 이어 두면 어디서 끊어 읽어야 할지 알 수 없다.
    expect(screen.getByText('수리비 200% 증가')).toBeInTheDocument();
    expect(screen.getByText('체력 10 증가')).toBeInTheDocument();
    expect(screen.getByText('최소대미지 40 증가')).toBeInTheDocument();
  });

  it('옵션을 종류별로 묶어 보여 준다', () => {
    renderModal(DETAIL);

    expect(screen.getByText('기본 능력')).toBeInTheDocument();
  });

  it('거래 내역처럼 지난 시각이면 남은 시간을 내세우지 않는다', () => {
    renderModal({ ...DETAIL, timeLabel: '거래 시각', showRemaining: false });

    expect(screen.getAllByText('거래 시각').length).toBeGreaterThan(0);
    expect(screen.queryByText('남은 시간')).not.toBeInTheDocument();
  });

  it('장비면 같은 장비의 시뮬레이터로 가는 단추를 둔다', () => {
    renderModal(DETAIL);

    const link = screen.getByRole('link', { name: /장비 시뮬레이터/ });
    // 경매장 이름 앞의 @ 는 떼고 사전 이름으로 보낸다.
    expect(link).toHaveAttribute('href', '/equipment?category=%EA%B2%80&name=%EA%B8%80%EB%9D%BC%EB%94%94%EC%9A%B0%EC%8A%A4');
  });

  it('장비가 아니면 시뮬레이터 단추가 없다', () => {
    renderModal({ ...DETAIL, category: '포션' });

    expect(screen.queryByRole('link', { name: /장비 시뮬레이터/ })).not.toBeInTheDocument();
  });
});
