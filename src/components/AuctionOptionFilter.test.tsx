import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProviders } from '@/app/AppProviders';
import { DetailConditionBadges, DetailOptionsModal } from '@/components/AuctionOptionFilter';
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
  onCancel = () => {},
}: {
  category: string;
  onSearch?: (filter: OptionFilter) => void;
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
        onCancel={onCancel}
        onSearch={(next: OptionFilter) => {
          setFilter(next);
          onSearch(next);
        }}
      />
    </AppProviders>
  );
}

/** 창 맨 위의 세부 옵션 고르기 목록을 연다. */
const openPicker = () => fireEvent.mouseDown(screen.getByRole('combobox', { name: '세부 옵션 선택' }));

/** 세부 옵션 고르기 목록에서 옵션을 골라 칸을 더한다. */
const addOption = async (label: string) => {
  openPicker();
  fireEvent.click(await screen.findByTitle(label));
};

describe('상세 옵션 창', () => {
  it('장비 카테고리는 장비 옵션과 숫자 옵션을 한 목록에서 고른다', async () => {
    render(<Harness category="검" />);

    openPicker();

    for (const label of ['세공', '인챈트', '특별 개조', '에르그', '색상', '세트 효과', '최대 공격', '밸런스']) {
      expect(await screen.findByTitle(label)).toBeInTheDocument();
    }
    expect(screen.getByText('주요 옵션')).toBeInTheDocument();
    expect(screen.getByText('그 밖의 옵션')).toBeInTheDocument();
  });

  it('유물에서는 무리아스 유물 옵션을 두고 세공은 두지 않는다', async () => {
    render(<Harness category="유물" />);

    openPicker();

    expect(await screen.findByTitle('무리아스 유물')).toBeInTheDocument();
    expect(screen.queryByTitle('세공')).toBeNull();
  });

  it('붙는 옵션이 없는 카테고리에서는 고를 것이 없다고 알린다', () => {
    render(<Harness category="말풍선 스티커" />);

    expect(screen.queryByRole('combobox', { name: '세부 옵션 선택' })).toBeNull();
    expect(screen.getByText('이 카테고리에서는 고를 수 있는 옵션이 없습니다.')).toBeInTheDocument();
  });

  it('고른 옵션은 칸으로 쌓인다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');

    expect(screen.getByRole('button', { name: '색상 옵션 삭제' })).toBeInTheDocument();
    openPicker();
    expect(await screen.findByTitle('세공')).toBeInTheDocument();
  });

  it('토템 효과는 능력과 최솟값으로 찾고, 줄을 더해 여러 능력을 함께 건다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="애뮬릿" onSearch={onSearch} />);

    await addOption('토템 효과');
    fireEvent.change(screen.getByLabelText('토템 효과 능력'), { target: { value: '지력' } });
    fireEvent.change(screen.getByLabelText('토템 효과 최솟값'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '토템 효과 조건 추가' }));
    fireEvent.change(screen.getAllByLabelText('토템 효과 능력')[1], { target: { value: '행운' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(onSearch.mock.calls[0][0].conditions).toEqual([
      expect.objectContaining({ kind: 'sub', optionType: '토템 효과', sub: '지력', min: 5 }),
      expect.objectContaining({ kind: 'sub', optionType: '토템 효과', sub: '행운', min: null }),
    ]);
    expect(screen.getByText('토템 효과 지력 5 이상')).toBeInTheDocument();
  });

  it('세트 효과는 이름과 최소 레벨로 찾는다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="검" onSearch={onSearch} />);

    await addOption('세트 효과');
    fireEvent.change(screen.getByLabelText('세트 효과 이름'), { target: { value: '스매시 강화' } });
    fireEvent.change(screen.getByLabelText('세트 효과 최소 레벨'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(onSearch.mock.calls[0][0].conditions[0]).toMatchObject({
      kind: 'named',
      optionType: '세트 효과',
      name: '스매시 강화',
      minLevel: 5,
    });
    expect(screen.getByText('세트 효과 스매시 강화 5레벨 이상')).toBeInTheDocument();
  });

  it('검색을 누르면 건 조건이 배지로 요약된다. 누르기 전에는 걸리지 않는다', async () => {
    render(<Harness category="검" />);
    await addOption('색상');

    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });
    fireEvent.change(screen.getByLabelText('R 최대'), { target: { value: '200' } });
    expect(screen.queryByText(/색상 R 100~200/)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(screen.getByText(/색상 R 100~200/)).toBeInTheDocument();
  });

  it('취소하면 고친 것이 버려진다', async () => {
    const onCancel = vi.fn();
    const onSearch = vi.fn();
    render(<Harness category="검" onCancel={onCancel} onSearch={onSearch} />);
    await addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });

    fireEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.queryByText(/색상 R 100/)).toBeNull();
  });

  it('창 안에 건수를 늘어놓지 않는다', async () => {
    render(<Harness category="분양 메달" />);

    openPicker();
    await screen.findByTitle('펫 정보');

    expect(screen.queryByText(/\d+건/)).toBeNull();
  });

  it('값을 넣지 않은 옵션 칸은 배지가 없다', async () => {
    render(<Harness category="검" />);

    await addOption('에르그');

    expect(screen.getByRole('button', { name: '에르그 옵션 삭제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '조건 모두 지우기' })).toBeNull();
  });

  it('검색을 누르면 값을 넣은 조건만 넘긴다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="검" onSearch={onSearch} />);
    await addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });
    // 값을 넣지 않은 옵션 칸은 조건이 아니라서 넘기지 않는다.
    await addOption('에르그');

    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch.mock.calls[0][0].conditions).toHaveLength(1);
    expect(onSearch.mock.calls[0][0].conditions[0]).toMatchObject({ kind: 'color' });
  });

  it('칸을 지우면 그 옵션이 빠지고 다시 더할 수 있다', async () => {
    render(<Harness category="검" />);
    await addOption('에르그');

    fireEvent.click(screen.getByRole('button', { name: '에르그 옵션 삭제' }));

    expect(screen.queryByRole('button', { name: '에르그 옵션 삭제' })).toBeNull();
    openPicker();
    expect(await screen.findByTitle('에르그')).toBeInTheDocument();
  });

  it('배지의 모두 지우기로 건 조건을 한꺼번에 뺀다', async () => {
    render(<Harness category="검" />);
    await addOption('색상');
    fireEvent.change(screen.getByLabelText('R 최소'), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));
    expect(screen.getByText(/색상 R 100/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '조건 모두 지우기' }));

    expect(screen.queryByText(/색상 R 100/)).toBeNull();
  });

  it('창의 모두 지우기는 칸까지 비운다', async () => {
    render(<Harness category="검" />);
    await addOption('색상');
    await addOption('에르그');

    fireEvent.click(screen.getByRole('button', { name: '모두 지우기' }));

    expect(screen.queryByRole('button', { name: /옵션 삭제/ })).toBeNull();
    expect(screen.getByRole('button', { name: '모두 지우기' })).toBeDisabled();
  });

  it('걸린 조건이 없으면 배지 줄을 그리지 않는다', () => {
    render(<Harness category="검" />);

    expect(screen.queryByText('상세 검색')).toBeNull();
  });
});

