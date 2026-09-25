import { Flex, Typography } from 'antd';
import type { NameSuggestion } from '@/features/auction/nameIndex';

const { Text } = Typography;

/**
 * 자동완성 한 줄. 경매장과 아이템 정보가 같이 쓴다. 전체에서 찾을 때만 카테고리를 옆에 붙인다.
 * 같은 이름이 여러 카테고리에 있으면 어디서 보이는지 모두 알려야 고를 수 있다.
 */
export function NameSuggestionLabel({ item, showCategory }: { item: NameSuggestion; showCategory: boolean }) {
  return (
    <Flex justify="space-between" gap={12}>
      <span>{item.name}</span>
      {showCategory ? (
        <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {item.categories.join(', ')}
        </Text>
      ) : null}
    </Flex>
  );
}
