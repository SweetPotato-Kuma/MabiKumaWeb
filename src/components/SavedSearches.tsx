import { useState } from 'react';
import { App, Button, Dropdown, Flex, Form, Grid, Input, Modal, Popconfirm, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { EmptyState } from '@/components/EmptyState';
import { ArrowDownIcon, ListIcon, StarIcon } from '@/components/icons';
import {
  DESCRIPTION_MAX,
  NAME_MAX,
  describeSavedSearch,
  findSavedSearch,
  hasSearchCondition,
  useSavedSearchActions,
  useSavedSearches,
  type SavedSearch,
  type SavedSearchQuery,
} from '@/features/auction/savedSearches';

const { Text } = Typography;

interface NameForm {
  name: string;
  description: string;
}

/** 조건 요약 칩. 저장하려는 것, 저장된 것이 무엇인지 같은 모양으로 보인다. */
function ConditionTags({ query }: { query: SavedSearchQuery }) {
  const parts = describeSavedSearch(query);
  if (parts.length === 0) return null;
  return (
    <Flex gap={4} wrap>
      {parts.map((part, index) => (
        <Tag key={`${part}-${index}`} style={{ marginInlineEnd: 0 }}>
          {part}
        </Tag>
      ))}
    </Flex>
  );
}

/** 이름과 설명을 적는 창. 새로 저장할 때와 고칠 때가 같이 쓴다. */
function NameModal({
  open,
  title,
  okText,
  initial,
  query,
  onOk,
  onCancel,
}: {
  open: boolean;
  title: string;
  okText: string;
  initial: NameForm;
  /** 저장할 조건. 창에서 무엇이 저장되는지 보여 준다. */
  query: SavedSearchQuery;
  onOk: (values: NameForm) => void;
  onCancel: () => void;
}) {
  const [form] = Form.useForm<NameForm>();
  return (
    <Modal
      open={open}
      title={title}
      okText={okText}
      cancelText="취소"
      onCancel={onCancel}
      onOk={() => form.submit()}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" initialValues={initial} onFinish={onOk} requiredMark={false}>
        <Flex vertical gap={6} style={{ marginBottom: 16 }}>
          <Text type="secondary" style={{ fontSize: 13 }}>
            저장되는 조건
          </Text>
          <ConditionTags query={query} />
        </Flex>
        <Form.Item
          name="name"
          label="이름"
          rules={[
            { required: true, whitespace: true, message: '이름을 적어 주세요.' },
            { max: NAME_MAX, message: `이름은 ${NAME_MAX}자까지 쓸 수 있습니다.` },
          ]}
        >
          <Input placeholder="예: 싼 블래스트" maxLength={NAME_MAX} showCount autoFocus />
        </Form.Item>
        <Form.Item name="description" label="설명 (선택)" rules={[{ max: DESCRIPTION_MAX }]}>
          <Input.TextArea rows={2} placeholder="예: 7레벨 이상만" maxLength={DESCRIPTION_MAX} showCount />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/**
 * 경매장 검색 즐겨찾기 단추 하나. 검색 줄에 두고, 누르면 등록과 목록이 펼쳐진다.
 * - 등록: 지금 검색 조건에 이름과 설명을 붙여 저장한다. 조건이 하나도 없으면 알리고 저장하지 않는다.
 * - 목록: 저장한 것을 고르면 바로 그 조건으로 검색한다. 이름과 설명을 고치거나 지울 수 있다.
 */
export function SavedSearchControls({
  current,
  onApply,
}: {
  /** 지금 입력칸에 있는 조건. */
  current: SavedSearchQuery;
  /** 저장한 조건으로 검색한다. */
  onApply: (query: SavedSearchQuery) => void;
}) {
  const { message } = App.useApp();
  const saved = useSavedSearches();
  const { add, update, remove } = useSavedSearchActions();
  const [saving, setSaving] = useState(false);
  const [listing, setListing] = useState(false);
  const [editing, setEditing] = useState<SavedSearch | null>(null);
  const wide = Grid.useBreakpoint().md ?? false;

  const openSave = () => {
    if (!hasSearchCondition(current)) {
      message.warning('저장할 검색 조건이 없습니다. 검색어, 카테고리, 상세 검색 가운데 하나를 넣어 주세요.');
      return;
    }
    const existing = findSavedSearch(current);
    if (existing) {
      message.warning(`같은 조건이 "${existing.name}" 이름으로 이미 저장돼 있습니다.`);
      return;
    }
    setSaving(true);
  };

  const save = (values: NameForm) => {
    const result = add({ ...current, name: values.name, description: values.description });
    if (result.ok) {
      setSaving(false);
      message.success('검색 즐겨찾기에 저장했습니다.');
      return;
    }
    if (result.reason === 'duplicate') message.warning(`같은 조건이 "${result.existing.name}" 이름으로 이미 저장돼 있습니다.`);
    else if (result.reason === 'full') message.warning('즐겨찾기가 가득 찼습니다. 안 쓰는 것을 지우고 다시 저장해 주세요.');
    else if (result.reason === 'empty') message.warning('저장할 검색 조건이 없습니다.');
    else message.warning('이름을 적어 주세요.');
  };

  const edit = (values: NameForm) => {
    if (editing && update(editing.id, values)) setEditing(null);
  };

  const actions = (item: SavedSearch) => (
    <Flex gap={6} style={{ whiteSpace: 'nowrap' }}>
      <Button
        type="primary"
        size="small"
        aria-label={`${item.name} 검색`}
        onClick={() => {
          setListing(false);
          onApply(item);
        }}
      >
        검색
      </Button>
      <Button size="small" aria-label={`${item.name} 수정`} onClick={() => setEditing(item)}>
        수정
      </Button>
      <Popconfirm
        title="이 즐겨찾기를 지울까요?"
        okText="지우기"
        cancelText="취소"
        onConfirm={() => remove(item.id)}
      >
        <Button size="small" danger aria-label={`${item.name} 삭제`}>
          삭제
        </Button>
      </Popconfirm>
    </Flex>
  );

  // 좁은 화면에서는 조건과 설명을 이름 아래로 내려 칸 수를 줄인다.
  const columns: ColumnsType<SavedSearch> = [
    {
      title: '이름',
      key: 'name',
      render: (_, item) => (
        <Flex vertical gap={4} style={{ minWidth: 0 }}>
          <Text strong>{item.name}</Text>
          {item.description ? (
            <Text type="secondary" style={{ fontSize: 13 }}>
              {item.description}
            </Text>
          ) : null}
          {wide ? null : <ConditionTags query={item} />}
        </Flex>
      ),
    },
    ...(wide
      ? [{ title: '조건', key: 'query', render: (_: unknown, item: SavedSearch) => <ConditionTags query={item} /> }]
      : []),
    { title: '', key: 'actions', width: 160, render: (_, item) => actions(item) },
  ];

  return (
    <>
      <Dropdown
        trigger={['click']}
        menu={{
          items: [
            { key: 'save', icon: <StarIcon />, label: '지금 검색 등록' },
            { key: 'list', icon: <ListIcon />, label: `목록 보기${saved.length > 0 ? ` ${saved.length}` : ''}` },
          ],
          onClick: ({ key }) => (key === 'save' ? openSave() : setListing(true)),
        }}
      >
        <Button icon={<StarIcon />}>
          즐겨찾기
          <ArrowDownIcon />
        </Button>
      </Dropdown>

      <NameModal
        open={saving}
        title="검색 즐겨찾기 등록"
        okText="저장"
        initial={{ name: current.keyword.trim() || current.category, description: '' }}
        query={current}
        onOk={save}
        onCancel={() => setSaving(false)}
      />

      <NameModal
        open={editing !== null}
        title="검색 즐겨찾기 수정"
        okText="수정"
        initial={{ name: editing?.name ?? '', description: editing?.description ?? '' }}
        query={editing ?? { keyword: '', category: '', filterKey: '' }}
        onOk={edit}
        onCancel={() => setEditing(null)}
      />

      <Modal
        open={listing}
        title="검색 즐겨찾기"
        footer={null}
        onCancel={() => setListing(false)}
        width={760}
        destroyOnHidden
      >
        <Table<SavedSearch>
          size="small"
          rowKey="id"
          columns={columns}
          dataSource={[...saved]}
          pagination={saved.length > 10 ? { pageSize: 10, showSizeChanger: false, hideOnSinglePage: true } : false}
          locale={{ emptyText: <EmptyState size="small" description="저장한 검색이 없습니다. 검색한 뒤 즐겨찾기에서 등록해 보세요." /> }}
        />
      </Modal>
    </>
  );
}
