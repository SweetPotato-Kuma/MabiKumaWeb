import { Flex, Grid, Skeleton, Table, Typography, type TableColumnsType } from 'antd';
import { ItemInfoLink } from '@/components/ItemInfoLink';
import { enchantRank, isEnchantNote } from '@/features/equipment/enchant';
import { useSelectableScrolls, type SelectableScroll } from '@/features/enchantScroll/scrolls';

const { Text, Title } = Typography;

/** 접두/접미와 랭크. "접미 4 랭크" */
const kindOf = ({ variants }: SelectableScroll) =>
  variants
    .map((variant) => `${variant.slot === 0 ? '접두' : '접미'} ${enchantRank(variant.level)} 랭크`)
    .join(' / ');

/** 목록 한 줄에 들어갈 효과. 적용 조건과 부가 규칙은 뺀다. */
const effectOf = ({ variants }: SelectableScroll) =>
  [...new Set(variants.flatMap((variant) => variant.desc.filter((line) => !isEnchantNote(line))))].join(', ');

/**
 * 선택 스크롤(탈라 가흐 인챈트 선택 스크롤)로 고를 수 있는 인챈트 스크롤 목록.
 * 이름을 누르면 그 스크롤의 상세로 간다. 선택 스크롤이 아니면 아무것도 그리지 않는다.
 */
export function SelectableScrolls({ name }: { name: string }) {
  const scrolls = useSelectableScrolls(name);
  const screens = Grid.useBreakpoint();

  if (scrolls === undefined) return <Skeleton active title={false} paragraph={{ rows: 6 }} />;
  if (!scrolls) return null;

  const wide: TableColumnsType<SelectableScroll> = [
    {
      title: '인챈트 스크롤',
      key: 'name',
      width: 260,
      render: (_, scroll) => <ItemInfoLink name={scroll.name} category="인챈트 스크롤" />,
    },
    { title: '구분', key: 'kind', width: 120, className: 'tnum', render: (_, scroll) => kindOf(scroll) },
    {
      title: '효과',
      key: 'effect',
      className: 'tnum',
      render: (_, scroll) => effectOf(scroll),
    },
  ];

  // 576px 미만. 효과 칸을 따로 두면 한두 글자만 남고 잘렸다. 이름 아래에 구분과 효과를 적는다.
  const compact: TableColumnsType<SelectableScroll> = [
    {
      title: '인챈트 스크롤',
      key: 'name',
      render: (_, scroll) => (
        <Flex vertical gap={2}>
          <ItemInfoLink name={scroll.name} category="인챈트 스크롤" />
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {kindOf(scroll)}
          </Text>
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {effectOf(scroll)}
          </Text>
        </Flex>
      ),
    },
  ];

  return (
    <Flex vertical gap={8}>
      <Title level={5} style={{ margin: 0 }}>
        선택할 수 있는 인챈트 스크롤 {scrolls.length}개
      </Title>
      <Table<SelectableScroll>
        size="small"
        rowKey="name"
        columns={screens.sm ? wide : compact}
        dataSource={scrolls}
        pagination={{ pageSize: 10, showSizeChanger: false, size: 'small', hideOnSinglePage: true }}
      />
    </Flex>
  );
}
