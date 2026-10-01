import { Descriptions, Flex, Skeleton, Tag, Typography } from 'antd';
import { enchantRank, isEnchantNote, stripBrackets } from '@/features/equipment/enchant';
import { sortVariants, useEnchantScroll, type ScrollVariant } from '@/features/enchantScroll/scrolls';

const { Text } = Typography;

function Variant({ variant }: { variant: ScrollVariant }) {
  const effects = variant.desc.filter((line) => !isEnchantNote(line));
  const notes = variant.desc.filter(isEnchantNote);

  return (
    <Descriptions
      bordered
      size="small"
      column={1}
      title={`${variant.slot === 0 ? '접두' : '접미'} ${enchantRank(variant.level)} 랭크`}
      styles={{ label: { width: 96, whiteSpace: 'nowrap' } }}
      items={[
        {
          key: 'effects',
          label: '효과',
          children: (
            <Flex vertical gap={2} className="tnum">
              {effects.map((line) => (
                <Text key={line}>{line}</Text>
              ))}
            </Flex>
          ),
        },
        ...(notes.length > 0
          ? [
              {
                key: 'notes',
                label: '조건',
                children: (
                  <Flex vertical gap={2}>
                    {notes.map((line) => (
                      <Text key={line}>{stripBrackets(line)}</Text>
                    ))}
                  </Flex>
                ),
              },
            ]
          : []),
        ...(variant.alt
          ? [{ key: 'alt', label: '다른 이름', children: <Text>{variant.alt}</Text> }]
          : []),
        ...(variant.src?.length
          ? [
              {
                key: 'src',
                label: '나오는 곳',
                children: (
                  <Flex wrap gap={4}>
                    {variant.src.map((place) => (
                      <Tag key={place} style={{ marginInlineEnd: 0 }}>
                        {place}
                      </Tag>
                    ))}
                  </Flex>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}

/**
 * 인챈트 스크롤의 사양. 접두/접미와 랭크, 효과, 적용 조건, 나오는 곳.
 * 같은 이름에 접두와 접미가 따로 있으면 둘 다 보인다. 사양이 없는 이름이면 아무것도 그리지 않는다.
 * 전용, 개방된 전용 스크롤도 인챈트 이름이 같으면 같은 사양이다.
 */
export function EnchantScrollSpec({
  name,
  kind,
}: {
  name: string;
  /** 매물의 옵션이 알려 주는 접두/접미와 랭크. 있으면 맞는 사양만 보인다. */
  kind?: { slot: 0 | 1; level: number };
}) {
  const variants = useEnchantScroll(name, kind);

  if (variants === undefined) return <Skeleton active title={false} paragraph={{ rows: 4 }} />;
  if (!variants) return null;

  return (
    <Flex vertical gap={16}>
      {sortVariants(variants).map((variant, index) => (
        <Variant key={`${variant.slot}:${variant.level}:${index}`} variant={variant} />
      ))}
    </Flex>
  );
}
