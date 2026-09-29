import {
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { Input, Modal, Skeleton, Typography, theme } from 'antd';
import { navPages, type NavEntry } from '@/app/navigation';
import { AuctionIcon, BookIcon, SearchIcon } from '@/components/icons';
import { itemInfoPath, normalizeForSearch } from '@/features/auction/dictionary';
import {
  isInitialsOnly,
  searchNames,
  toInitials,
  useItemNameIndexQuery,
} from '@/features/auction/nameIndex';

const { Text } = Typography;

/** 페이지는 몇 개 안 되니 넉넉히, 아이템은 목록이 길어지지 않게 자른다. 더 찾는 일은 경매장과 아이템 정보가 맡는다. */
const PAGE_LIMIT = 8;
const ITEM_LIMIT = 8;

type RowKind = '페이지' | '아이템' | '경매장';

interface PaletteRow {
  id: string;
  kind: RowKind;
  label: string;
  secondary: string;
  icon: ReactNode;
  to: string;
}

/**
 * 입력기가 글자를 조립하는 중이면 끝에 낱자가 붙어 온다("성ㅅ"). 떼고 찾아야 한 글자 칠 때마다
 * 목록이 비었다 차지 않는다. 자음만 친 입력은 초성 검색이라 그대로 둔다.
 */
function searchNeedle(query: string): string {
  const needle = normalizeForSearch(query);
  return isInitialsOnly(needle) ? needle : needle.replace(/[ㄱ-ㅎㅏ-ㅣ]$/, '');
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  entries: NavEntry[];
}

/**
 * 전체 검색. 페이지와 아이템 상세를 한 입력칸에서 찾는다.
 *
 * 결과는 페이지, 아이템, 경매장 순이다. 입력이 비어 있으면 페이지 전체만 보인다.
 * 아이템은 경매장과 같은 이름 색인으로 찾으므로 띄어쓰기를 무시하고 초성도 받는다.
 * 목록 창은 열릴 때 그려지므로 이름 색인도 그때 받기 시작한다.
 */
export function CommandPalette({ open, onClose, entries }: CommandPaletteProps) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      destroyOnHidden
      width={560}
      style={{ top: 72 }}
    >
      <PaletteBody entries={entries} onClose={onClose} />
    </Modal>
  );
}

function PaletteBody({ entries, onClose }: { entries: NavEntry[]; onClose: () => void }) {
  const { token } = theme.useToken();
  const navigate = useNavigate();
  const listId = useId();
  const nameIndexQuery = useItemNameIndexQuery();
  const index = nameIndexQuery.data;

  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const deferredQuery = useDeferredValue(query);
  const needle = searchNeedle(deferredQuery);
  const trimmed = deferredQuery.trim();

  const rows = useMemo((): PaletteRow[] => {
    const initialsOnly = isInitialsOnly(needle);
    const pages = navPages(entries)
      .filter(({ leaf, trail }) => {
        if (!needle) return true;
        const haystack = normalizeForSearch(`${leaf.label} ${trail} ${leaf.keywords ?? ''}`);
        return (initialsOnly ? toInitials(haystack) : haystack).includes(needle);
      })
      .slice(0, PAGE_LIMIT)
      .map(
        ({ leaf, trail }): PaletteRow => ({
          id: `page:${leaf.path}`,
          kind: '페이지',
          label: leaf.label,
          secondary: trail,
          icon: leaf.icon,
          to: leaf.path,
        }),
      );

    if (!needle) return pages;

    // 같은 이름이 여러 카테고리에 있으면 카테고리마다 한 줄씩 둔다. 장비 정보가 카테고리마다 따로다.
    const items = index
      ? searchNames(index, deferredQuery, { limit: ITEM_LIMIT })
          .flatMap((item) => item.categories.map((category) => ({ name: item.name, category })))
          .slice(0, ITEM_LIMIT)
          .map(
            ({ name, category }): PaletteRow => ({
              id: `item:${category}:${name}`,
              kind: '아이템',
              label: name,
              secondary: category,
              icon: <BookIcon />,
              to: itemInfoPath(category, name),
            }),
          )
      : [];

    const auction: PaletteRow = {
      id: 'auction',
      kind: '경매장',
      label: `경매장에서 "${trimmed}" 검색`,
      secondary: '',
      icon: <AuctionIcon />,
      to: `/auction?keyword=${encodeURIComponent(trimmed)}`,
    };

    return [...pages, ...items, auction];
  }, [entries, index, needle, deferredQuery, trimmed]);

  // 결과가 바뀌면 맨 위로 돌아간다. 이전 목록의 자리를 들고 있으면 엉뚱한 줄이 골라진다.
  useEffect(() => setActive(0), [rows]);

  useEffect(() => {
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, listId]);

  const choose = (row: PaletteRow) => {
    onClose();
    if (row.kind === '아이템') window.scrollTo({ top: 0 });
    navigate(row.to);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 한글은 조립 중인 글자를 확정하는 Enter 가 한 번 더 온다. 그때는 고르지 않는다.
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + rows.length) % rows.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[active];
      if (row) choose(row);
    }
  };

  const waitingForItems = Boolean(needle) && nameIndexQuery.isPending;

  return (
    <div>
      <Input
        autoFocus
        size="large"
        prefix={<SearchIcon />}
        placeholder="페이지, 아이템 이름 검색"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-label="전체 검색"
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={rows[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
      />

      <ul
        id={listId}
        role="listbox"
        aria-label="검색 결과"
        style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, maxHeight: 380, overflowY: 'auto' }}
      >
        {rows.map((row, position) => {
          const showHeading = position === 0 || rows[position - 1].kind !== row.kind;
          const selected = position === active;
          return (
            <li key={row.id} role="presentation">
              {showHeading ? (
                <div style={{ padding: '8px 12px 4px' }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {row.kind}
                  </Text>
                </div>
              ) : null}
              <div
                id={`${listId}-${position}`}
                role="option"
                aria-selected={selected}
                onMouseMove={() => selected || setActive(position)}
                onClick={() => choose(row)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 12px',
                  borderRadius: token.borderRadius,
                  cursor: 'pointer',
                  background: selected ? token.colorPrimaryBg : 'transparent',
                }}
              >
                <span style={{ display: 'inline-flex', color: token.colorTextSecondary, fontSize: 18 }}>
                  {row.icon}
                </span>
                <span
                  style={{
                    flex: 1,
                    minWidth: 0,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {row.label}
                </span>
                {row.secondary ? (
                  <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    {row.secondary}
                  </Text>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      {waitingForItems ? <Skeleton active title={false} paragraph={{ rows: 1 }} style={{ padding: '8px 12px' }} /> : null}
    </div>
  );
}
