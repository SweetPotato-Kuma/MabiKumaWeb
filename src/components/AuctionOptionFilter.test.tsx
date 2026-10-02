import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { DetailConditionBadges, DetailOptionsModal } from '@/components/AuctionOptionFilter';
import { hasDetailOptions } from '@/features/auction/optionKinds';
import {
  buildOptionCatalog,
  EMPTY_OPTION_FILTER,
  type OptionFilter,
} from '@/features/auction/optionFilter';

vi.setConfig({ testTimeout: 20_000 });

const relicCatalog = buildOptionCatalog([
  {
    item_option: [
      {
        option_type: '무리아스 유물',
        option_value: '오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)',
      },
    ],
  },
]);

const petCatalog = buildOptionCatalog([
  {
    item_option: [
      { option_type: '펫 정보', option_sub_type: '종족명', option_value: '스쿠터' },
      { option_type: '펫 정보', option_sub_type: '레벨', option_value: '106' },
    ],
  },
  {
    item_option: [
      { option_type: '펫 정보', option_sub_type: '종족명', option_value: '귀여운 잭' },
      { option_type: '펫 정보', option_sub_type: '레벨', option_value: '132' },
    ],
  },
]);

const catalogFor = (category: string) =>
  category === '유물' ? relicCatalog : category === '분양 메달' ? petCatalog : [];

/** 창과 건 조건 배지를 함께 둔 틀. 창에서 검색을 눌러야 건 조건이 되어 배지로 남는다. */
function Harness({
  category,
  onSearch = () => {},
  matches = () => 0,
  total = 0,
  onCancel = () => {},
}: {
  category: string;
  onSearch?: (filter: OptionFilter) => void;
  matches?: (filter: OptionFilter) => number;
  total?: number;
  onCancel?: () => void;
}) {
  const [filter, setFilter] = useState<OptionFilter>(EMPTY_OPTION_FILTER);
  return (
    <AppProviders>
      <DetailConditionBadges value={filter} onChange={setFilter} onOpen={() => {}} />
      <DetailOptionsModal
        initial={EMPTY_OPTION_FILTER}
        catalog={catalogFor(category)}
        names={null}
        category={category}
        countMatches={matches}
        total={total}
        onCancel={onCancel}
        onSearch={(next: OptionFilter) => {
          setFilter(next);
          onSearch(next);
        }}
      />
    </AppProviders>
  );
}

/** 옵션 추가 줄의 단추로 옵션 칸을 더한다. */
const addOption = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }));

const OPTION_NAMES = ['세공', '인챈트', '특별 개조', '에르그', '색상', '무리아스 유물', '펫 정보'];
const chipNames = () =>
  screen
    .getAllByRole('button')
    .map((button: HTMLElement) => button.textContent ?? '')
    .filter((text: string) => OPTION_NAMES.includes(text));

