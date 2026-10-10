import { lazy, Suspense, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, Flex, Input, Select, Skeleton, Typography } from 'antd';
import { useSavedSearches, type SavedSearch } from '@/features/auction/savedSearches';
import { searchParamsFor } from '@/features/auction/searchParams';
import { parseFilter } from '@/features/auction/filterUrl';
import { matchesOptionFilter } from '@/features/auction/optionFilter';
import { leavesOfGroupKey } from '@/features/auction/categoryTree';
import { resolveSearch, splitTerms, useItemNameIndexQuery } from '@/features/auction/nameIndex';
import { scanCategoriesFor, useOptionNamesQuery } from '@/features/auction/optionNames';
import {
  matchesKeyword,
  useAuctionItemsQuery,
  useAuctionScanQuery,
  useAuctionSnapshotQuery,
} from '@/features/auction/hooks';
import { useCanQuery } from '@/lib/settings';
import { useGoldFormatter } from '@/lib/useGoldFormatter';
import { useUserSettings } from '@/lib/userSettings';
import { isSymbolItem, searchesSymbolItems } from '@/features/auction/symbolItems';
import { canSearchHorns, useHornSearch } from '@/features/horn/api';
import { SERVER_NAMES, type ServerName } from '@/features/servers/constants';

const { Text } = Typography;
const memoPath = '/materials-calculator';
const favoritePath = (saved: SavedSearch) =>
  `/auction?${searchParamsFor(new URLSearchParams(), saved)}`;

function FavoriteResults({ saved }: { saved: SavedSearch }) {
  const canQuery = useCanQuery();
  const formatGold = useGoldFormatter();
  const [settings] = useUserSettings();
  const index = useItemNameIndexQuery();
  const options = useOptionNamesQuery();
  const filter = useMemo(() => parseFilter(saved.filterKey), [saved.filterKey]);
  const scan = useMemo(() => {
    const leaves = leavesOfGroupKey(saved.category);
    if (leaves) return [...leaves];
    if (!saved.category && !saved.keyword) return scanCategoriesFor(filter, options.data);
    return undefined;
  }, [saved.category, saved.keyword, filter, options.data]);
  const input = resolveSearch(index.data, saved);
  const ready = canQuery && Boolean(input) && (!saved.keyword || index.data !== undefined);
  const normal = useAuctionItemsQuery(input ?? saved, ready && !scan);
  const snapshot = useAuctionSnapshotQuery(scan, ready && Boolean(scan));
  const live = snapshot.status === 'off' || snapshot.status === 'unavailable';
  const scanned = useAuctionScanQuery(scan, ready && Boolean(scan?.length) && live);
  const query = scan ? (live ? scanned : snapshot) : normal;
  const terms = splitTerms(saved.keyword);
  const items = (query.data?.items ?? [])
    .filter(
      (item) =>
        matchesKeyword(item, terms) &&
        matchesOptionFilter(item, filter) &&
        !(
          settings.hideSymbols &&
          !searchesSymbolItems(saved.keyword) &&
          isSymbolItem(item.item_name)
        ),
    )
    .sort((a, b) => a.auction_price_per_unit - b.auction_price_per_unit);
  if (!canQuery) return <Text type="secondary">경매장 연결 설정을 확인해 주세요.</Text>;
  if (query.error)
    return (
      <Alert type="error" message="매물을 불러오지 못했습니다. 경매장에서 다시 조회해 주세요." />
    );
  if (!input || (scan && scan.length === 0))
    return <Text type="secondary">이 조건은 경매장에서 확인해 주세요.</Text>;
  if (query.isPending || !ready) return <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  return (
    <Flex vertical gap={8}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        불러온 매물 중 낮은 가격순 · 개당 가격
      </Text>
      {items.slice(0, 4).map((item, i) => (
        <div className="home-widget-row" key={`${item.item_display_name}-${i}`}>
          <Link to={favoritePath(saved)}>{item.item_display_name || item.item_name}</Link>
          <Text className="tnum">{formatGold(item.auction_price_per_unit)}</Text>
        </div>
      ))}
      {!items.length && <Text type="secondary">불러온 매물에 일치하는 항목이 없습니다.</Text>}
      {query.hasNextPage && (
        <Button
          size="small"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          매물 더 불러오기
        </Button>
      )}
      <Link to={favoritePath(saved)}>조건으로 전체 보기 →</Link>
    </Flex>
  );
}

