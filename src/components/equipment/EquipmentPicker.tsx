import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AutoComplete, Flex, Form, Input, Tag, Typography } from 'antd';
import { searchNames, useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { EQUIPMENT_CATEGORIES, equipmentPath } from '@/features/equipment/api';

const { Text } = Typography;

/** 넉넉히 찾아 두고 장비 카테고리만 남긴다. 옷과 모자가 이름 대부분이라 걸러지는 것이 많다. */
const SEARCH_LIMIT = 80;
const SHOW_LIMIT = 20;

/**
 * 장비 이름으로 시뮬레이터를 연다. 경매장 자동완성과 같은 이름 사전을 쓴다.
 * 같은 이름이 여러 카테고리에 있으면 장비 카테고리 중 첫 번째로 연다.
 */
export function EquipmentPicker({ initialName = '' }: { initialName?: string }) {
  const navigate = useNavigate();
  const [keyword, setKeyword] = useState(initialName);
  const deferredKeyword = useDeferredValue(keyword);
  const nameIndexQuery = useItemNameIndexQuery();

  const suggestions = useMemo(() => {
    if (!nameIndexQuery.data) return [];
    return searchNames(nameIndexQuery.data, deferredKeyword, { limit: SEARCH_LIMIT })
      .map((item) => ({
        name: item.name,
        category: item.categories.find((c) => EQUIPMENT_CATEGORIES.has(c)),
      }))
      .filter((item): item is { name: string; category: string } => Boolean(item.category))
      .slice(0, SHOW_LIMIT);
  }, [nameIndexQuery.data, deferredKeyword]);

  const options = suggestions.map((item) => ({
    value: `${item.category}\u0000${item.name}`,
    label: (
      <Flex justify="space-between" gap={8}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
        <Text type="secondary" style={{ fontSize: 12, flex: '0 0 auto' }}>
          {item.category}
        </Text>
      </Flex>
    ),
  }));

  const open = (value: string) => {
    const [category, name] = value.split('\u0000');
    if (!category || !name) return;
    setKeyword(name);
    navigate(equipmentPath(category, name));
  };

  return (
    <Form layout="vertical">
      <Form.Item
        label="장비 이름"
        htmlFor="equipment-name"
        style={{ marginBottom: 0 }}
        extra={
          nameIndexQuery.data === null
            ? '이름 사전을 불러오지 못해 자동완성이 꺼져 있습니다.'
            : undefined
        }
      >
        <AutoComplete
          value={keyword}
          options={options}
          onChange={(value: string) => setKeyword(value.includes('\u0000') ? keyword : value)}
          onSelect={open}
          style={{ width: '100%', maxWidth: 520 }}
          notFoundContent={
            deferredKeyword.trim() && nameIndexQuery.data ? (
              <Text type="secondary">장비 카테고리에서 맞는 이름이 없습니다.</Text>
            ) : null
          }
        >
          <Input id="equipment-name" placeholder="예: 나이트브링어 워로드" allowClear />
        </AutoComplete>
      </Form.Item>
      <Flex gap={4} wrap style={{ marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
          이름을 고르면 바로 열립니다. 무기, 방어구, 장신구, 생활 도구 카테고리에서 찾습니다.
        </Text>
        {nameIndexQuery.isLoading ? (
          <Tag style={{ marginInlineEnd: 0 }}>이름 사전 불러오는 중</Tag>
        ) : null}
      </Flex>
    </Form>
  );
}
