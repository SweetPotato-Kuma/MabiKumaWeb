import { useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchOutlined } from '@ant-design/icons';
import {
  Breadcrumb,
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Form,
  Input,
  Row,
  Skeleton,
  Table,
  Typography,
  type TableColumnsType,
} from 'antd';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EquipmentDetail } from '@/components/equipment/EquipmentDetail';
import { QueryState } from '@/components/QueryState';
import { matchItemNames, useCategoryItemNamesQuery, useItemIndexQuery } from '@/features/auction/dictionary';
import { ItemCardModal, type ItemCardTarget } from '@/components/ItemCardModal';
import { ItemIcon } from '@/components/ItemIcon';
import { equipmentPath, isEquipmentCategory } from '@/features/equipment/api';
import { useItemCards } from '@/features/itemcard/cards';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';

const { Title, Text } = Typography;

/**
 * 그림 칸 크기. 아이콘은 인벤토리 칸(24px) 단위라 48x48 이 가장 많다. 48 이면 넷 중 셋이
 * 원래 크기 그대로 들어간다. 카드가 없어도 자리는 비워 둔다. 행마다 높이가 달라지면 표가 들썩인다.
 */
const ICON_BOX = 48;

/** 사전 화면은 목록 전체를 보여 주므로 자동완성처럼 개수를 자르지 않는다. */
const NO_LIMIT = Number.POSITIVE_INFINITY;

interface ItemRow {
  name: string;
  category: string;
}

/** 카테고리 목록으로 돌아가는 주소. 비우면 카테고리를 고르기 전 화면이다. */
const dictionaryPath = (category: string) =>
  category ? `/dictionary?category=${encodeURIComponent(category)}` : '/dictionary';

/**
 * 아이템 사전.
 *
 * 카테고리와 이름을 주소에 둔다. 이름까지 있으면 그 아이템의 상세(장비면 시뮬레이터)를 보여 준다.
 * 목록에서 상세로 갈 때는 방문 기록을 남기므로 뒤로 가기로 보던 카테고리에 돌아온다.
 *
 * 상세를 보는 동안에도 목록은 내리지 않고 숨겨 둔다. 검색어와 보던 쪽이 목록 안에 들어 있어서,
 * 내렸다 다시 그리면 천 개 넘는 카테고리에서 첫 쪽부터 다시 넘겨야 한다.
 */
export function DictionaryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? '';
  const detailName = searchParams.get('name') ?? '';

  return (
    <>
      {detailName ? (
        <Flex vertical gap={20}>
          <Flex vertical gap={6}>
            <Title level={3} style={{ margin: 0 }}>
              아이템 사전
            </Title>
            <Breadcrumb
              items={[
                { title: <Link to={dictionaryPath('')}>전체</Link> },
                ...(category ? [{ title: <Link to={dictionaryPath(category)}>{category}</Link> }] : []),
                { title: detailName },
              ]}
            />
          </Flex>
          {/* 다른 아이템으로 넘어가면 받아 둔 것과 고른 것을 새로 시작한다. */}
          <EquipmentDetail key={`${category}\u0000${detailName}`} category={category} name={detailName} />
        </Flex>
      ) : null}

      <div hidden={detailName !== ''}>
        <DictionaryList
          category={category}
          // 카테고리를 바꿀 때마다 방문 기록이 쌓이면 뒤로 가기가 쓸모없어진다. 자리만 바꾼다.
          onCategoryChange={(next) => setSearchParams(next ? { category: next } : {}, { replace: true })}
        />
      </div>
    </>
  );
}

