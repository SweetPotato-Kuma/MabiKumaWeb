import { useDeferredValue, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Card,
  Col,
  Flex,
  Form,
  Grid,
  Input,
  Menu,
  Row,
  Select,
  Skeleton,
  Table,
  Tag,
  Typography,
  type TableColumnsType,
} from 'antd';
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { EmptyState } from '@/components/EmptyState';
import { ItemIcon } from '@/components/ItemIcon';
import { QueryState } from '@/components/QueryState';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { isInitialsOnly, toInitials, useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { isCardStoreConfigured } from '@/features/itemcard/cards';
import { isIconMapConfigured } from '@/features/itemcard/iconMap';
import {
  materialSummary,
  rankLabel,
  stationNote,
  useRecipeBookQuery,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';

const { Title, Text } = Typography;

/** 제작법 줄의 아이템 그림. 제작 비용 트리의 재료 그림과 같은 크기. */
const ITEM_ICON = 32;

/** 스킬 목록의 스킬 그림. 한 줄 높이를 크게 늘리지 않는 크기. */
const SKILL_MENU_ICON = 24;

interface RecipeBrowserProps {
  /** 고른 스킬. null 이면 고르지 않았다. */
  skill: number | null;
  onSkillChange: (skill: number | null) => void;
  /** 줄을 누르면. 아이템 정보 상세로 보낸다. */
  onOpen: (recipe: Recipe, book: RecipeBook) => void;
  /** 제목 아래에 둘 "카테고리별 / 제작 스킬별" 전환. */
  viewSwitch: ReactNode;
}

/** 이름 일부나 초성으로 찾는다. 아이템 정보 목록과 같은 규칙이다. */
function matchesName(name: string, keyword: string): boolean {
  const term = normalizeForSearch(keyword);
  if (!term) return true;
  const target = normalizeForSearch(name);
  return isInitialsOnly(term) ? toInitials(target).includes(term) : target.includes(term);
}

/**
 * 아이템 정보의 "제작 스킬별" 목록.
 *
 * 게임 데이터에서 모은 제작법을 스킬로 나눠 보여 준다. 줄을 누르면 그 아이템의 상세가 열리고,
 * 상세 안에서 재료 트리와 경매장 시세로 매긴 비용을 본다.
 */
export function RecipeBrowser(props: RecipeBrowserProps) {
  const bookQuery = useRecipeBookQuery();
  const book = bookQuery.data;

  if (bookQuery.isPending) {
    return (
      <Card aria-busy="true">
        <Skeleton active paragraph={{ rows: 8 }} />
      </Card>
    );
  }

  if (!book) {
    return (
      <Flex vertical gap={20}>
        <Title level={3} style={{ margin: 0 }}>
          아이템 정보
        </Title>
        {props.viewSwitch}
        <Card>
          <EmptyState description="제작법 목록이 아직 준비되지 않았습니다. 수집이 한 번 돌고 나면 채워집니다." />
        </Card>
      </Flex>
    );
  }

  return <RecipeList {...props} book={book} />;
}

function RecipeList({
  book,
  skill,
  onSkillChange,
  onOpen,
  viewSwitch,
}: RecipeBrowserProps & { book: RecipeBook }) {
  const screens = Grid.useBreakpoint();
  // 그림은 제작법 데이터에 적힌 파일 이름으로 먼저 찾고, 없으면 이름 사전의 카테고리로 찾는다.
  const nameIndex = useItemNameIndexQuery().data;
  const [keyword, setKeyword] = useState('');
  const deferredKeyword = useDeferredValue(keyword);
  const hasKeyword = normalizeForSearch(deferredKeyword) !== '';

  const rows = useMemo(() => {
    if (skill === null && !hasKeyword) return [];
    return book.recipes.filter(
      (recipe) =>
        (skill === null || recipe.skill === skill) &&
        matchesName(book.itemName(recipe.item), deferredKeyword),
    );
  }, [book, skill, hasKeyword, deferredKeyword]);

  const { pagination } = useListPagination(`${skill}|${deferredKeyword}`);

  /** 키보드로도 닿아야 하므로 줄에 초점을 주고 Enter 와 Space 를 받는다. */
  const openRow = (recipe: Recipe) => ({
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onClick: () => onOpen(recipe, book),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      onOpen(recipe, book);
    },
  });

  const columns: TableColumnsType<Recipe> = [
    {
      title: '아이템',
      key: 'name',
      render: (_value, recipe) => {
        const secondary = [
          skill === null ? book.skillName(recipe.skill) : '',
          recipe.tool ?? '',
          stationNote(recipe),
        ]
          .filter(Boolean)
          .join(', ');
        const name = book.itemName(recipe.item);
        const category = nameIndex?.categoriesByName.get(name)?.[0];
        const file = book.iconOf(recipe.item);
        return (
          <Flex gap={10} align="center">
            {category || file ? (
              <ItemIcon category={category} name={name} file={file} size={ITEM_ICON} />
            ) : (
              <IconSlot />
            )}
            <Flex vertical gap={2} style={{ minWidth: 0 }}>
              <Text strong>{name}</Text>
              {secondary ? (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {secondary}
                </Text>
              ) : null}
            </Flex>
          </Flex>
        );
      },
    },
    {
      title: '랭크',
      key: 'rank',
      width: 80,
      render: (_value, recipe) => (
        <Text style={{ whiteSpace: 'nowrap' }}>{rankLabel(recipe.rank)}</Text>
      ),
    },
    {
      title: '재료',
      key: 'materials',
      // 좁은 화면에서는 재료 칸을 뺀다. 이름과 랭크만으로 고르고 상세에서 본다.
      responsive: ['md'],
      render: (_value, recipe) => (
        <Text type="secondary" style={{ fontSize: 13 }}>
          {materialSummary(book, recipe)}
          {recipe.yield > 1 ? ` (${formatNumber(recipe.yield)}개 생산)` : ''}
        </Text>
      ),
    },
  ];

  const skillItems = book.skills.map((each) => ({
    key: String(each.id),
    label: (
      <Flex justify="space-between" align="center" gap={12}>
        <Flex gap={8} align="center" style={{ minWidth: 0 }}>
          <SkillIcon skillId={each.id} size={SKILL_MENU_ICON} />
          <span>{each.name}</span>
        </Flex>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {formatNumber(each.count)}
        </Text>
      </Flex>
    ),
  }));

  const scopeCount =
    skill === null
      ? book.recipes.length
      : (book.skills.find((each) => each.id === skill)?.count ?? 0);
  const scopeName = skill === null ? '전체' : book.skillName(skill);

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        아이템 정보
      </Title>
      {viewSwitch}

      {/* 2단 레이아웃. 768px 미만에서는 스킬 목록이 Select 로 바뀌며 한 단으로 떨어진다. */}
      <Row gutter={[20, 16]}>
        <Col xs={24} md={9} lg={8}>
          <Card variant="outlined" size="small" title="제작 스킬">
            {screens.md ? (
              <Menu
                mode="inline"
                items={skillItems}
                selectedKeys={skill === null ? [] : [String(skill)]}
                onClick={({ key }) => onSkillChange(Number(key))}
                style={{ borderInlineEnd: 'none' }}
              />
            ) : (
              <Select
                value={skill ?? undefined}
                onChange={(value: number) => onSkillChange(value)}
                options={book.skills.map((each) => ({
                  value: each.id,
                  label: `${each.name} (${formatNumber(each.count)})`,
                }))}
                placeholder="제작 스킬"
                aria-label="제작 스킬"
                style={{ width: '100%' }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={15} lg={16}>
          <Flex vertical gap={16}>
            <Card variant="outlined" size="small">
              <Flex vertical gap={10}>
                <Form layout="vertical" style={{ marginBottom: 0 }}>
                  <Form.Item
                    label="만들 아이템 찾기"
                    htmlFor="crafting-keyword"
                    style={{ marginBottom: 0 }}
                  >
                    <Input
                      id="crafting-keyword"
                      value={keyword}
                      onChange={(event) => setKeyword(event.target.value)}
                      placeholder="예: 철괴, ㅊㄱ"
                      allowClear
                    />
                  </Form.Item>
                </Form>
                <Flex gap={8} wrap align="center">
                  {skill !== null ? (
                    <Tag closable onClose={() => onSkillChange(null)}>
                      {scopeName}
                    </Tag>
                  ) : null}
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {skill !== null
                      ? `${scopeName} 제작법 안에서 찾습니다. 스킬을 지우면 전체에서 찾습니다.`
                      : '전체 제작법에서 이름 일부나 초성으로 찾습니다. 스킬을 고르면 그 스킬만 봅니다.'}
                  </Text>
                </Flex>
              </Flex>
            </Card>

            {skill === null && !hasKeyword ? (
              <Card>
                <EmptyState
                  variant="search"
                  description="제작 스킬을 고르거나 만들 아이템 이름을 입력하면 목록이 나옵니다."
                />
              </Card>
            ) : (
              <QueryState
                isLoading={false}
                error={null}
                isEmpty={rows.length === 0}
                emptyMessage={`${scopeName}에서 "${deferredKeyword.trim()}" 와 맞는 제작법이 없습니다. 글자를 줄이거나 스킬을 지워 보세요.`}
              >
                <Flex vertical gap={10}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {scopeName} <span className="tnum">{formatNumber(scopeCount)}</span>개 가운데{' '}
                    <span className="tnum">{formatNumber(rows.length)}</span>개를 보고 있습니다.
                    줄을 누르면 아이템 상세에서 재료 트리와 비용이 열립니다.
                  </Text>
                  <Table<Recipe>
                    columns={columns}
                    dataSource={rows}
                    rowKey="index"
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

/**
 * 그림을 찾을 수 없는 아이템의 자리. 이름이 줄마다 다른 자리에서 시작하지 않게 칸은 비워 둔다.
 * 그림 저장소가 없는 환경에서는 ItemIcon 처럼 자리도 두지 않는다.
 */
export function IconSlot() {
  if (!isCardStoreConfigured() && !isIconMapConfigured()) return null;
  return <div style={{ width: ITEM_ICON, height: ITEM_ICON, flex: `0 0 ${ITEM_ICON}px` }} />;
}
