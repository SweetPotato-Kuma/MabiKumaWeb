import { useState } from 'react';
import { Descriptions, Flex, Typography, theme, type DescriptionsProps } from 'antd';
import {
  COOKING_SKILL,
  rankText,
  skillIconUrl,
  type Recipe,
  type RecipeBook,
} from '@/features/crafting/recipes';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 게임의 스킬 그림 크기. 그대로 그려야 번지지 않는다. */
const SKILL_ICON = 42;

/**
 * 제작법의 스킬과 조건.
 *
 * 스킬 그림과 이름, 스킬 창의 분류를 위에 두고, 도구(요리는 조리 방법), 필요한
 * 랭크와 설비, 한 번에 나오는 개수, 요리 경험치를 한 칸씩 적는다. 값이 없는 칸은 뺀다.
 */
export function RecipeInfo({ book, recipe }: { book: RecipeBook; recipe: Recipe }) {
  const skill = book.skillOf(recipe.skill);
  const skillName = book.skillName(recipe.skill);
  const cooking = recipe.skill === COOKING_SKILL;

  const items: DescriptionsProps['items'] = [
    ...(recipe.tool
      ? [{ key: 'tool', label: cooking ? '조리 방법' : '도구', children: recipe.tool }]
      : []),
    { key: 'rank', label: '필요 랭크', children: rankText(recipe.rank) },
    ...(recipe.station ? [{ key: 'station', label: '필요 설비', children: recipe.station }] : []),
    {
      key: 'yield',
      label: '생산 개수',
      children: <span className="tnum">{formatNumber(recipe.yield)}개</span>,
    },
    ...(recipe.exp
      ? [
          {
            key: 'exp',
            label: '요리 경험치',
            children: <span className="tnum">{formatNumber(recipe.exp)}</span>,
          },
        ]
      : []),
  ];

  return (
    <Flex vertical gap={12} style={{ minWidth: 0 }}>
      <Flex gap={12} align="center">
        <SkillIcon skillId={recipe.skill} />
        <Flex vertical gap={2} style={{ minWidth: 0 }}>
          <Text strong>{skillName}</Text>
          {skill?.category ? (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {skill.category} 스킬
            </Text>
          ) : null}
        </Flex>
      </Flex>
      <Descriptions size="small" column={1} items={items} />
    </Flex>
  );
}

/**
 * 스킬 그림. 받지 못한 그림은 깨진 표시 대신 같은 크기의 빈칸으로 둔다.
 * 원래 크기(42px)가 가장 또렷하다. 목록처럼 좁은 곳에서만 줄여 쓴다.
 */
export function SkillIcon({ skillId, size = SKILL_ICON }: { skillId: number; size?: number }) {
  const { token } = theme.useToken();
  const [failed, setFailed] = useState(false);
  return (
    <div
      style={{
        width: size,
        height: size,
        flex: `0 0 ${size}px`,
        borderRadius: token.borderRadiusSM,
        overflow: 'hidden',
        background: token.colorFillTertiary,
      }}
    >
      {failed ? null : (
        <img
          src={skillIconUrl(skillId)}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          style={{ display: 'block' }}
        />
      )}
    </div>
  );
}
