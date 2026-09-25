import { Link } from 'react-router-dom';
import { Button, Card, Flex, Typography } from 'antd';
import { CraftIcon } from '@/components/icons';
import {
  craftingPath,
  materialSummary,
  recipeTitle,
  stationNote,
  useRecipeBookQuery,
} from '@/features/crafting/recipes';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

/**
 * 아이템 정보 상세에 붙는 제작법 요약. 만들 수 있는 아이템에만 나온다.
 *
 * 여기서는 시세를 묻지 않는다. 아이템 정보를 열 때마다 재료 시세를 여러 번 부르게 되기 때문이다.
 * 값은 단추를 눌러 제작 비용 화면에서 본다.
 */
export function RecipeSummaryCard({ name }: { name: string }) {
  const book = useRecipeBookQuery().data;
  if (!book) return null;

  const recipes = book.idsByName(name).flatMap((id) => book.recipesOf(id));
  if (recipes.length === 0) return null;

  return (
    <Card title="제작법" size="small">
      <Flex vertical gap={16}>
        {recipes.map((recipe) => (
          <Flex key={recipe.index} gap={12} wrap justify="space-between" align="center">
            <Flex vertical gap={2} style={{ minWidth: 0, flex: '1 1 260px' }}>
              <Text strong>
                {recipeTitle(book, recipe)}
                {stationNote(recipe) ? `, ${stationNote(recipe)}` : ''}
              </Text>
              <Text type="secondary" style={{ fontSize: 13 }}>
                {materialSummary(book, recipe)}
                {recipe.yield > 1 ? ` (한 번에 ${formatNumber(recipe.yield)}개)` : ''}
              </Text>
            </Flex>
            <Link to={craftingPath(recipe.item, recipes.length > 1 ? recipe.index : undefined)}>
              <Button icon={<CraftIcon />}>제작 비용 계산</Button>
            </Link>
          </Flex>
        ))}
      </Flex>
    </Card>
  );
}
