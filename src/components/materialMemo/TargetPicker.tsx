import { useId, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Flex, InputNumber, Typography } from 'antd';
import { AddIcon } from '@/components/icons';
import type { RecipeBook } from '@/features/crafting/recipes';
import { craftableEntries, findCraftable, searchCraftable } from '@/features/materialMemo/search';
import { MAX_COUNT, MAX_TARGETS, addTarget } from '@/features/materialMemo/store';

const { Text } = Typography;

/** 목표 아이템을 이름으로 찾아 개수와 함께 더한다. */
export function TargetPicker({ book }: { book: RecipeBook }) {
  const { message } = App.useApp();
  const nameId = useId();
  const countId = useId();
  const entries = useMemo(() => craftableEntries(book), [book]);
  const [text, setText] = useState('');
  const [count, setCount] = useState<number | null>(1);

  const options = useMemo(
    () => searchCraftable(entries, text).map((entry) => ({ value: entry.name })),
    [entries, text],
  );
  const picked = findCraftable(entries, text);

  const add = () => {
    if (!picked) return;
    if (!addTarget(picked.itemId, count ?? 1)) {
      void message.warning(`목표는 ${MAX_TARGETS}개까지 둘 수 있습니다`);
      return;
    }
    setText('');
    setCount(1);
  };

  return (
    <Flex gap={12} align="flex-end" wrap>
      <Flex vertical gap={4} style={{ flex: '1 1 260px', minWidth: 0 }}>
        <label htmlFor={nameId}>
          <Text type="secondary">목표 아이템</Text>
        </label>
        <AutoComplete
          id={nameId}
          value={text}
          options={options}
          onChange={setText}
          onSelect={setText}
          placeholder="예: 롱 소드"
          allowClear
          notFoundContent={text.trim() ? '제작법이 있는 아이템이 없습니다' : null}
        />
      </Flex>
      <Flex vertical gap={4}>
        <label htmlFor={countId}>
          <Text type="secondary">만들 개수</Text>
        </label>
        <InputNumber
          id={countId}
          min={1}
          max={MAX_COUNT}
          precision={0}
          value={count}
          onChange={setCount}
          style={{ width: 110 }}
        />
      </Flex>
      <Button type="primary" icon={<AddIcon />} disabled={!picked} onClick={add}>
        추가
      </Button>
    </Flex>
  );
}
