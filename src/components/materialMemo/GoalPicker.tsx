import { useId, useMemo, useState } from 'react';
import { App, AutoComplete, Button, Flex, InputNumber, Typography } from 'antd';
import { AddIcon } from '@/components/icons';
import { useItemNameIndexQuery } from '@/features/auction/nameIndex';
import type { RecipeBook } from '@/features/crafting/recipes';
import { resolveItemName, searchItemNames } from '@/features/materialMemo/search';
import { MAX_GOALS, MAX_QUANTITY, addGoal } from '@/features/materialMemo/store';

const { Text } = Typography;

/** 목표 아이템을 이름으로 찾아 개수와 함께 더한다. 제작하는 아이템이 아니어도 된다. */
export function GoalPicker({
  book,
  onAdded,
}: {
  book: RecipeBook;
  /** 더한(또는 개수를 늘린) 목표의 번호. */
  onAdded: (id: string) => void;
}) {
  const { message } = App.useApp();
  const nameId = useId();
  const countId = useId();
  const index = useItemNameIndexQuery().data;
  const [text, setText] = useState('');
  const [count, setCount] = useState<number | null>(1);

  const options = useMemo(
    () => searchItemNames(index, book.itemNames, text).map((name) => ({ value: name })),
    [index, book, text],
  );
  const picked = resolveItemName(index, book.itemNames, text);

  const add = () => {
    if (!picked) return;
    const id = addGoal(picked, count ?? 1);
    if (id === null) {
      void message.warning(`목표는 ${MAX_GOALS}개까지 둘 수 있습니다`);
      return;
    }
    onAdded(id);
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
          notFoundContent={text.trim() ? '찾는 아이템이 없습니다' : null}
        />
      </Flex>
      <Flex vertical gap={4}>
        <label htmlFor={countId}>
          <Text type="secondary">목표 개수</Text>
        </label>
        <InputNumber
          id={countId}
          min={1}
          max={MAX_QUANTITY}
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
