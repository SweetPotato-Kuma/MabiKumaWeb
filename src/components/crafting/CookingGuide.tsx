import { useState } from 'react';
import {
  Flex,
  Segmented,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
  type TableColumnsType,
} from 'antd';
import { SERIES_COLORS } from '@/app/theme';
import { ItemIcon } from '@/components/ItemIcon';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import {
  cookingRatios,
  formatPercent,
  type CookingStep,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { useResolvedThemeMode } from '@/lib/themePreference';

const { Text } = Typography;

/** 재료 그림 칸. 제작 비용 트리의 재료 그림과 같은 크기. */
const MATERIAL_ICON = 32;

/** 게이지 아래 번호를 적을 만큼 넓은 칸(%). 이보다 좁으면 번호끼리 겹친다. */
const MIN_LABELED_PERCENT = 4;

/** 게이지 아래 번호에 재료 이름까지 붙일 만큼 넓은 칸(%). */
const MIN_NAMED_PERCENT = 25;

/** 추가 재료를 넣지 않을 때의 Segmented 값. */
const NO_EXTRA = -1;

/**
 * 요리 재료를 넣는 순서와 비율.
 *
 * 게임의 요리 창은 재료 칸 아래 게이지 하나를 차례로 채운다. 첫 재료를 제 비율만큼, 다음 재료를
 * 그다음 자리까지 채우는 식이라 "몇 %까지" 가 실제로 맞춰야 하는 값이다. 게이지를 그대로 그리고
 * 재료마다 비율과 멈출 자리를 적는다. 추가 재료를 넣으면 비율이 모두 달라져 골라 볼 수 있게 한다.
 */
export function CookingGuide({ book, recipe }: { book: RecipeBook; recipe: Recipe }) {
  const { token } = theme.useToken();
  const [extra, setExtra] = useState(NO_EXTRA);
  const nameIndex = useItemNameIndexQuery().data;
  const categoryOf = (name: string) => nameIndex?.categoriesByName.get(name)?.[0];

  const steps = cookingRatios(recipe, extra === NO_EXTRA ? undefined : extra);
  // 재료마다 색이 다르다. 순서대로 쓰고 돌려 쓰지 않는다. 게임 데이터의 요리 재료는 셋을 넘지 않아
  // (추가 재료는 기본 재료가 둘 이하일 때만 넣는다) 다섯 색이면 넉넉하다.
  const colors = SERIES_COLORS[useResolvedThemeMode()];
  const colorOf = (order: number) => colors[Math.min(order, colors.length - 1)];
  const nameOf = (step: CookingStep) => book.itemName(step.slot.ids[0]);

  const columns: TableColumnsType<CookingStep> = [
    {
      title: '순서',
      key: 'order',
      width: 56,
      render: (_value, _step, order) => (
        <Flex gap={8} align="center">
          <span
            aria-hidden
            style={{
              width: 12,
              height: 12,
              borderRadius: token.borderRadiusXS,
              background: colorOf(order),
              flex: '0 0 12px',
            }}
          />
          <Text className="tnum">{order + 1}</Text>
        </Flex>
      ),
    },
    {
      title: '재료',
      key: 'name',
      render: (_value, step) => {
        const name = nameOf(step);
        const category = categoryOf(name);
        const file = book.iconOf(step.slot.ids[0]);
        return (
          <Flex gap={8} align="center">
            {category || file ? (
              <ItemIcon category={category} name={name} file={file} size={MATERIAL_ICON} />
            ) : null}
            <Text>{name}</Text>
            {step.extra ? <Tag>추가</Tag> : null}
          </Flex>
        );
      },
    },
    {
      title: '비율',
      key: 'percent',
      align: 'right',
      width: 72,
      render: (_value, step) => <Text className="tnum">{formatPercent(step.percent)}</Text>,
    },
    {
      title: '게이지',
      key: 'cumulative',
      align: 'right',
      width: 96,
      render: (_value, step) => (
        <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatPercent(step.cumulative)}까지
        </Text>
      ),
    },
  ];

  return (
    <Flex vertical gap={10}>
      <Text strong>재료 넣는 순서</Text>

      {recipe.extras.length > 0 ? (
        <Segmented<number>
          size="small"
          value={extra}
          onChange={setExtra}
          aria-label="추가 재료"
          options={[
            { value: NO_EXTRA, label: '추가 재료 없음' },
            ...recipe.extras.map((slot, index) => ({
              value: index,
              label: book.itemName(slot.ids[0]),
            })),
          ]}
          style={{ alignSelf: 'flex-start', maxWidth: '100%', overflowX: 'auto' }}
        />
      ) : null}

      {/*
        게임의 요리 게이지. 재료마다 제 비율만큼의 칸을 차지하고, 칸 사이는 바탕색 2px 로 띄운다.
        색만으로 가르지 않게 칸 아래에 번호(넓으면 이름까지)를 적는다.
      */}
      <Flex vertical gap={4}>
        <div
          role="img"
          aria-label={`재료 비율: ${steps.map((step) => `${nameOf(step)} ${formatPercent(step.percent)}`).join(', ')}`}
          style={{ display: 'flex', gap: 2, height: 16 }}
        >
          {steps.map((step, order) => (
            <Tooltip
              key={`${order}-${step.slot.ids[0]}`}
              title={`${order + 1}. ${nameOf(step)} ${formatPercent(step.percent)} (${formatPercent(step.cumulative)}까지)`}
            >
              <div
                style={{
                  flex: `${step.percent} 0 0`,
                  minWidth: 2,
                  background: colorOf(order),
                  borderRadius: token.borderRadiusXS,
                }}
              />
            </Tooltip>
          ))}
        </div>
        <div aria-hidden style={{ display: 'flex', gap: 2 }}>
          {steps.map((step, order) => (
            <Text
              key={`${order}-${step.slot.ids[0]}`}
              type="secondary"
              ellipsis
              className="tnum"
              style={{
                flex: `${step.percent} 0 0`,
                minWidth: 2,
                fontSize: 12,
                textAlign: 'center',
              }}
            >
              {step.percent < MIN_LABELED_PERCENT
                ? ''
                : step.percent < MIN_NAMED_PERCENT
                  ? order + 1
                  : `${order + 1} ${nameOf(step)}`}
            </Text>
          ))}
        </div>
      </Flex>

      <Table<CookingStep>
        size="small"
        columns={columns}
        dataSource={steps}
        rowKey={(step) => `${step.extra ? 'e' : 'm'}${step.slot.ids[0]}`}
        pagination={false}
      />

      <Text type="secondary" style={{ fontSize: 12 }}>
        재료는 위 순서대로 넣고, 게이지가 재료마다 적힌 자리에 닿으면 다음 재료로 넘어갑니다. 요리는
        재료를 한 개씩 씁니다.
      </Text>
    </Flex>
  );
}
