import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Flex, Input, Table, Typography, type TableColumnsType } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { QueryState } from '@/components/QueryState';
import { fetchTradeHistory } from '@/features/auction/api';
import { normalizeForSearch } from '@/features/auction/dictionary';
import { useAuctionScanQuery } from '@/features/auction/hooks';
import { PET_CATEGORY } from '@/features/auction/optionFilter';
import {
  groupPetSpecies,
  petSpeciesAuctionPath,
  type PetSpeciesRow,
} from '@/features/auction/petSpecies';
import { canLookupMarket } from '@/features/market/api';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useNarrowScreen } from '@/lib/narrowScreen';
import { useGoldFormatter } from '@/lib/useGoldFormatter';

const { Text } = Typography;

/** 모듈 수준에 둔다. 매 렌더 새 배열이면 조회 키가 매번 바뀐다. */
const CATEGORIES = [PET_CATEGORY];

/** 거래 기록에서 한 번에 받는 최대 건수(worker/market.js 의 HISTORY_MAX_LIMIT). */
const TRADE_LIMIT = 500;

const byNumber = (value: number | null) => value ?? Number.POSITIVE_INFINITY;

/**
 * 분양 메달의 종족별 매물과 최근 거래. 메달 이름이 모두 같아 경매장 검색만으로는 어떤 펫이 얼마인지 보이지
 * 않는다. 지금 매물은 분양 메달 카테고리를 끝까지 받고, 거래는 시세 기록에서 최근 것을 받아 종족으로 묶는다.
 */
export function PetSpeciesSection({ name }: { name: string }) {
  const formatGold = useGoldFormatter();
  const narrow = useNarrowScreen();
  const [keyword, setKeyword] = useState('');

  const scan = useAuctionScanQuery(CATEGORIES, true);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = scan;
  // 한 쪽이라도 빠지면 가장 싼 값이 틀린다. 끝까지 받는다.
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
  const listingsDone = scan.data !== undefined && !hasNextPage;
  const listings = useMemo(
    () => (listingsDone ? (scan.data?.items ?? []).filter((item) => item.item_name === name) : []),
    [listingsDone, scan.data, name],
  );

  const trades = useQuery({
    queryKey: ['auction', 'petSpecies', 'trades', name],
    queryFn: ({ signal }) => fetchTradeHistory({ names: [name], limit: TRADE_LIMIT }, signal),
    enabled: canLookupMarket(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const tradeItems = useMemo(() => trades.data?.auction_history ?? [], [trades.data]);
  const oldestTrade = tradeItems.at(-1)?.date_auction_buy ?? null;

  const rows = useMemo(() => groupPetSpecies(listings, tradeItems), [listings, tradeItems]);
  const term = normalizeForSearch(keyword);
  const shown = term ? rows.filter((row) => normalizeForSearch(row.species).includes(term)) : rows;

  const lastTrade = (row: PetSpeciesRow) =>
    row.lastTrade ? (
      <Flex vertical gap={0} align="flex-end">
        <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
          {formatGold(row.lastTrade.price)}
        </Text>
        <Text type="secondary" className="tnum" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
          {formatDateTime(row.lastTrade.at)}
        </Text>
      </Flex>
    ) : (
      <Text type="secondary">-</Text>
    );

  const columns: TableColumnsType<PetSpeciesRow> = [
    {
      title: '종족',
      key: 'species',
      sorter: (a, b) => a.species.localeCompare(b.species, 'ko'),
      render: (_value, row) => (
        <Flex vertical gap={2}>
          <Link to={petSpeciesAuctionPath(name, row.species)}>{row.species}</Link>
          {narrow ? (
            <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
              매물 {formatNumber(row.listings)}건
              {row.lastTrade ? `, 최근 거래 ${formatGold(row.lastTrade.price)}` : ''}
            </Text>
          ) : null}
        </Flex>
      ),
    },
    ...(narrow
      ? []
      : ([
          {
            title: '매물',
            key: 'listings',
            width: 80,
            align: 'right',
            sorter: (a, b) => a.listings - b.listings,
            render: (_value, row) => <Text className="tnum">{formatNumber(row.listings)}</Text>,
          },
          {
            title: '최근 거래',
            key: 'lastTrade',
            width: 170,
            align: 'right',
            sorter: (a, b) =>
              byNumber(a.lastTrade?.price ?? null) - byNumber(b.lastTrade?.price ?? null),
            render: (_value, row) => lastTrade(row),
          },
        ] satisfies TableColumnsType<PetSpeciesRow>)),
    {
      title: '최저가',
      key: 'lowest',
      width: narrow ? 120 : 150,
      align: 'right',
      sorter: (a, b) => byNumber(a.lowest) - byNumber(b.lowest),
      render: (_value, row) =>
        row.lowest === null ? (
          <Text type="secondary">-</Text>
        ) : (
          <Text strong className="tnum" style={{ whiteSpace: 'nowrap' }}>
            {formatGold(row.lowest)}
          </Text>
        ),
    },
  ];

  return (
    <Card title="종족별 시세">
      <QueryState
        isLoading={!listingsDone && !scan.error}
        error={scan.error}
        isEmpty={rows.length === 0 && !trades.isPending}
        emptyMessage="지금 올라온 분양 메달과 최근 거래가 없습니다."
      >
        <Flex vertical gap={10}>
          <Input
            aria-label="종족 이름으로 찾기"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="예: 페어리 드래곤"
            allowClear
            style={{ maxWidth: 320 }}
          />
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            종족 {formatNumber(rows.length)}가지, 매물 {formatNumber(listings.length)}건
            {tradeItems.length > 0
              ? `, 거래 ${formatNumber(tradeItems.length)}건(${formatDateTime(oldestTrade)}부터)`
              : ''}
            {term ? `, ${formatNumber(shown.length)}가지 보는 중` : ''}. 게임 데이터는 평균 10분
            지연됩니다.
          </Text>
          <Table<PetSpeciesRow>
            columns={columns}
            dataSource={shown}
            rowKey="species"
            size="small"
            pagination={{ pageSize: 20, showSizeChanger: false, hideOnSinglePage: true }}
          />
        </Flex>
      </QueryState>
    </Card>
  );
}