function DictionaryList({
  category,
  onCategoryChange: setCategory,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
}) {
  const navigate = useNavigate();
  const indexQuery = useItemIndexQuery();
  const [keyword, setKeyword] = useState('');
  const [opened, setOpened] = useState<ItemCardTarget | null>(null);

  const namesQuery = useCategoryItemNamesQuery(category);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const entry of indexQuery.data?.categories ?? []) map[entry.name] = entry.count;
    return map;
  }, [indexQuery.data]);

  const names = useMemo(() => namesQuery.data ?? [], [namesQuery.data]);
  const rows = useMemo<ItemRow[]>(
    () => matchItemNames(names, keyword, NO_LIMIT).map((name) => ({ name, category })),
    [names, keyword, category],
  );

  /**
   * 쪽을 넘기는 일을 antd 에 맡기지 않고 직접 들고 있는 이유는 카드 때문이다.
   * 카드는 "지금 보이는 이름"만 물어서 받아 오므로, 무엇이 보이는지를 화면이 알아야 한다.
   * 카테고리나 검색어가 바뀌면 첫 쪽으로 돌아간다.
   */
  const { page, pageSize, pagination } = useListPagination(`${category}|${keyword}`);
  const visibleNames = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize).map((row) => row.name),
    [rows, page, pageSize],
  );

  const cardKeys = useMemo(
    () => visibleNames.map((name) => ({ category, name })),
    [visibleNames, category],
  );
  const cardOf = useItemCards(cardKeys);

  /**
   * 줄을 누르면 상세를 연다. 장비는 사전 안의 시뮬레이터로 넘어가고, 나머지는 경매장처럼 창을
   * 띄운다. 장비가 아니면 보여 줄 것이 그림과 설명뿐이라 화면을 옮길 이유가 없다.
   * 키보드로도 닿아야 하므로 줄에 초점을 주고 Enter 와 Space 를 받는다.
   */
  const open = (row: ItemRow) => {
    if (isEquipmentCategory(row.category)) {
      // 목록 아래쪽에서 눌러도 상세는 맨 위부터 보이게 한다.
      window.scrollTo({ top: 0 });
      navigate(equipmentPath(row.category, row.name));
    } else setOpened({ category: row.category, name: row.name });
  };
  const openRow = (row: ItemRow) => ({
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onClick: () => open(row),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open(row);
    },
  });

  const columns: TableColumnsType<ItemRow> = [
    {
      title: '',
      dataIndex: 'name',
      key: 'icon',
      width: ICON_BOX + 16,
      render: (name: string, row: ItemRow) => (
        <ItemIcon card={cardOf(row.category, name)} size={ICON_BOX} />
      ),
    },
    {
      title: '아이템 이름',
      dataIndex: 'name',
      render: (name: string) => {
        const card = cardOf(category, name);
        return (
          <Flex vertical gap={2}>
            <Text strong>{name}</Text>
            {card?.subtitle ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {card.subtitle}
              </Text>
            ) : null}
          </Flex>
        );
      },
    },
    {
      title: '시세',
      dataIndex: 'name',
      key: 'price',
      width: 140,
      align: 'right',
      render: (name: string, row: ItemRow) => (
        <Link
          to={`/auction?keyword=${encodeURIComponent(name)}&category=${encodeURIComponent(row.category)}`}
          // 줄 전체가 상세 창을 여는 단추다. 이 단추를 눌렀을 때는 창까지 같이 뜨지 않게 막는다.
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <Button size="small" icon={<SearchOutlined />}>
            시세 보기
          </Button>
        </Link>
      ),
    },
  ];

  if (indexQuery.isPending) {
    return (
      <Card aria-busy="true">
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (!indexQuery.data) {
    return (
      <Flex vertical gap={20}>
        <Title level={3} style={{ margin: 0 }}>
          아이템 사전
        </Title>
        <Card>
          <Empty description="아이템 사전이 아직 준비되지 않았습니다. 수집이 한 번 돌고 나면 채워집니다." />
        </Card>
      </Flex>
    );
  }

  const { total, updated } = indexQuery.data;

  return (
    <Flex vertical gap={20}>
      <Flex vertical gap={6}>
        <Title level={3} style={{ margin: 0 }}>
          아이템 사전
        </Title>
        <Text type="secondary">
          경매장에서 관측한 아이템 이름 <span className="tnum">{formatNumber(total)}</span>개입니다.{' '}
          {updated} 기준이며, 경매장에 한 번도 올라오지 않은 아이템은 빠져 있습니다.
        </Text>
      </Flex>

      {/* 2단 레이아웃. 768px 미만에서는 카테고리 선택이 Select 로 바뀌며 한 단으로 떨어진다. */}
      <Row gutter={[20, 16]}>
        <Col xs={24} md={9} lg={8}>
          <Card
            variant="outlined"
            size="small"
            title="카테고리"
            styles={{ body: { maxHeight: 'calc(100dvh - 280px)', overflowY: 'auto' } }}
          >
            <CategoryPicker value={category} onChange={setCategory} counts={counts} allLabel="고르지 않음" />
          </Card>
        </Col>

        <Col xs={24} md={15} lg={16}>
          {category === '' ? (
            <Card>
              <Empty description="카테고리를 고르면 그 안의 아이템을 볼 수 있습니다. 사전은 카테고리별로 나뉘어 있어 한 번에 한 칸씩 받습니다." />
            </Card>
          ) : (
            <Flex vertical gap={16}>
              <Card variant="outlined" size="small">
                <Form layout="vertical" style={{ marginBottom: 0 }}>
                  <Form.Item label="이름으로 찾기" htmlFor="dictionary-keyword" style={{ marginBottom: 0 }}>
                    <Input
                      id="dictionary-keyword"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="예: 소드"
                      allowClear
                    />
                  </Form.Item>
                </Form>
              </Card>

              <QueryState
                isLoading={namesQuery.isPending}
                error={namesQuery.error}
                isEmpty={rows.length === 0}
                emptyMessage={
                  keyword
                    ? `${category} 안에서 "${keyword}" 와 맞는 이름이 없습니다. 글자를 줄여 보세요.`
                    : `${category} 카테고리에 모인 이름이 아직 없습니다.`
                }
              >
                <Flex vertical gap={10}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {category} <span className="tnum">{formatNumber(names.length)}</span>개 가운데{' '}
                    <span className="tnum">{formatNumber(rows.length)}</span>개를 보고 있습니다.
                    {isEquipmentCategory(category)
                      ? ' 줄을 누르면 개조, 세공, 랜덤 능력치를 골라 보는 장비 시뮬레이터가 열립니다.'
                      : ''}
                  </Text>
                  <Table<ItemRow>
                    columns={columns}
                    dataSource={rows}
                    rowKey="name"
                    size="small"
                    pagination={pagination}
                    onRow={openRow}
                  />
                </Flex>
              </QueryState>
            </Flex>
          )}
        </Col>
      </Row>

      <ItemCardModal item={opened} onClose={() => setOpened(null)} />
    </Flex>
  );
}