describe('무리아스 유물 상세 검색', () => {
  it('옵션 이름을 고르면 레벨마다 그 옵션의 수치를 붙여 고르게 한다', async () => {
    render(<Harness category="유물" />);

    await addOption('무리아스 유물');
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
  it('옵션 칸을 더해도 고르기 전에는 값이 들어가지 않는다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');

    // 아무 채널도 채우지 않았으니 조건이 아니다. 배지도 지우기 단추도 없다.
    expect(screen.getByLabelText('R 최소')).toHaveValue('');
    expect(screen.getByLabelText('G 최대')).toHaveValue('');
    expect(screen.queryByRole('button', { name: /조건 모두 지우기/ })).toBeNull();
  });

  it('유사도를 켜면 기준값과 오차를 넣고, 받아들이는 범위를 숫자로 보여 준다', async () => {
    render(<Harness category="검" />);

    await addOption('색상');
    fireEvent.click(screen.getByLabelText('G 유사도'));
    fireEvent.change(screen.getByLabelText('G 기준값'), { target: { value: '120' } });

    // 오차는 처음에 10% 라 120 ± 25.5 다.
    expect(await screen.findByText('94.5~145.5')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));
    expect(screen.getByText(/색상 G 120 ±10%/)).toBeInTheDocument();
  });
});

describe('펫 정보 상세 검색', () => {
  it('분양 메달에서는 펫 정보를 두고 장비 옵션은 두지 않는다', async () => {
    render(<Harness category="분양 메달" />);

    openPicker();

    expect(await screen.findByTitle('펫 정보')).toBeInTheDocument();
    expect(screen.queryByTitle('세공')).toBeNull();
  });

  it('처음에는 종족명으로 찾고, 매물에 있는 종족명을 자동완성한다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="분양 메달" onSearch={onSearch} />);

    await addOption('펫 정보');
    fireEvent.change(screen.getByLabelText('펫 종족명'), { target: { value: '스쿠' } });
    fireEvent.click(screen.getByRole('button', { name: /^검색$/ }));

    await waitFor(() => expect(onSearch).toHaveBeenCalled());
    expect(onSearch.mock.calls[0][0].conditions[0]).toMatchObject({ kind: 'pet', field: '종족명', text: '스쿠' });
    expect(await screen.findByText(/펫 정보 종족명 "스쿠"/)).toBeInTheDocument();
  });

  it('항목을 레벨로 바꾸면 숫자 이상으로 찾는다. 줄을 더해 종족명과 함께 걸 수 있다', async () => {
    const onSearch = vi.fn();
    render(<Harness category="분양 메달" onSearch={onSearch} />);

    await addOption('펫 정보');
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
