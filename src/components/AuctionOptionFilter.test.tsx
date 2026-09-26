import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { DetailSearchBar } from '@/components/AuctionOptionFilter';
import {
  buildOptionCatalog,
  EMPTY_OPTION_FILTER,
  type OptionFilter,
} from '@/features/auction/optionFilter';

vi.setConfig({ testTimeout: 20_000 });

const catalog = buildOptionCatalog([
  {
    item_option: [
      {
        option_type: '무리아스 유물',
        option_value: '오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)',
      },
    ],
  },
]);

function Harness({ category }: { category: string }) {
  const [filter, setFilter] = useState<OptionFilter>(EMPTY_OPTION_FILTER);
  return (
    <AppProviders>
      <DetailSearchBar
        value={filter}
        onChange={setFilter}
        catalog={category === '유물' ? catalog : []}
        names={null}
        category={category}
      />
    </AppProviders>
  );
}

describe('무리아스 유물 상세 검색', () => {
  it('유물이 아닌 카테고리에서는 단추를 두지 않는다', () => {
    render(<Harness category="검" />);
    expect(screen.queryByRole('button', { name: /무리아스 유물/ })).toBeNull();
  });

  it('옵션 이름을 고르면 레벨마다 그 옵션의 수치를 붙여 고르게 한다', async () => {
    render(<Harness category="유물" />);

    fireEvent.click(screen.getByRole('button', { name: /무리아스 유물/ }));
    const popover = await screen.findByRole('tooltip');
    fireEvent.change(within(popover).getByLabelText('무리아스 유물 스킬 옵션'), {
      target: { value: '오버 드라이브 폭발 공격 대미지' },
    });
    fireEvent.mouseDown(within(popover).getByLabelText('무리아스 유물 최소 레벨'));

    expect(await screen.findByText('7레벨 (490%)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('7레벨 (490%)'));

    expect(
      screen.getByRole('button', { name: /무리아스 유물 오버 드라이브 폭발 공격 대미지 7레벨 이상/ }),
    ).toBeInTheDocument();
  });
});
