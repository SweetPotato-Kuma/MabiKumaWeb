import { useMemo, useState, type KeyboardEvent } from 'react';
import { Card, Flex, Table, Tag, Typography, type TableColumnsType } from 'antd';
import { IconSlot } from '@/components/crafting/RecipeBrowser';
import { SkillIcon } from '@/components/crafting/RecipeInfo';
import { ItemIcon } from '@/components/ItemIcon';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import {
  materialUseText,
  materialUses,
  rankLabel,
  useRecipeBookQuery,
  usesOfName,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { formatNumber } from '@/lib/format';
import { useListPagination } from '@/lib/useListPagination';

const { Text } = Typography;

/** 줄의 아이템 그림. 제작 스킬별 목록과 같은 크기. */
const ITEM_ICON = 32;
const SKILL_TAG_ICON = 16;

interface UsedInSectionProps {
  name: string;
  /** 줄을 누르면. 만들어지는 아이템의 상세로 보낸다. */
  onOpen: (recipe: Recipe, book: RecipeBook) => void;
}

/**
 * 아이템 정보 상세의 "제작 가능 아이템".
 *
 * 제작 비용(CraftingSection)이 "이걸 만들려면 무엇이 드나" 라면, 여기는 반대 방향이다. 이 아이템을
 * 재료로 쓰는 제작법을 모두 모아, 만들어지는 아이템으로 바로 넘어가게 한다. 그 아이템에서 다시
 * 이 카드를 보면 한 단계씩 따라 올라갈 수 있다. 재료로 쓰이지 않는 아이템이면 아무것도 그리지 않는다.
 *
 * 스킬이 여럿 섞이면 스킬별로 좁혀 볼 수 있게 위에 칸을 둔다. 철괴처럼 수백 개 제작법에 들어가는
 * 재료가 있어서 쪽으로 나눈다.
 */
export function UsedInSection({ name, onOpen }: UsedInSectionProps) {
  const book = useRecipeBookQuery().data;
  if (!book) return null;
  const recipes = usesOfName(book, name);
  if (recipes.length === 0) return null;
  return <UsedInCard key={name} book={book} name={name} recipes={recipes} onOpen={onOpen} />;
}

function UsedInCard({
  book,
  name,
  recipes,
  onOpen,
}: UsedInSectionProps & { book: RecipeBook; recipes: Recipe[] }) {
  const nameIndex = useItemNameIndexQuery().data;
  const [skill, setSkill] = useState<number | null>(null);
  const ids = useMemo(() => book.idsByName(name), [book, name]);

  /** 스킬은 제작 스킬별 목록과 같은 차례로, 그 안에서는 랭크가 낮은 것부터. */
  const sorted = useMemo(() => {
    const order = new Map(book.skills.map((each, index) => [each.id, index]));
    return [...recipes].sort(
      (a, b) =>
        (order.get(a.skill) ?? 0) - (order.get(b.skill) ?? 0) ||
        a.rank - b.rank ||
        book.itemName(a.item).localeCompare(book.itemName(b.item), 'ko'),
    );
  }, [book, recipes]);

  const skillCounts = useMemo(() => {
    const counts = new Map<number, number>();
    for (const recipe of sorted) counts.set(recipe.skill, (counts.get(recipe.skill) ?? 0) + 1);
    return [...counts];
  }, [sorted]);

  const rows = skill === null ? sorted : sorted.filter((recipe) => recipe.skill === skill);
  const { pagination } = useListPagination(skill);

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
      // 카드 제목이 "제작 가능 아이템" 이라 표 머리에서 같은 말을 되풀이하지 않는다.
      title: '이름',
      key: 'item',
      render: (_value, recipe) => {
        const product = book.itemName(recipe.item);
        const category = nameIndex?.categoriesByName.get(product)?.[0];
        const file = book.iconOf(recipe.item);
        const secondary = [book.skillName(recipe.skill), recipe.tool ?? ''].filter(Boolean).join(', ');
        return (
          <Flex gap={10} align="center">
            {category || file ? (
              <ItemIcon category={category} name={product} file={file} size={ITEM_ICON} />
            ) : (
              <IconSlot />
            )}
            <Flex vertical gap={2} style={{ minWidth: 0 }}>
              <Text strong>{product}</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {secondary}
              </Text>
            </Flex>
          </Flex>
        );
      },
    },
    {
      title: '랭크',
      key: 'rank',
      width: 80,
      render: (_value, recipe) => <Text style={{ whiteSpace: 'nowrap' }}>{rankLabel(recipe.rank)}</Text>,
    },
    {
      // 어느 아이템을 넣는지는 페이지 제목에 있다.
      title: '넣는 양',
      key: 'use',
      width: 180,
      render: (_value, recipe) => (
        <Flex vertical gap={2}>
          <Text className="tnum">{materialUseText(recipe, materialUses(recipe, ids))}</Text>
          {recipe.yield > 1 ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              한 번에 {formatNumber(recipe.yield)}개 생산
            </Text>
          ) : null}
        </Flex>
      ),
    },
  ];

  return (
    <Card
      size="small"
      title="제작 가능 아이템"
      extra={
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          제작법 {formatNumber(recipes.length)}개
        </Text>
      }
    >
      <Flex vertical gap={12}>
        {skillCounts.length > 1 ? (
          <Flex gap={6} wrap role="group" aria-label="제작 스킬로 좁히기">
            <Tag.CheckableTag checked={skill === null} onChange={() => setSkill(null)}>
              전체 <span className="tnum">{formatNumber(recipes.length)}</span>
            </Tag.CheckableTag>
            {skillCounts.map(([id, count]) => (
              <Tag.CheckableTag key={id} checked={skill === id} onChange={() => setSkill(id)}>
                <Flex gap={6} align="center">
                  <SkillIcon skillId={id} size={SKILL_TAG_ICON} />
                  <span>
                    {book.skillName(id)} <span className="tnum">{formatNumber(count)}</span>
                  </span>
                </Flex>
              </Tag.CheckableTag>
            ))}
          </Flex>
        ) : null}

        <Table<Recipe>
          columns={columns}
          dataSource={rows}
          rowKey="index"
          size="small"
          pagination={rows.length > 10 ? pagination : false}
          onRow={openRow}
        />
      </Flex>
    </Card>
  );
}