describe('상세 옵션 창', () => {
  it('장비 카테고리에서는 세공, 인챈트, 특별 개조, 에르그, 색상 칸을 더하게 한다', () => {
    render(<Harness category="검" />);

    expect(chipNames()).toEqual(['세공', '인챈트', '특별 개조', '에르그', '색상']);
  });

  it('유물에서는 무리아스 유물 옵션만 더하게 한다. 세공은 쓸모가 없다', () => {
    render(<Harness category="유물" />);

    expect(chipNames()).toEqual(['무리아스 유물']);
  });

  it('붙는 옵션이 없는 카테고리에서는 고를 것이 없다고 알린다', () => {
    render(<Harness category="포션" />);

    expect(chipNames()).toEqual([]);
    expect(screen.getByText('이 카테고리에서는 고를 수 있는 옵션이 없습니다.')).toBeInTheDocument();
  });

  it('더한 옵션은 칸으로 쌓이고 더하는 단추에서는 빠진다', () => {
    render(<Harness category="검" />);

    addOption('색상');

    expect(screen.getByRole('button', { name: '색상 옵션 삭제' })).toBeInTheDocument();
    expect(chipNames()).toEqual(['세공', '인챈트', '특별 개조', '에르그']);
  });

  it('검색을 누르면 건 조건이 배지로 요약된다. 누르기 전에는 걸리지 않는다', () => {
    render(<Harness category="검" />);
    addOption('색상');

    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('R 최대'), { target: { value: '200' } });
    expect(screen.queryByText(/색상 R 100~200/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(screen.getByText(/색상 R 100~200/)).toBeInTheDocument();
  });

  it('취소하면 고친 것이 버려진다', () => {
    const onCancel = vi.fn();
    const onSearch = vi.fn();
    render(<Harness category="검" onCancel={onCancel} onSearch={onSearch} />);
    addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.queryByText(/색상 R 100/)).toBeNull();
  });

  it('불러온 매물이 있으면 고른 조건에 몇 건이 맞는지 아래에 보인다', () => {
    const matches = vi.fn(() => 3);
    render(<Harness category="검" total={12} matches={matches} />);

    expect(screen.getByText('불러온 12건')).toBeInTheDocument();
    addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });

    expect(screen.getByText('불러온 12건 중 3건 일치')).toBeInTheDocument();
  });

  it('불러온 매물이 없으면 건수를 보이지 않는다', () => {
    render(<Harness category="검" total={0} />);

    expect(screen.queryByText(/불러온/)).toBeNull();
  });

  it('값을 넣지 않은 옵션 칸은 배지가 없다', () => {
    render(<Harness category="검" />);

    addOption('에르그');

    expect(screen.getByRole('button', { name: '에르그 옵션 삭제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '조건 모두 지우기' })).toBeNull();
  });

  it('검색을 누르면 값을 넣은 조건만 넘긴다', () => {
    const onSearch = vi.fn();
    render(<Harness category="검" onSearch={onSearch} />);
    addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });
    // 값을 넣지 않은 옵션 칸은 조건이 아니라서 넘기지 않는다.
    addOption('에르그');

    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch.mock.calls[0][0].conditions).toHaveLength(1);
    expect(onSearch.mock.calls[0][0].conditions[0]).toMatchObject({ kind: 'color' });
  });

  it('칸을 지우면 그 옵션이 빠지고 다시 더할 수 있다', () => {
    render(<Harness category="검" />);
    addOption('에르그');

    fireEvent.click(screen.getByRole('button', { name: '에르그 옵션 삭제' }));

    expect(screen.queryByRole('button', { name: '에르그 옵션 삭제' })).toBeNull();
    expect(chipNames()).toContain('에르그');
  });

  it('배지의 모두 지우기로 건 조건을 한꺼번에 뺀다', () => {
    render(<Harness category="검" />);
    addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));
    expect(screen.getByText(/색상 R 100/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '조건 모두 지우기' }));

    expect(screen.queryByText(/색상 R 100/)).toBeNull();
  });

  it('창의 모두 지우기는 칸까지 비운다', () => {
    render(<Harness category="검" />);
    addOption('색상');
    addOption('에르그');

    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));

    expect(screen.queryByRole('button', { name: /옵션 삭제/ })).toBeNull();
    expect(screen.getByRole('button', { name: '모두 지우기' })).toBeDisabled();
  });

  it('걸린 조건이 없으면 배지 줄을 그리지 않는다', () => {
    render(<Harness category="검" />);

    expect(screen.queryByText('상세 검색')).toBeNull();
  });
});

describe('열어 볼 옵션이 있는지', () => {
  it('장비, 유물, 분양 메달은 있고 포션은 없다. 불러온 매물에 걸 옵션이나 건 조건이 있으면 있다', () => {
    expect(hasDetailOptions('검', [], EMPTY_OPTION_FILTER)).toBe(true);
    expect(hasDetailOptions('유물', [], EMPTY_OPTION_FILTER)).toBe(true);
    expect(hasDetailOptions('분양 메달', [], EMPTY_OPTION_FILTER)).toBe(true);
    expect(hasDetailOptions('포션', [], EMPTY_OPTION_FILTER)).toBe(false);
    expect(
      hasDetailOptions(
        '포션',
        buildOptionCatalog([{ item_option: [{ option_type: '내구력', option_value: '5' }] }]),
        EMPTY_OPTION_FILTER,
      ),
    ).toBe(true);
  });
});

