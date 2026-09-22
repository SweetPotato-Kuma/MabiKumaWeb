import { Button, Flex, Popover, Typography } from 'antd';
import type { ItemOption } from '@/features/auction/types';

const { Text } = Typography;

/** 표 한 칸에 들어가므로 기본은 3줄까지만 펼친다. 나머지는 눌러서 본다. */
const INLINE_LIMIT = 3;

function optionLabel(option: ItemOption): string {
  if (!option.option_sub_type) return option.option_type;
  return `${option.option_type} ${option.option_sub_type}`;
}

function optionValue(option: ItemOption): string {
  const range = [option.option_value, option.option_value2].filter(Boolean).join(' ~ ');
  return range || '-';
}

function OptionRow({ option }: { option: ItemOption }) {
  return (
    <Flex vertical gap={0}>
      <Flex gap={6} wrap>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {optionLabel(option)}
        </Text>
        <Text className="tnum" style={{ fontSize: 12 }}>
          {optionValue(option)}
        </Text>
      </Flex>
      {option.option_desc ? (
        <Text type="secondary" style={{ fontSize: 11 }}>
          {option.option_desc}
        </Text>
      ) : null}
    </Flex>
  );
}

interface Props {
  options: ItemOption[] | undefined;
  /**
   * 넘치는 옵션을 눌러서 펼칠지.
   *
   * 줄 전체가 눌리는 표(경매장)에서는 꺼 둔다. 눌리는 줄 안에 또 눌리는 버튼을 두면
   * 어느 쪽이 반응할지 알 수 없고, 키보드로 훑을 때도 걸리는 곳이 늘어난다.
   */
  expandable?: boolean;
}

/** 아이템 세부 옵션. 값이 없으면 칸을 비운 티를 낸다. */
export function ItemOptionList({ options, expandable = true }: Props) {
  if (!options || options.length === 0) {
    return (
      <Text type="secondary" aria-label="옵션 없음">
        -
      </Text>
    );
  }

  const visible = options.slice(0, INLINE_LIMIT);
  const hidden = options.length - visible.length;

  return (
    <Flex vertical gap={4} style={{ minWidth: 150 }}>
      {visible.map((option, index) => (
        <OptionRow key={`${option.option_type}-${option.option_sub_type ?? ''}-${index}`} option={option} />
      ))}

      {hidden > 0 && !expandable ? (
        <Text type="secondary" style={{ fontSize: 12 }}>
          외 {hidden}개
        </Text>
      ) : null}

      {hidden > 0 && expandable ? (
        <Popover
          trigger="click"
          placement="left"
          title="전체 옵션"
          content={
            <Flex vertical gap={8} style={{ maxWidth: 280, maxHeight: 320, overflowY: 'auto' }}>
              {options.map((option, index) => (
                <OptionRow key={`all-${option.option_type}-${option.option_sub_type ?? ''}-${index}`} option={option} />
              ))}
            </Flex>
          }
        >
          <Button type="link" size="small" style={{ paddingInline: 0, height: 'auto' }}>
            옵션 {hidden}개 더 보기
          </Button>
        </Popover>
      ) : null}
    </Flex>
  );
}
