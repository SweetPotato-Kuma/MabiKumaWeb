import { useState } from 'react';
import {
  App,
  Button,
  Card,
  Checkbox,
  Flex,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Typography,
} from 'antd';
import { EmptyState } from '@/components/EmptyState';
import { AddIcon, DeleteIcon } from '@/components/icons';
import type { BagTreeNode } from '@/features/bags/groups';
import type { BagSearchConditions } from '@/features/bags/searchParams';
import {
  addBagWatch,
  describeWatch,
  isEmptyCondition,
  removeBagWatch,
  updateBagWatch,
  WATCH_MAX,
  WATCH_NAME_MAX,
  type BagWatch,
} from '@/features/bags/watches';
import { formatNumber } from '@/lib/format';

const { Text } = Typography;

/** 관심 조건마다 지금 맞는 주머니 수. 아직 받지 않은 쪽은 null 이다. */
export interface WatchCounts {
  npc: number | null;
  auction: number | null;
}

function countText(counts: WatchCounts | undefined): string | null {
  if (!counts) return null;
  const parts = [
    counts.npc === null ? null : `NPC ${formatNumber(counts.npc)}개`,
    counts.auction === null ? null : `경매장 ${formatNumber(counts.auction)}개`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

interface EditTarget {
  /** 고치는 관심 조건. 새로 저장할 때는 null. */
  watch: BagWatch | null;
}

/**
 * 관심 조건 목록. 지금 검색 조건을 이름을 붙여 저장하고, 저장한 조건을 다시 검색 조건으로 불러오거나 고치거나
 * 지운다. 조건마다 받아 둔 NPC 상점과 경매장에서 지금 맞는 주머니 수를 보여 준다. 맞는 주머니는 결과에서
 * "관심" 표시가 붙고 맨 위로 올라온다(BagsPage).
 */
export function BagWatchList({
  watches,
  tree,
  current,
  counts,
  onApply,
}: {
  watches: readonly BagWatch[];
  tree: readonly BagTreeNode[];
  /** 지금 검색 조건. 저장하거나 고칠 때 쓴다. */
  current: BagSearchConditions;
  counts: ReadonlyMap<string, WatchCounts>;
  onApply: (watch: BagWatch) => void;
}) {
  const { message } = App.useApp();
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [name, setName] = useState('');
  const [replaceConditions, setReplaceConditions] = useState(false);
  const currentEmpty = isEmptyCondition(current);

  const openNew = () => {
    setEditing({ watch: null });
    setName('');
    setReplaceConditions(true);
  };
  const openEdit = (watch: BagWatch) => {
    setEditing({ watch });
    setName(watch.name);
    setReplaceConditions(false);
  };

  const submit = () => {
    if (!editing) return;
    if (!editing.watch) {
      const result = addBagWatch(name, current);
      if (result.ok) {
        message.success('관심 조건을 저장했습니다.');
        setEditing(null);
      } else if (result.reason === 'duplicate') {
        message.info(`같은 조건이 이미 "${result.existing.name}" 이름으로 저장돼 있습니다.`);
      } else if (result.reason === 'full') {
        message.warning(`관심 조건은 ${WATCH_MAX}개까지 저장합니다.`);
      } else if (result.reason === 'empty') {
        message.warning('주머니나 색 조건을 하나 이상 고르세요.');
      }
      return;
    }
    const ok = updateBagWatch(editing.watch.id, {
      name,
      conditions: replaceConditions ? current : undefined,
    });
    if (ok) {
      message.success('관심 조건을 고쳤습니다.');
      setEditing(null);
    } else {
      message.warning('고치지 못했습니다. 같은 조건이 이미 있거나 조건이 비었습니다.');
    }
  };

  const nameMissing = name.trim() === '';

  return (
    <Card
      variant="outlined"
      size="small"
      title="관심 조건"
      extra={
        <Button
          type="link"
          size="small"
          icon={<AddIcon />}
          disabled={currentEmpty || watches.length >= WATCH_MAX}
          onClick={openNew}
        >
          지금 조건 저장
        </Button>
      }
    >
      {watches.length === 0 ? (
        <EmptyState
          size="small"
          variant="search"
          description="지금 조건을 저장하면 맞는 주머니에 관심 표시가 붙습니다."
        />
      ) : (
        <List
          size="small"
          dataSource={[...watches]}
          rowKey="id"
          split
          renderItem={(watch) => {
            const summary = describeWatch(watch.conditions, tree);
            const matches = countText(counts.get(watch.id));
            return (
              <List.Item style={{ paddingInline: 0, display: 'block' }}>
                <Flex vertical gap={4}>
                  <Flex justify="space-between" align="center" gap={8}>
                    <Text strong ellipsis={{ tooltip: watch.name }} style={{ minWidth: 0 }}>
                      {watch.name}
                    </Text>
                    {matches ? (
                      <Text className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {matches}
                      </Text>
                    ) : null}
                  </Flex>
                  <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
                    {summary}
                  </Text>
                  <Flex gap={4} wrap>
                    <Button size="small" onClick={() => onApply(watch)}>
                      보기
                    </Button>
                    <Button size="small" onClick={() => openEdit(watch)}>
                      고치기
                    </Button>
                    <Popconfirm
                      title="이 관심 조건을 지울까요?"
                      okText="지우기"
                      cancelText="두기"
                      onConfirm={() => removeBagWatch(watch.id)}
                    >
                      <Button
                        size="small"
                        type="text"
                        icon={<DeleteIcon />}
                        aria-label={`${watch.name} 지우기`}
                      />
                    </Popconfirm>
                  </Flex>
                </Flex>
              </List.Item>
            );
          }}
        />
      )}

      <Modal
        open={editing !== null}
        title={editing?.watch ? '관심 조건 고치기' : '관심 조건 저장'}
        okText={editing?.watch ? '고치기' : '저장'}
        cancelText="닫기"
        okButtonProps={{ disabled: nameMissing }}
        onOk={submit}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form layout="vertical" onFinish={submit}>
          <Form.Item label="이름" required>
            <Input
              autoFocus
              value={name}
              maxLength={WATCH_NAME_MAX}
              placeholder="예: 붉은 가죽 주머니"
              onChange={(event) => setName(event.target.value)}
            />
          </Form.Item>
          <Form.Item label="조건" style={{ marginBottom: editing?.watch ? 8 : 0 }}>
            <Text type="secondary" className="tnum" style={{ fontSize: 13 }}>
              {describeWatch(
                editing?.watch && !replaceConditions ? editing.watch.conditions : current,
                tree,
              )}
            </Text>
          </Form.Item>
          {editing?.watch ? (
            <Flex vertical align="flex-start">
              <Checkbox
                checked={replaceConditions}
                disabled={currentEmpty}
                onChange={(event) => setReplaceConditions(event.target.checked)}
              >
                지금 검색 조건으로 바꾸기
              </Checkbox>
            </Flex>
          ) : null}
        </Form>
      </Modal>
    </Card>
  );
}
