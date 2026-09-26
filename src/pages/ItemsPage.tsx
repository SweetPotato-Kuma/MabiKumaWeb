import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AutoComplete,
  Breadcrumb,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  Row,
  Segmented,
  Skeleton,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { CategoryPicker } from '@/components/CategoryPicker';
import { CraftingSection } from '@/components/crafting/CraftingSection';
import { RecipeBrowser } from '@/components/crafting/RecipeBrowser';
import { SlidingStack } from '@/components/SlidingStack';
import { EquipmentDetail } from '@/components/equipment/EquipmentDetail';
import { ItemIcon } from '@/components/ItemIcon';
import { ItemInfoDetail } from '@/components/ItemInfoDetail';
import { MarketHistoryCard } from '@/components/market/MarketHistoryCard';
import { NameSuggestionLabel } from '@/components/NameSuggestionLabel';
import { QueryState } from '@/components/QueryState';
import { ITEMS_PATH, itemInfoPath, normalizeForSearch } from '@/features/auction/dictionary';
import {
  searchNames,
  useItemNameIndexQuery,
  type NameSuggestion,
} from '@/features/auction/nameIndex';
import type { Recipe, RecipeBook } from '@/features/crafting/recipes';
import { isEquipmentCategory } from '@/features/equipment/api';
import { iconSrcOf, preloadItemIcons, useItemCards } from '@/features/itemcard/cards';
import { iconFileUrl, useIconMaps } from '@/features/itemcard/iconMap';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';
import { EmptyState } from '@/components/EmptyState';
import { SearchIcon } from '@/components/icons';

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

/** 목록을 무엇으로 나눠 보는지. 경매장 카테고리이거나 제작 스킬이다. */
type ListView = 'category' | 'craft';

const parseId = (value: string | null): number | null => {
  const id = Number(value);
  return value && Number.isInteger(id) ? id : null;
};

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
  const recipeParam = parseId(searchParams.get('recipe'));

  /**
   * 목록이 보던 조건(카테고리, 보기, 스킬). 전체에서 찾다가 상세를 열면 주소의 카테고리가 그 아이템
   * 것으로 바뀐다. 그 값을 숨겨 둔 목록에 그대로 넘기면 목록이 그 카테고리로 바뀌고 보던 쪽을 잃는다.
   * 그래서 목록이 보일 때의 주소만 따라간다.
   */
  const [listSearch, setListSearch] = useState(searchParams.toString());
  if (!detailName && listSearch !== searchParams.toString()) setListSearch(searchParams.toString());
  const listParams = new URLSearchParams(listSearch);
  const listCategory = listParams.get('category') ?? '';
  const listView: ListView = listParams.get('view') === 'craft' ? 'craft' : 'category';
  const listSkill = parseId(listParams.get('skill'));

  // 카테고리나 스킬을 바꿀 때마다 방문 기록이 쌓이면 뒤로 가기가 쓸모없어진다. 자리만 바꾼다.
  const replaceList = (next: Record<string, string>) => setSearchParams(next, { replace: true });

  const viewSwitch = (
    <Segmented<ListView>
      value={listView}
      onChange={(view) => replaceList(view === 'craft' ? { view } : {})}
      options={[
        { value: 'category', label: '카테고리별' },
        { value: 'craft', label: '제작 스킬별' },
      ]}
      aria-label="목록 나누는 방법"
      style={{ alignSelf: 'flex-start' }}
    />
  );

  /**
   * 제작법 목록에서 고르면 그 아이템의 상세로 간다. 사전에 있는 이름이면 그 카테고리로 열어
   * 그림과 장비 시뮬레이터도 함께 보이게 한다. 같은 아이템의 제작법이 여럿이면 누른 것을 먼저 보인다.
   */
  const navigate = useNavigate();
  const nameIndex = useItemNameIndexQuery().data;
  const openRecipe = (recipe: Recipe, book: RecipeBook) => {
    const name = book.itemName(recipe.item);
    const itemCategory = nameIndex?.categoriesByName.get(name)?.[0] ?? '';
    const several = book.idsByName(name).flatMap((id) => book.recipesOf(id)).length > 1;
    window.scrollTo({ top: 0 });
    navigate(`${itemInfoPath(itemCategory, name)}${several ? `&recipe=${recipe.index}` : ''}`);
  };

  return (
    <>
      {detailName ? (
        // 제작 비용 표를 펼쳐 높이가 바뀌면 아래 시세 기록 카드도 미끄러져 내려오게 한다.
        <SlidingStack gap={20}>
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
            <EquipmentDetail
              key={`${category}\u0000${detailName}`}
              category={category}
              name={detailName}
            />
          ) : (
            <ItemInfoDetail
              key={`${category}\u0000${detailName}`}
              category={category}
              name={detailName}
            />
          )}
          {/* 만들 수 있는 아이템이면 재료 트리와 제작 비용. 없으면 아무것도 그리지 않는다. */}
          <CraftingSection
            key={`${detailName}\u0000${recipeParam ?? ''}`}
            name={detailName}
            initialRecipe={recipeParam ?? undefined}
          />
          {/* 시세 기록은 장비든 아니든 같다. 경매장에서 거래된 이름으로 찾는다. */}
          <MarketHistoryCard name={detailName} />
        </SlidingStack>
      ) : null}

      <div hidden={detailName !== ''}>
        {listView === 'craft' ? (
          <RecipeBrowser
            skill={listSkill}
            onSkillChange={(next) =>
              replaceList(
                next === null ? { view: 'craft' } : { view: 'craft', skill: String(next) },
              )
            }
            onOpen={openRecipe}
            viewSwitch={viewSwitch}
          />
        ) : (
          <ItemList
            category={listCategory}
            onCategoryChange={(next) => replaceList(next ? { category: next } : {})}
            viewSwitch={viewSwitch}
          />
        )}
      </div>
    </>
  );
}

