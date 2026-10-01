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

/** 세부 옵션 선택 칸을 열어 옵션 하나를 고른다. 고르면 그 옵션의 조건 창이 열린다. */
async function addOption(label: string) {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '세부 옵션 선택' }));
  fireEvent.click(await screen.findByTitle(label));
}

/** 선택 칸이 내놓는 옵션 이름들. */
async function offeredOptions() {
  fireEvent.mouseDown(screen.getByRole('combobox', { name: '세부 옵션 선택' }));
  await screen.findByRole('listbox');
  return [...document.querySelectorAll('.ant-select-item-option')].map((option) => option.getAttribute('title') ?? '');
}

describe('카테고리별 세부 옵션 선택', () => {
  it('장비 카테고리에서는 세공, 인챈트, 특별 개조, 에르그, 색상을 고르게 한다', async () => {
    render(<Harness category="검" />);

    expect(await offeredOptions()).toEqual(['세공', '인챈트', '특별 개조', '에르그', '색상']);
  });

  it('유물에서는 무리아스 유물 옵션만 고르게 한다. 세공은 쓸모가 없다', async () => {
    render(<Harness category="유물" />);

    expect(await offeredOptions()).toEqual(['무리아스 유물']);
  });

  it('붙는 옵션이 없는 카테고리에서는 선택 칸이 비활성이다', () => {
    render(<Harness category="포션" />);

    expect(screen.getByRole('combobox', { name: '세부 옵션 선택' })).toBeDisabled();
  });

  it('고른 옵션은 배지로 남고 선택 목록에서는 빠진다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');
    const popover = await screen.findByRole('tooltip');
    fireEvent.change(within(popover).getByLabelText('R 최소'), { target: { value: '100' } });
    fireEvent.click(within(popover).getByRole('button', { name: '확인' }));

    expect(screen.getByRole('button', { name: /색상 R 100/ })).toBeInTheDocument();
    expect(await offeredOptions()).toEqual(['세공', '인챈트', '특별 개조', '에르그']);
  });

  it('값을 넣지 않고 창을 닫으면 배지도 남기지 않는다', async () => {
    render(<Harness category="검" />);

    await addOption('에르그');
    const popover = await screen.findByRole('tooltip');
    fireEvent.click(within(popover).getByRole('button', { name: '확인' }));

    expect(screen.queryByRole('button', { name: /에르그/ })).toBeNull();
  });
});

describe('무리아스 유물 상세 검색', () => {
  it('유물이 아닌 카테고리에서는 고르게 하지 않는다', async () => {
    render(<Harness category="검" />);
    expect(await offeredOptions()).not.toContain('무리아스 유물');
  });

  it('옵션 이름을 고르면 레벨마다 그 옵션의 수치를 붙여 고르게 한다', async () => {
    render(<Harness category="유물" />);

    await addOption('무리아스 유물');
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

describe('색상 상세 검색', () => {
  it('색상을 눌러도 고르기 전에는 값이 들어가지 않는다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');
    const popover = await screen.findByRole('tooltip');

    // 아무 채널도 채우지 않았으니 조건이 아니다. 배지는 그대로 "색상" 이고 지우기 단추도 없다.
    expect(within(popover).getByLabelText('R 최소')).toHaveValue('');
    expect(within(popover).getByLabelText('G 최대')).toHaveValue('');
    expect(screen.getByRole('button', { name: '색상' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /조건 모두 지우기/ })).toBeNull();
  });

  it('채널마다 범위를 넣으면 그 채널만 조건이 되어 단추에 보인다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');
    const popover = await screen.findByRole('tooltip');
    fireEvent.change(within(popover).getByLabelText('R 최소'), { target: { value: '100' } });
    fireEvent.change(within(popover).getByLabelText('R 최대'), { target: { value: '200' } });

    expect(screen.getByRole('button', { name: /색상 R 100~200/ })).toBeInTheDocument();
  });

  it('유사도를 켜면 기준값과 오차를 넣고, 받아들이는 범위를 숫자로 보여 준다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');
    const popover = await screen.findByRole('tooltip');
    fireEvent.click(within(popover).getByLabelText('G 유사도'));
    fireEvent.change(within(popover).getByLabelText('G 기준값'), { target: { value: '120' } });

    // 오차는 처음에 10% 라 120 ± 25.5 다.
    expect(await within(popover).findByText('94.5~145.5')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /색상 G 120 ±10%/ })).toBeInTheDocument();
  });
});
