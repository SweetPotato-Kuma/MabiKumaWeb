import { useDeferredValue, useMemo, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Breadcrumb,
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
import { CraftingCost } from '@/components/crafting/CraftingCost';
import { EmptyState } from '@/components/EmptyState';
import { QueryState } from '@/components/QueryState';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { isInitialsOnly, toInitials } from '@/features/auction/nameIndex';
import {
  CRAFTING_PATH,
  craftingPath,
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

/** 스킬 목록 주소. 비우면 전체. */
const listPath = (skill: number | null) =>
  skill === null ? CRAFTING_PATH : `${CRAFTING_PATH}?skill=${skill}`;

const parseId = (value: string | null): number | null => {
  const id = Number(value);
  return value && Number.isInteger(id) ? id : null;
};

/**
 * 제작 비용.
 *
 * 게임 데이터에서 모은 제작법을 스킬별로 나눠 보여 주고, 하나를 고르면 재료 트리와 경매장
 * 시세로 매긴 총액을 보여 준다. 스킬과 아이템을 주소에 둔다. 아이템 정보 화면처럼 상세를 보는
 * 동안에도 목록은 숨겨만 두어, 뒤로 가면 찾던 검색어와 보던 쪽이 그대로 있다.
 */
export function CraftingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const skill = parseId(searchParams.get('skill'));
  const itemId = parseId(searchParams.get('item'));
  const recipeParam = parseId(searchParams.get('recipe'));
  const bookQuery = useRecipeBookQuery();
  const book = bookQuery.data;

  // 목록이 보던 스킬. 상세를 여는 동안 주소의 스킬이 비어도 숨겨 둔 목록은 그대로 둔다.
  const [listSkill, setListSkill] = useState(skill);
  if (itemId === null && listSkill !== skill) setListSkill(skill);

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
          제작 비용
        </Title>
        <Card>
          <EmptyState description="제작법 목록이 아직 준비되지 않았습니다. 수집이 한 번 돌고 나면 채워집니다." />
        </Card>
      </Flex>
    );
  }

  const detailRecipes = itemId === null ? [] : book.recipesOf(itemId);

  return (
    <>
      {itemId !== null ? (
        <Flex vertical gap={20}>
          <Flex vertical gap={6}>
            <Title level={3} style={{ margin: 0 }}>
              제작 비용
            </Title>
            <Breadcrumb
              items={[
                { title: <Link to={listPath(null)}>제작법 목록</Link> },
                ...(detailRecipes[0]
                  ? [
                      {
                        title: (
                          <Link to={listPath(detailRecipes[0].skill)}>
                            {book.skillName(detailRecipes[0].skill)}
                          </Link>
                        ),
                      },
                    ]
                  : []),
                { title: book.itemName(itemId) },
              ]}
            />
          </Flex>
          {detailRecipes.length > 0 ? (
            <CraftingCost
              key={`${itemId}\u0000${recipeParam ?? ''}`}
              book={book}
              itemId={itemId}
              initialRecipe={recipeParam ?? undefined}
            />
          ) : (
            <Card>
              <EmptyState description="이 아이템의 제작법을 찾지 못했습니다. 목록에서 다시 골라 주세요." />
            </Card>
          )}
        </Flex>
      ) : null}

      <div hidden={itemId !== null}>
        <RecipeList
          book={book}
          skill={listSkill}
          // 스킬을 바꿀 때마다 방문 기록이 쌓이면 뒤로 가기가 쓸모없어진다. 자리만 바꾼다.
          onSkillChange={(next) =>
            setSearchParams(next === null ? {} : { skill: String(next) }, { replace: true })
          }
        />
      </div>
    </>
  );
}

/** 이름 일부나 초성으로 찾는다. 아이템 정보와 같은 규칙이다. */
function matchesName(name: string, keyword: string): boolean {
  const term = normalizeForSearch(keyword);
  if (!term) return true;
  const target = normalizeForSearch(name);
  return isInitialsOnly(term) ? toInitials(target).includes(term) : target.includes(term);
}

function RecipeList({
  book,
  skill,
  onSkillChange,
}: {
  book: RecipeBook;
  skill: number | null;
  onSkillChange: (skill: number | null) => void;
}) {
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
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

  const open = (recipe: Recipe) => {
    window.scrollTo({ top: 0 });
    // 같은 아이템의 제작법이 여럿이면 누른 줄의 것을 먼저 보여 준다.
    const several = book.recipesOf(recipe.item).length > 1;
    navigate(craftingPath(recipe.item, several ? recipe.index : undefined));
  };

  /** 키보드로도 닿아야 하므로 줄에 초점을 주고 Enter 와 Space 를 받는다. */
  const openRow = (recipe: Recipe) => ({
    tabIndex: 0,
    style: { cursor: 'pointer' },
    onClick: () => open(recipe),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open(recipe);
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
        return (
          <Flex vertical gap={2}>
            <Text strong>{book.itemName(recipe.item)}</Text>
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
        <span>{each.name}</span>
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
      <Flex vertical gap={6}>
        <Title level={3} style={{ margin: 0 }}>
          제작 비용
        </Title>
        <Text type="secondary">
          게임 데이터에서 모은 제작법{' '}
          <span className="tnum">{formatNumber(book.recipes.length)}</span>개를 스킬별로 나눴습니다(
          {book.updated} 기준). 하나를 고르면 재료 트리와 경매장 시세로 매긴 재료 값을 보여 줍니다.
        </Text>
      </Flex>

      {/* 2단 레이아웃. 768px 미만에서는 스킬 목록이 Select 로 바뀌며 한 단으로 떨어진다. */}
      <Row gutter={[20, 16]}>
        <Col xs={24} md={8} lg={7}>
          <Card variant="outlined" size="small" title="스킬">
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
                placeholder="스킬"
                aria-label="스킬"
                style={{ width: '100%' }}
              />
            )}
          </Card>
        </Col>

        <Col xs={24} md={16} lg={17}>
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
                  description="스킬을 고르거나 만들 아이템 이름을 입력하면 목록이 나옵니다."
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
                    줄을 누르면 재료 트리와 비용이 열립니다.
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
