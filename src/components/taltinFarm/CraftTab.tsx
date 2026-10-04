import { useMemo } from 'react';
import { Card, Flex, Grid, Table, Typography, type TableColumnsType } from 'antd';
import { FarmItemLink, GainCell, GoldCell, MaterialList, type FarmTabProps } from '@/components/taltinFarm/shared';
import { FARM_RECIPES, type FarmRecipe } from '@/features/taltinFarm/data';
import { byGainDesc, recipeOutcome, type RecipeOutcome } from '@/features/taltinFarm/value';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

interface RecipeRow {
  recipe: FarmRecipe;
  outcome: RecipeOutcome;
}

/** 마법의 솥 가공 손익. 가공해서 더 남는 것부터. */
export function CraftTab({ quote, pending, basisControl }: FarmTabProps) {
  const formatGold = useGoldFormatter();
  const screens = Grid.useBreakpoint();
  const wide = screens.md ?? true;

  const rows = useMemo(
    () =>
      FARM_RECIPES.map((recipe): RecipeRow => ({ recipe, outcome: recipeOutcome(recipe, quote) })).sort((a, b) =>
        byGainDesc(a.outcome.gain, b.outcome.gain),
      ),
    [quote],
  );

  const columns: TableColumnsType<RecipeRow> = wide
    ? [
        { title: '가공품', key: 'name', width: 200, render: (_value, row) => <FarmItemLink name={row.recipe.name} short /> },
        {
          title: '필요 농작물',
          key: 'materials',
          render: (_value, row) => <MaterialList materials={row.recipe.materials} quote={quote} />,
        },
        {
          title: '농작물로 팔 때',
          key: 'raw',
          align: 'right',
          width: 140,
          render: (_value, row) => <GoldCell value={row.outcome.raw} pending={pending} />,
        },
        {
          title: '가공해 팔 때',
          key: 'crafted',
          align: 'right',
          width: 140,
          render: (_value, row) => <GoldCell value={row.outcome.crafted} pending={pending} />,
        },
        {
          title: '가공 - 농작물',
          key: 'gain',
          align: 'right',
          width: 130,
          render: (_value, row) => <GainCell value={row.outcome.gain} pending={pending} />,
        },
      ]
    : [
        {
          // 768px 미만에서는 칸을 합친다. 차익만 제 칸에 둔다.
          title: '가공품',
          key: 'name',
          render: (_value, row) => (
            <Flex vertical gap={6}>
              <FarmItemLink name={row.recipe.name} short />
              <MaterialList materials={row.recipe.materials} quote={quote} />
              <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                농작물 {formatGold(row.outcome.raw)}, 가공품 {formatGold(row.outcome.crafted)}
              </Text>
            </Flex>
          ),
        },
        {
          title: '가공 - 농작물',
          key: 'gain',
          align: 'right',
          width: 110,
          render: (_value, row) => <GainCell value={row.outcome.gain} pending={pending} />,
        },
      ];

  return (
    <Flex vertical gap={12}>
      {basisControl}
      <Card variant="outlined" styles={{ body: { padding: 0 } }}>
        <Table<RecipeRow>
          columns={columns}
          dataSource={rows}
          rowKey={(row) => row.recipe.name}
          size="small"
          pagination={false}
        />
      </Card>
    </Flex>
  );
}