function ItemList({
  category,
  onCategoryChange: setCategory,
  viewSwitch,
}: {
  category: string;
  onCategoryChange: (category: string) => void;
  viewSwitch: ReactNode;
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
   *
   * 고른 카테고리 안에 맞는 이름이 없으면 전체로 넓혀 찾는다(widened). 카테고리를 골라 둔 것을
   * 잊고 "ㅅㅇㄹㅂ" 을 치면 소울 리버레이트 무기가 하나도 안 나와 검색이 고장 난 것처럼 보였다.
   * 넓혔다는 것은 화면에 적고, 줄마다 어느 카테고리인지도 적는다.
   */
  const { rows, widened } = useMemo((): { rows: ItemRow[]; widened: boolean } => {
    if (!index || (!category && !hasKeyword)) return { rows: [], widened: false };
    const spread = (items: NameSuggestion[]) =>
      items.flatMap((item) =>
        item.categories.map((itemCategory) => ({ name: item.name, category: itemCategory })),
      );
    const scoped = searchNames(index, deferredKeyword, { category, limit: NO_LIMIT });
    if (!category) return { rows: spread(scoped), widened: false };
    if (scoped.length > 0 || !hasKeyword)
      return { rows: scoped.map((item) => ({ name: item.name, category })), widened: false };
    const everywhere = spread(searchNames(index, deferredKeyword, { limit: NO_LIMIT }));
    return { rows: everywhere, widened: everywhere.length > 0 };
  }, [index, category, hasKeyword, deferredKeyword]);

  /** 자동완성도 목록과 같이, 고른 카테고리에 없으면 전체에서 찾는다. */
  const { suggestionOptions, suggestionsWidened } = useMemo(() => {
    if (!index || !hasKeyword) return { suggestionOptions: [], suggestionsWidened: false };
    const scoped = searchNames(index, deferredKeyword, { category, limit: SUGGESTION_LIMIT });
    const wide = Boolean(category) && scoped.length === 0;
    const items = wide ? searchNames(index, deferredKeyword, { limit: SUGGESTION_LIMIT }) : scoped;
    return {
      suggestionOptions: items.map((item) => ({
        value: item.name,
        label: <NameSuggestionLabel item={item} showCategory={!category || wide} />,
        item,
      })),
      suggestionsWidened: wide && items.length > 0,
    };
  }, [index, hasKeyword, deferredKeyword, category]);

  /**
   * 쪽을 넘기는 일을 antd 에 맡기지 않고 직접 들고 있는 이유는 카드 때문이다.
   * 카드는 "지금 보이는 이름"만 물어서 받아 오므로, 무엇이 보이는지를 화면이 알아야 한다.
   * 카테고리나 검색어가 바뀌면 첫 쪽으로 돌아간다.
   */
  const { page, pageSize, pagination } = useListPagination(`${category}|${deferredKeyword}`);

  /**
   * 그림과 부제는 카테고리별 그림 목록에서 바로 찾는다. 워커에 묻지 않으므로 처음 보는 아이템도
   * 목록이 오는 즉시 그림 10장을 한꺼번에 받는다. 고른 카테고리의 목록은 이름 인덱스를 기다리지
   * 않고 곧바로 받는다. 목록을 받지 못한 카테고리만 예전처럼 워커에 카드를 묻는다.
   *
   * 지금 쪽과 다음 쪽을 같이 보고, 다음 쪽 그림은 미리 받아 두어 넘기는 순간 와 있게 한다.
   */
  const nearRows = useMemo(
    () => rows.slice((page - 1) * pageSize, (page + 1) * pageSize),
    [rows, page, pageSize],
  );
  const mapCategories = useMemo(
    () => [category, ...nearRows.map((row) => row.category)],
    [category, nearRows],
  );
  const maps = useIconMaps(mapCategories);
  const lookupKeys = useMemo(
    () => nearRows.filter((row) => maps.needsLookup(row.category)),
    [nearRows, maps],
  );
  const cardOf = useItemCards(lookupKeys);
  const iconSrcFor = (row: ItemRow) => {
    const brief = maps.brief(row.category, row.name);
    if (brief?.icon) return iconFileUrl(brief.icon);
    const card = cardOf(row.category, row.name);
    return card?.icon ? iconSrcOf(card) : '';
  };
  useEffect(() => {
    preloadItemIcons(nearRows.slice(pageSize).map(iconSrcFor));
  });

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
    // 전체로 넓혀 찾은 것이면 고른 카테고리가 아니라 그 아이템의 카테고리로 연다.
    const scope = suggestionsWidened ? '' : category;
    const target = scope || (picked?.categories.length === 1 ? picked.categories[0] : '');
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
      render: (_value, row) => (
        <ItemIcon
          category={row.category}
          name={row.name}
          card={cardOf(row.category, row.name)}
          size={ICON_BOX}
        />
      ),
    },
    {
      title: '아이템 이름',
      key: 'name',
      render: (_value, row) => {
        const subtitle =
          maps.brief(row.category, row.name)?.subtitle || cardOf(row.category, row.name)?.subtitle;
        // 전체에서 찾을 때는 어느 카테고리의 줄인지 적는다. 같은 이름이 두 줄일 수 있다.
        const secondary = [category && !widened ? '' : row.category, subtitle ?? '']
          .filter(Boolean)
          .join(' · ');
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
          <Button size="small" icon={<SearchIcon />}>
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
        {viewSwitch}
        <Card>
          <EmptyState description="아이템 목록이 아직 준비되지 않았습니다. 수집이 한 번 돌고 나면 채워집니다." />
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
          경매장에서 관측한 아이템 <span className="tnum">{formatNumber(index.names.length)}</span>
          개입니다. {index.updated} 기준이며, 경매장에 한 번도 올라오지 않은 아이템은 빠져 있습니다.
          장비는 개조, 세공, 인챈트를 골라 능력치를 미리 볼 수 있고, 만들 수 있는 아이템은 제작
          비용도 봅니다.
        </Text>
      </Flex>
      {viewSwitch}

      {/* 2단 레이아웃. 768px 미만에서는 카테고리 선택이 Select 로 바뀌며 한 단으로 떨어진다. */}
      <Row gutter={[20, 16]}>
        <Col xs={24} md={9} lg={8}>
          {/* 카드 안에 스크롤을 두지 않는다. 까닭은 경매장 화면의 categoryPanel 주석에 있다. */}
          <Card variant="outlined" size="small" title="카테고리">
            {/* 전체에서 찾는 일은 검색칸이 맡는다. 트리에는 고를 카테고리만 둔다. */}
            <CategoryPicker
              value={category}
              onChange={setCategory}
              counts={counts}
              showAll={false}
            />
          </Card>
        </Col>

        <Col xs={24} md={15} lg={16}>
          <Flex vertical gap={16}>
            <Card variant="outlined" size="small">
              <Flex vertical gap={10}>
                <Form layout="vertical" style={{ marginBottom: 0 }}>
                  <Form.Item
                    label="이름으로 찾기"
                    htmlFor="items-keyword"
                    style={{ marginBottom: 0 }}
                  >
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
                <EmptyState
                  variant="search"
                  description="아이템 이름을 입력하거나 카테고리를 고르면 목록이 나옵니다."
                />
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
                  {widened ? (
                    <Text type="warning" style={{ fontSize: 12 }}>
                      {category}에는 "{deferredKeyword.trim()}" 와 맞는 이름이 없어 전체
                      카테고리에서 찾은 <span className="tnum">{formatNumber(rows.length)}</span>
                      개를 보여 줍니다.
                    </Text>
                  ) : (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {category || '전체'} <span className="tnum">{formatNumber(scopeCount)}</span>
                      개 가운데 <span className="tnum">{formatNumber(rows.length)}</span>개를 보고
                      있습니다. 줄을 누르면 상세가 열리고, 장비는 개조, 세공, 인챈트를 골라 보는
                      시뮬레이터가 열립니다.
                    </Text>
                  )}
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
