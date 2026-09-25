import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { SearchOutlined } from '@ant-design/icons';
import {
  AutoComplete,
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
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { CategoryPicker } from '@/components/CategoryPicker';
import { EquipmentDetail } from '@/components/equipment/EquipmentDetail';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoDetail } from '@/components/ItemInfoDetail';
import { NameSuggestionLabel } from '@/components/NameSuggestionLabel';
import { QueryState } from '@/components/QueryState';
import { ITEMS_PATH, itemInfoPath, normalizeForSearch } from '@/features/auction/dictionary';
import { searchNames, useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { isEquipmentCategory } from '@/features/equipment/api';
import { preloadItemIcons, useItemCards } from '@/features/itemcard/cards';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';

const { Title, Text } = Typography;

/**
 * 그림 칸 크기. 아이콘은 인벤토리 칸(24px) 단위라 48x48 이 가장 많다. 48 이면 넷 중 셋이
 * 원래 크기 그대로 들어간다. 카드가 없어도 자리는 비워 둔다. 행마다 높이가 달라지면 표가 들썩인다.
 */
const ICON_BOX = 48;

/** 목록은 맞는 것 전부를 보여 준다. 자동완성처럼 개수를 자르지 않는다. */
const NO_LIMIT = Number.POSITIVE_INFINITY;

/** 자동완성에 보여 줄 개수. 경매장과 같다. */
const SUGGESTION_LIMIT = 20;

interface ItemRow {
  name: string;
  category: string;
}

/** 카테고리 목록으로 돌아가는 주소. 비우면 카테고리를 고르지 않은 목록이다. */
const listPath = (category: string) =>
  category ? `${ITEMS_PATH}?category=${encodeURIComponent(category)}` : ITEMS_PATH;

/**
 * 아이템 정보.
 *
 * 카테고리와 이름을 주소에 둔다. 이름까지 있으면 그 아이템의 상세를 보여 준다. 장비면
 * 시뮬레이터, 아니면 그림과 설명이다. 목록에서 상세로 갈 때는 방문 기록을 남기므로 뒤로 가기로
 * 보던 목록에 돌아온다. 경매장 매물 상세에서도 같은 주소로 넘어온다.
 *
 * 상세를 보는 동안에도 목록은 내리지 않고 숨겨 둔다. 검색어와 보던 쪽이 목록 안에 들어 있어서,
 * 내렸다 다시 그리면 천 개 넘는 카테고리에서 첫 쪽부터 다시 넘겨야 한다.
 */
export function ItemsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const category = searchParams.get('category') ?? '';
  const detailName = searchParams.get('name') ?? '';

  /**
   * 목록이 보던 카테고리. 전체에서 찾다가 상세를 열면 주소의 카테고리가 그 아이템 것으로 바뀐다.
   * 그 값을 숨겨 둔 목록에 그대로 넘기면 목록이 그 카테고리로 바뀌고 보던 쪽을 잃는다.
   * 그래서 목록이 보일 때의 카테고리만 따라간다.
   */
  const [listCategory, setListCategory] = useState(category);
  if (!detailName && listCategory !== category) setListCategory(category);

  return (
    <>
      {detailName ? (
        <Flex vertical gap={20}>
          <Flex vertical gap={6}>
            <Title level={3} style={{ margin: 0 }}>
              아이템 정보
            </Title>
            <Breadcrumb
              items={[
                { title: <Link to={listPath('')}>목록</Link> },
                ...(category ? [{ title: <Link to={listPath(category)}>{category}</Link> }] : []),
                { title: detailName },
              ]}
            />
          </Flex>
          {/* 다른 아이템으로 넘어가면 받아 둔 것과 고른 것을 새로 시작한다. */}
          {isEquipmentCategory(category) ? (
            <EquipmentDetail key={`${category}\u0000${detailName}`} category={category} name={detailName} />
          ) : (
            <ItemInfoDetail key={`${category}\u0000${detailName}`} category={category} name={detailName} />
          )}
        </Flex>
      ) : null}

      <div hidden={detailName !== ''}>
        <ItemList
          category={listCategory}
          // 카테고리를 바꿀 때마다 방문 기록이 쌓이면 뒤로 가기가 쓸모없어진다. 자리만 바꾼다.
          onCategoryChange={(next) => setSearchParams(next ? { category: next } : {}, { replace: true })}
        />
      </div>
    </>
  );
}