describe('무리아스 유물 상세 검색', () => {
  it('옵션 이름을 고르면 레벨마다 그 옵션의 수치를 붙여 고르게 한다', async () => {
    render(<Harness category="유물" />);

    addOption('무리아스 유물');
    fireEvent.change(screen.getByLabelText('무리아스 유물 스킬 옵션'), {
      target: { value: '오버 드라이브 폭발 공격 대미지' },
    });
    fireEvent.mouseDown(screen.getByLabelText('무리아스 유물 최소 레벨'));

    expect(await screen.findByText('7레벨 (490%)')).toBeInTheDocument();
    fireEvent.click(screen.getByText('7레벨 (490%)'));
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(
      await screen.findByText(/무리아스 유물 오버 드라이브 폭발 공격 대미지 7레벨 이상/),
    ).toBeInTheDocument();
  });
});

describe('색상 상세 검색', () => {
  it('옵션 칸을 더해도 고르기 전에는 값이 들어가지 않는다', () => {
    render(<Harness category="검" />);

    addOption('색상');

    // 아무 채널도 채우지 않았으니 조건이 아니다. 배지도 지우기 단추도 없다.
    expect(screen.getByLabelText('R 최소')).toHaveValue('');
    expect(screen.getByLabelText('G 최대')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /조건 모두 지우기/ })).toBeNull();
  });

  it('유사도를 켜면 기준값과 오차를 넣고, 받아들이는 범위를 숫자로 보여 준다', async () => {
    render(<Harness category="검" />);

    addOption('색상');
    fireEvent.click(screen.getByLabelText('G 유사도'));
    fireEvent.change(screen.getByLabelText('G 기준값'), { target: { value: '120' } });

    // 오차는 처음에 10% 라 120 ± 25.5 다.
    expect(await screen.findByText('94.5~145.5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));
    expect(screen.getByText(/색상 G 120 ±10%/)).toBeInTheDocument();
  });
});

describe('펫 정보 상세 검색', () => {
  it('분양 메달에서는 펫 정보 칸만 더하게 한다', () => {
    render(<Harness category="분양 메달" />);

    expect(chipNames()).toEqual(['펫 정보']);
  });

  it('처음에는 종족명으로 찾고, 매물에 있는 종족명을 자동완성한다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="분양 메달" onSearch={onSearch} />);

    addOption('펫 정보');
    fireEvent.change(screen.getByLabelText('펫 종족명'), { target: { value: '스쿠' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    expect(onSearch.mock.calls[0][0].conditions[0]).toMatchObject({ kind: 'pet', field: '종족명', text: '스쿠' });
    expect(await screen.findByText(/펫 정보 종족명 "스쿠"/)).toBeInTheDocument();
  });

  it('항목을 레벨로 바꾸면 숫자 이상으로 찾는다. 줄을 더해 종족명과 함께 걸 수 있다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="분양 메달" onSearch={onSearch} />);

    addOption('펫 정보');
    fireEvent.mouseDown(screen.getByRole('combobox', { name: '펫 정보 항목' }));
    fireEvent.click(await screen.findByTitle('레벨'));
    fireEvent.change(screen.getByLabelText('펫 레벨 최솟값'), { target: { value: '120' } });
    fireEvent.click(screen.getByRole('button', { name: '펫 조건 추가' }));
    // 더한 줄은 쓰지 않은 항목(종족명)으로 시작한다.
    fireEvent.change(screen.getByLabelText('펫 종족명'), { target: { value: '잭' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    expect(onSearch.mock.calls[0][0].conditions).toEqual([
      expect.objectContaining({ kind: 'pet', field: '레벨', min: 120 }),
      expect.objectContaining({ kind: 'pet', field: '종족명', text: '잭' }),
    ]);
  });
});
