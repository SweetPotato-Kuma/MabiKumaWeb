import { CraftingCost } from '@/components/crafting/CraftingCost';
import { useRecipeBookQuery } from '@/features/crafting/recipes';

/**
 * 아이템 정보 상세의 제작 비용. 만들 수 있는 아이템에만 나오고, 아니면 아무것도 그리지 않는다.
 *
 * 아이템 정보는 이름으로만 아이템을 안다. 게임에는 이름이 같은 아이템이 따로 있기도 해서
 * (거래 가능한 것과 불가한 것), 그 이름의 제작법을 모두 모아 고르게 한다.
 */
export function CraftingSection({ name, initialRecipe }: { name: string; initialRecipe?: number }) {
  const book = useRecipeBookQuery().data;
  if (!book) return null;

  const recipes = book.idsByName(name).flatMap((id) => book.recipesOf(id));
  if (recipes.length === 0) return null;

  return <CraftingCost book={book} recipes={recipes} initialRecipe={initialRecipe} />;
}