function ItemList({
  category,
  onCategoryChange: setCategory,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
}) {
  const navigate = useNavigate();
  const nameIndexQuery = useItemNameIndexQuery();
  const index = nameIndexQuery.data;
  const [keyword, setKeyword] = useState('');

  /**
   * 목록과 자동완성은 경매장과 같은 이름 인덱스 한 파일로 찾는다. 띄어쓰기를 무시하고 초성도 받는다.
   * 계산은 useDeferredValue 로 입력칸 뒤로 미룬다. 전체 15,000개를 훑어도 입력이 밀리지 않는다.
   */
  const deferredKeyword = useDeferredValue(keyword);
  const hasKeyword = normalizeForSearch(deferredKeyword) !== '';

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    if (!index) return map;
    for (const categoryIndex of index.categoryOf) {
      const name = index.categories[categoryIndex];
      map[name] = (map[name] ?? 0) + 1;
    }
    return map;
  }, [index]);

  /**
   * 카테고리를 골랐으면 그 안에서, 아니면 전체에서 찾는다. 전체에서 찾을 때 같은 이름이 여러
   * 카테고리에 있으면 카테고리마다 한 줄씩 둔다. 장비 정보와 카드가 카테고리마다 따로다.
   */
  const rows = useMemo<ItemRow[]>(() => {
    if (!index || (!category && !hasKeyword)) return [];
    return searchNames(index, deferredKeyword, { category, limit: NO_LIMIT }).flatMap((item) =>
      category
        ? [{ name: item.name, category }]
        : item.categories.map((itemCategory) => ({ name: item.name, category: itemCategory })),
    );
  }, [index, category, hasKeyword, deferredKeyword]);

  const suggestionOptions = useMemo(() => {
    if (!index || !hasKeyword) return [];
    return searchNames(index, deferredKeyword, { category, limit: SUGGESTION_LIMIT }).map((item) => ({
      value: item.name,
      label: <NameSuggestionLabel item={item} showCategory={!category} />,
      item,
    }));
  }, [index, hasKeyword, deferredKeyword, category]);

  /**
   * 쪽을 넘기는 일을 antd 에 맡기지 않고 직접 들고 있는 이유는 카드 때문이다.
   * 카드는 "지금 보이는 이름"만 물어서 받아 오므로, 무엇이 보이는지를 화면이 알아야 한다.
   * 카테고리나 검색어가 바뀌면 첫 쪽으로 돌아간다.
   */
  const { page, pageSize, pagination } = useListPagination(`${category}|${deferredKeyword}`);

  /**
   * 카드는 지금 쪽과 다음 쪽을 한 번에 묻는다. 10줄씩이면 20개라 요청은 그대로 한 번이다.
   * 다음 쪽 그림도 미리 받아 두어, 넘기는 순간 그림이 이미 와 있게 한다.
   */
  const cardKeys = useMemo(() => rows.slice((page - 1) * pageSize, (page + 1) * pageSize), [rows, page, pageSize]);
  const cardOf = useItemCards(cardKeys);
  useEffect(() => {
    preloadItemIcons(cardKeys.slice(pageSize).map((row) => cardOf(row.category, row.name)));
  }, [cardKeys, pageSize, cardOf]);

  /** 목록 아래쪽에서 눌러도 상세는 맨 위부터 보이게 한다. */
  const open = (row: ItemRow) => {
    window.scrollTo({ top: 0 });
    navigate(itemInfoPath(row.category, row.name));
  };

  /**
   * 자동완성에서 고르면 그 아이템으로 바로 간다. 목록에서 한 번 더 누를 이유가 없다.
   * 같은 이름이 여러 카테고리에 있으면 어느 것인지 모르므로 목록에 줄을 펼쳐 고르게 한다.
   */
  const selectSuggestion = (name: string) => {
    setKeyword(name);
    const picked = suggestionOptions.find((option) => option.value === name)?.item;
    const target = category || (picked?.categories.length === 1 ? picked.categories[0] : '');
    if (target) open({ name, category: target });
  };

  /** 키보드로도 닿아야 하므로 줄에 초점을 주고 Enter 와 Space 를 받는다. */
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
      key: 'icon',
      width: ICON_BOX + 16,
      render: (_value, row) => <ItemIcon card={cardOf(row.category, row.name)} size={ICON_BOX} />,
    },
    {
      title: '아이템 이름',
      key: 'name',
      render: (_value, row) => {
        const card = cardOf(row.category, row.name);
        // 전체에서 찾을 때는 어느 카테고리의 줄인지 적는다. 같은 이름이 두 줄일 수 있다.
        const secondary = [category ? '' : row.category, card?.subtitle ?? ''].filter(Boolean).join(' · ');
        return (
          <Flex vertical gap={2}>
            <Text strong>{row.name}</Text>
            {secondary ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {secondary}
              </Text>
            ) : null}
          </Flex>
        );
      },
    },
    {
      title: '시세',
      key: 'price',
      width: 140,
      align: 'right',
      render: (_value, row) => (
        <Link
          to={`/auction?keyword=${encodeURIComponent(row.name)}&category=${encodeURIComponent(row.category)}`}
          // 줄 전체가 상세를 여는 단추다. 이 단추를 눌렀을 때는 상세로 같이 넘어가지 않게 막는다.
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

  if (nameIndexQuery.isPending) {
    return (
      <Card aria-busy="true">
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (!index) {
    return (
      <Flex vertical gap={20}>
        <Title level={3} style={{ margin: 0 }}>
          아이템 정보
        </Title>
        <Card>
          <Empty description="아이템 목록이 아직 준비되지 않았습니다. 수집이 한 번 돌고 나면 채워집니다." />
        </Card>
      </Flex>
    );
  }

  const scopeCount = category ? (counts[category] ?? 0) : index.names.length;

  return (
    <Flex vertical gap={20}>
      <Flex vertical gap={6}>
        <Title level={3} style={{ margin: 0 }}>
          아이템 정보
        </Title>
        <Text type="secondary">
          경매장에서 관측한 아이템 <span className="tnum">{formatNumber(index.names.length)}</span>개입니다.{' '}
          {index.updated} 기준이며, 경매장에 한 번도 올라오지 않은 아이템은 빠져 있습니다. 장비는 개조, 세공,
          인챈트를 골라 능력치를 미리 볼 수 있습니다.
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
            {/* 전체에서 찾는 일은 검색칸이 맡는다. 트리에는 고를 카테고리만 둔다. */}
            <CategoryPicker value={category} onChange={setCategory} counts={counts} showAll={false} />
          </Card>
        </Col>

        <Col xs={24} md={15} lg={16}>
          <Flex vertical gap={16}>
            <Card variant="outlined" size="small">
              <Flex vertical gap={10}>
                <Form layout="vertical" style={{ marginBottom: 0 }}>
                  <Form.Item label="이름으로 찾기" htmlFor="items-keyword" style={{ marginBottom: 0 }}>
                    <AutoComplete
                      id="items-keyword"
                      value={keyword}
                      options={suggestionOptions}
                      onChange={(value: string) => setKeyword(value)}
                      onSelect={selectSuggestion}
                      style={{ width: '100%' }}
                    >
                      <Input placeholder="예: 숏 소드, ㅅㅅㄷ" allowClear />
                    </AutoComplete>
                  </Form.Item>
                </Form>

                <Flex gap={8} wrap align="center">
                  {category ? (
                    <Tag closable onClose={() => setCategory('')}>
                      {category}
                    </Tag>
                  ) : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {category
                      ? `${category} 안에서 찾습니다. 카테고리를 지우면 전체에서 찾습니다.`
                      : '전체 카테고리에서 이름 일부나 초성으로 찾습니다. 카테고리를 고르면 그 안에서만 찾습니다.'}
                  </Text>
                </Flex>
              </Flex>
            </Card>

            {!category && !hasKeyword ? (
              <Card>
                <Empty description="아이템 이름을 입력하거나 카테고리를 고르면 목록이 나옵니다." />
              </Card>
            ) : (
              <QueryState
                isLoading={false}
                error={null}
                isEmpty={rows.length === 0}
                emptyMessage={
                  hasKeyword
                    ? `${category || '전체'}에서 "${deferredKeyword.trim()}" 와 맞는 이름이 없습니다. 글자를 줄이거나 카테고리를 지워 보세요.`
                    : `${category} 카테고리에 모인 이름이 아직 없습니다.`
                }
              >
                <Flex vertical gap={10}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {category || '전체'} <span className="tnum">{formatNumber(scopeCount)}</span>개 가운데{' '}
                    <span className="tnum">{formatNumber(rows.length)}</span>개를 보고 있습니다. 줄을 누르면 상세가
                    열리고, 장비는 개조, 세공, 인챈트를 골라 보는 시뮬레이터가 열립니다.
                  </Text>
                  <Table<ItemRow>
                    columns={columns}
                    dataSource={rows}
                    rowKey={(row) => `${row.category}\u0000${row.name}`}
                    size="small"
                    pagination={pagination}
                    onRow={openRow}
                  />
                </Flex>
              </QueryState>
            )}
          </Flex>
        </Col>
      </Row>
    </Flex>
  );
}