export function FavoritesWidget() {
  const saved = useSavedSearches();
  const [selected, setSelected] = useState('');
  const active = saved.find((item) => item.id === selected) ?? saved[0];
  return (
    <Card size="small" title="즐겨찾기 경매장 매물" extra={<Link to="/auction">경매장</Link>}>
      {active ? (
        <Flex vertical gap={12}>
          <Select
            aria-label="경매장 즐겨찾기"
            value={active.id}
            onChange={setSelected}
            options={saved.map((item) => ({ value: item.id, label: item.name }))}
          />
          <FavoriteResults key={JSON.stringify(active)} saved={active} />
        </Flex>
      ) : (
        <Flex vertical gap={12} className="home-widget-empty">
          <Text type="secondary">
            자주 찾는 아이템을 모아 보세요. 경매장에서 검색 조건을 즐겨찾기에 저장하면 매물이
            표시됩니다.
          </Text>
          <Link to="/auction">즐겨찾기 추가하러 가기 →</Link>
        </Flex>
      )}
    </Card>
  );
}

function HornPosts({ server, keyword }: { server: ServerName; keyword: string }) {
  const query = useHornSearch(
    { server, q: keyword, days: 1, kind: 'all', not: '', character: '', limit: 10 },
    { live: true, background: false },
  );
  if (!canSearchHorns()) return <Text type="secondary">뿔피리 연결 설정을 확인해 주세요.</Text>;
  if (query.error)
    return (
      <Alert
        type="error"
        message="뿔피리를 불러오지 못했습니다."
        action={
          <Button size="small" onClick={() => void query.refetch()}>
            다시 시도
          </Button>
        }
      />
    );
  if (!query.data) return <Skeleton active title={false} paragraph={{ rows: 3 }} />;
  return (
    <Flex vertical gap={10} aria-live="polite">
      <Flex justify="space-between" align="center" gap={8} wrap>
        <Text type="secondary" style={{ fontSize: 12 }}>
          최근 1일 · 1분마다 갱신
        </Text>
        <Button
          size="small"
          loading={query.isFetching}
          onClick={() => void query.refetch()}
          aria-label="뿔피리 새로고침"
        >
          새로고침
        </Button>
      </Flex>
      {!query.data.posts.length && (
        <Text type="secondary">최근 하루 동안 일치하는 뿔피리가 없습니다.</Text>
      )}
      {query.data.posts.slice(0, 4).map((post) => (
        <div key={post.id}>
          <Flex justify="space-between" gap={8}>
            <Text strong>{post.character}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {new Date(post.last * 1000).toLocaleTimeString('ko-KR', {
                timeZone: 'Asia/Seoul',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
              })}
            </Text>
          </Flex>
          <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0 }}>
            {post.body}
          </Typography.Paragraph>
        </div>
      ))}
    </Flex>
  );
}
export function HornWidget() {
  const [settings, update] = useUserSettings();
  const [keyword, setKeyword] = useState('');
  return (
    <Card
      size="small"
      title="뿔피리"
      extra={
        <Link to={`/horn?${new URLSearchParams({ server: settings.server, q: keyword })}`}>
          전체 보기
        </Link>
      }
    >
      <Flex vertical gap={12}>
        <Flex gap={8} wrap>
          <Select
            aria-label="뿔피리 서버"
            value={settings.server}
            onChange={(server) => update({ server })}
            options={SERVER_NAMES.map((server) => ({ value: server, label: server }))}
            style={{ width: 100 }}
          />
          <Input.Search
            aria-label="뿔피리 검색어"
            placeholder="검색어"
            allowClear
            maxLength={100}
            onSearch={setKeyword}
            style={{ flex: '1 1 130px' }}
          />
        </Flex>
        <HornPosts
          key={`${settings.server}:${keyword}`}
          server={settings.server}
          keyword={keyword}
        />
      </Flex>
    </Card>
  );
}

const MaterialMemoContent = lazy(async () => ({
  default: (await import('@/pages/MaterialMemoPage')).MaterialMemoContent,
}));

export function MemoWidget() {
  return (
    <Card size="small" title="목표 아이템 재료 메모" extra={<Link to={memoPath}>전체 화면</Link>}>
      <Suspense fallback={<Skeleton active paragraph={{ rows: 4 }} />}>
        <MaterialMemoContent />
      </Suspense>
    </Card>
  );
}
