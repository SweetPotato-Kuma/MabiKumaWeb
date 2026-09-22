import { useMemo, useState } from 'react';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { AUCTION_ITEM_CATEGORIES, KEYWORD_MAX_COUNT } from '@/features/auction/constants';
import { isAuctionSearchReady, useAuctionHistoryQuery, useAuctionItemsQuery } from '@/features/auction/hooks';
import { calculatePriceStats } from '@/features/auction/stats';
import type { AuctionSearchInput, AuctionSearchMode } from '@/features/auction/types';
import { formatDateTime, formatGold, formatNumber, formatRemaining } from '@/lib/format';
import { NexonApiError } from '@/lib/nexonClient';
import { useCanQuery } from '@/lib/settings';

type Tab = 'items' | 'history';

const EMPTY_INPUT: AuctionSearchInput = {
  mode: 'list',
  category: '',
  itemName: '',
  keyword: '',
};

export function AuctionPage() {
  const canQuery = useCanQuery();
  const [form, setForm] = useState<AuctionSearchInput>(EMPTY_INPUT);
  const [submitted, setSubmitted] = useState<AuctionSearchInput | null>(null);
  const [tab, setTab] = useState<Tab>('items');

  const query = submitted ?? EMPTY_INPUT;
  const enabled = canQuery && submitted !== null && isAuctionSearchReady(query);

  const itemsQuery = useAuctionItemsQuery(query, enabled && tab === 'items');
  const historyQuery = useAuctionHistoryQuery(query, enabled && tab === 'history' && query.mode === 'list');

  const items = itemsQuery.data?.items ?? [];
  const history = historyQuery.data?.items ?? [];
  const stats = useMemo(() => calculatePriceStats(items), [items]);

  const canSubmit = isAuctionSearchReady(form);

  /**
   * 넥슨 API 의 item_name 은 정확한 전체 이름만 받는다. "검" 처럼 일부만 넣으면
   * 결과가 0건이 아니라 OPENAPI00004 로 거절당한다. 그 경우 같은 말을 키워드
   * 검색으로 넘겨 주는 편이 사용자가 할 일을 하나 줄여 준다.
   */
  const rejectedItemName =
    query.mode === 'list' && query.itemName.trim().length > 0 ? query.itemName.trim() : '';

  function keywordFallback(error: unknown) {
    if (!rejectedItemName) return null;
    if (!(error instanceof NexonApiError) || error.code !== 'OPENAPI00004') return null;

    return (
      <>
        <p className="state__body">
          아이템 이름은 <strong>정확한 전체 이름</strong>이어야 합니다. 이름 일부로 찾으려면 키워드
          검색을 쓰세요.
        </p>
        <button
          type="button"
          className="button"
          onClick={() => {
            const next: AuctionSearchInput = {
              ...EMPTY_INPUT,
              mode: 'keyword',
              keyword: rejectedItemName,
            };
            setForm(next);
            setSubmitted(next);
            setTab('items');
          }}
        >
          ‘{rejectedItemName}’ 으로 키워드 검색
        </button>
      </>
    );
  }

  return (
    <div className="page">
      <h1>경매장 조회</h1>
      <ApiKeyNotice />

      <form
        className="panel search-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          setSubmitted({ ...form });
        }}
      >
        <fieldset className="field-row">
          <legend>검색 방식</legend>
          {(
            [
              ['list', '카테고리 / 이름'],
              ['keyword', '키워드'],
            ] as const
          ).map(([mode, label]) => (
            <label key={mode} className="radio">
              <input
                type="radio"
                name="mode"
                value={mode}
                checked={form.mode === mode}
                onChange={() => {
                  setForm((prev) => ({ ...prev, mode: mode as AuctionSearchMode }));
                  if (mode === 'keyword') setTab('items');
                }}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {form.mode === 'list' ? (
          <div className="field-row">
            <label className="field">
              <span>카테고리</span>
              <select
                value={form.category}
                onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}
              >
                <option value="">전체</option>
                {AUCTION_ITEM_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>아이템 이름 (정확히 일치)</span>
              <input
                type="text"
                value={form.itemName}
                placeholder="예: 롱 소드"
                onChange={(event) => setForm((prev) => ({ ...prev, itemName: event.target.value }))}
              />
              <small className="muted">
                전체 이름을 그대로 넣어야 합니다. 이름 일부로 찾으려면 키워드 검색을 쓰세요.
              </small>
            </label>
          </div>
        ) : (
          <div className="field-row">
            <label className="field field--wide">
              <span>키워드 (쉼표로 최대 {KEYWORD_MAX_COUNT}개)</span>
              <input
                type="text"
                value={form.keyword}
                placeholder="예: 숏,소드"
                onChange={(event) => setForm((prev) => ({ ...prev, keyword: event.target.value }))}
              />
              <small className="muted">
                입력한 단어가 이름에 모두 포함된 아이템을 찾습니다. 단어는 정확히 일치해야 합니다.
              </small>
            </label>
          </div>
        )}

        <div className="field-row field-row--actions">
          <button type="submit" className="button button--primary" disabled={!canSubmit || !canQuery}>
            검색
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setForm(EMPTY_INPUT);
              setSubmitted(null);
            }}
          >
            초기화
          </button>
        </div>
      </form>

      {submitted === null ? null : (
        <>
          <div className="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'items'}
              className={tab === 'items' ? 'tab is-active' : 'tab'}
              onClick={() => setTab('items')}
            >
              판매 중 매물
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'history'}
              className={tab === 'history' ? 'tab is-active' : 'tab'}
              disabled={query.mode === 'keyword'}
              title={query.mode === 'keyword' ? '거래 내역은 카테고리/이름 검색에서만 조회됩니다.' : undefined}
              onClick={() => setTab('history')}
            >
              최근 1시간 거래 내역
            </button>
          </div>

          {tab === 'items' ? (
            <>
              {stats ? (
                <section className="stat-grid" aria-label="개당 가격 통계">
                  <div className="stat">
                    <span className="stat__label">매물 수</span>
                    <strong className="stat__value">{formatNumber(stats.count)}</strong>
                  </div>
                  <div className="stat">
                    <span className="stat__label">최저</span>
                    <strong className="stat__value">{formatGold(stats.min)}</strong>
                  </div>
                  <div className="stat">
                    <span className="stat__label">중위</span>
                    <strong className="stat__value">{formatGold(stats.median)}</strong>
                  </div>
                  <div className="stat">
                    <span className="stat__label">평균</span>
                    <strong className="stat__value">{formatGold(stats.average)}</strong>
                  </div>
                  <div className="stat">
                    <span className="stat__label">최고</span>
                    <strong className="stat__value">{formatGold(stats.max)}</strong>
                  </div>
                </section>
              ) : null}

              <QueryState
                isLoading={itemsQuery.isPending && enabled}
                error={itemsQuery.error}
                isEmpty={items.length === 0}
                errorAction={keywordFallback(itemsQuery.error)}
              >
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th scope="col">아이템</th>
                        <th scope="col">카테고리</th>
                        <th scope="col" className="align-right">
                          수량
                        </th>
                        <th scope="col" className="align-right">
                          개당 가격
                        </th>
                        <th scope="col">만료</th>
                        <th scope="col">옵션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item, index) => (
                        <tr key={`${item.item_display_name}-${item.date_auction_expire}-${index}`}>
                          <td>
                            <span className="item-name">{item.item_display_name}</span>
                            {item.item_display_name !== item.item_name ? (
                              <small className="muted">{item.item_name}</small>
                            ) : null}
                          </td>
                          <td>{item.auction_item_category}</td>
                          <td className="align-right">{formatNumber(item.item_count)}</td>
                          <td className="align-right">{formatGold(item.auction_price_per_unit)}</td>
                          <td>
                            <span>{formatRemaining(item.date_auction_expire)}</span>
                            <small className="muted">{formatDateTime(item.date_auction_expire)}</small>
                          </td>
                          <td>
                            <ItemOptionList options={item.item_option} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {itemsQuery.hasNextPage ? (
                  <button
                    type="button"
                    className="button button--block"
                    disabled={itemsQuery.isFetchingNextPage}
                    onClick={() => void itemsQuery.fetchNextPage()}
                  >
                    {itemsQuery.isFetchingNextPage ? '불러오는 중…' : '500개 더 불러오기'}
                  </button>
                ) : null}
              </QueryState>
            </>
          ) : (
            <QueryState
              isLoading={historyQuery.isPending && enabled}
              error={historyQuery.error}
              isEmpty={history.length === 0}
              emptyMessage="최근 1시간 안에 거래된 내역이 없습니다."
              errorAction={keywordFallback(historyQuery.error)}
            >
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">아이템</th>
                      <th scope="col">카테고리</th>
                      <th scope="col" className="align-right">
                        수량
                      </th>
                      <th scope="col" className="align-right">
                        개당 가격
                      </th>
                      <th scope="col">거래 시각</th>
                      <th scope="col">옵션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.auction_buy_id}>
                        <td>
                          <span className="item-name">{row.item_display_name}</span>
                          {row.item_display_name !== row.item_name ? (
                            <small className="muted">{row.item_name}</small>
                          ) : null}
                        </td>
                        <td>{row.auction_item_category}</td>
                        <td className="align-right">{formatNumber(row.item_count)}</td>
                        <td className="align-right">{formatGold(row.auction_price_per_unit)}</td>
                        <td>{formatDateTime(row.date_auction_buy)}</td>
                        <td>
                          <ItemOptionList options={row.item_option} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {historyQuery.hasNextPage ? (
                <button
                  type="button"
                  className="button button--block"
                  disabled={historyQuery.isFetchingNextPage}
                  onClick={() => void historyQuery.fetchNextPage()}
                >
                  {historyQuery.isFetchingNextPage ? '불러오는 중…' : '더 불러오기'}
                </button>
              ) : null}
            </QueryState>
          )}
        </>
      )}
    </div>
  );
}
