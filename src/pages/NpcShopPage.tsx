import { useState } from 'react';
import { ApiKeyNotice } from '@/components/ApiKeyNotice';
import { ItemOptionList } from '@/components/ItemOptionList';
import { QueryState } from '@/components/QueryState';
import { CHANNELS, NPC_NAMES, SERVER_NAMES } from '@/features/npcshop/constants';
import { useNpcShopQuery } from '@/features/npcshop/hooks';
import type { NpcShopQueryInput, NpcShopPrice } from '@/features/npcshop/types';
import { formatDateTime, formatNumber } from '@/lib/format';
import { useCanQuery } from '@/lib/settings';

const DEFAULT_INPUT: NpcShopQueryInput = {
  npcName: NPC_NAMES[0],
  serverName: SERVER_NAMES[0],
  channel: 1,
};

function formatPrices(prices: NpcShopPrice[] | undefined): string {
  if (!prices || prices.length === 0) return '-';
  return prices.map((price) => `${formatNumber(price.price_value)} ${price.price_type}`).join(' / ');
}

export function NpcShopPage() {
  const canQuery = useCanQuery();
  const [form, setForm] = useState<NpcShopQueryInput>(DEFAULT_INPUT);
  const [submitted, setSubmitted] = useState<NpcShopQueryInput | null>(null);
  const [activeTab, setActiveTab] = useState(0);

  const shopQuery = useNpcShopQuery(submitted ?? DEFAULT_INPUT, canQuery && submitted !== null);

  const tabs = shopQuery.data?.shop ?? [];
  const currentTab = tabs[activeTab];

  return (
    <div className="page">
      <h1>NPC 상점 조회</h1>
      <ApiKeyNotice />

      <form
        className="panel search-form"
        onSubmit={(event) => {
          event.preventDefault();
          setActiveTab(0);
          setSubmitted({ ...form });
        }}
      >
        <div className="field-row">
          <label className="field">
            <span>서버</span>
            <select
              value={form.serverName}
              onChange={(event) => setForm((prev) => ({ ...prev, serverName: event.target.value }))}
            >
              {SERVER_NAMES.map((server) => (
                <option key={server} value={server}>
                  {server}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>채널</span>
            <select
              value={form.channel}
              onChange={(event) => setForm((prev) => ({ ...prev, channel: Number(event.target.value) }))}
            >
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel} 채널
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>NPC</span>
            <select
              value={form.npcName}
              onChange={(event) => setForm((prev) => ({ ...prev, npcName: event.target.value }))}
            >
              {NPC_NAMES.map((npc) => (
                <option key={npc} value={npc}>
                  {npc}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row field-row--actions">
          <button type="submit" className="button button--primary" disabled={!canQuery}>
            조회
          </button>
        </div>
      </form>

      {submitted === null ? null : (
        <QueryState
          isLoading={shopQuery.isPending}
          error={shopQuery.error}
          isEmpty={tabs.length === 0}
          emptyMessage="해당 NPC 의 상점 정보가 없습니다. 채널이나 서버를 바꿔 보세요."
        >
          <p className="muted">
            조회 시각 {formatDateTime(shopQuery.data?.date_inquire)} · 다음 갱신{' '}
            {formatDateTime(shopQuery.data?.date_shop_next_update)}
          </p>

          <div className="tabs" role="tablist">
            {tabs.map((tab, index) => (
              <button
                key={tab.tab_name}
                type="button"
                role="tab"
                aria-selected={index === activeTab}
                className={index === activeTab ? 'tab is-active' : 'tab'}
                onClick={() => setActiveTab(index)}
              >
                {tab.tab_name}
              </button>
            ))}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">아이템</th>
                  <th scope="col" className="align-right">
                    수량
                  </th>
                  <th scope="col">가격</th>
                  <th scope="col">구매 제한</th>
                  <th scope="col">옵션</th>
                </tr>
              </thead>
              <tbody>
                {(currentTab?.item ?? []).map((item, index) => (
                  <tr key={`${item.item_display_name}-${index}`}>
                    <td>
                      <span className="item-cell">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" width={32} height={32} loading="lazy" />
                        ) : null}
                        <span className="item-name">{item.item_display_name}</span>
                      </span>
                    </td>
                    <td className="align-right">{formatNumber(item.item_count)}</td>
                    <td>{formatPrices(item.price)}</td>
                    <td>
                      {item.limit_type
                        ? `${item.limit_type} ${formatNumber(item.limit_value)}`
                        : '제한 없음'}
                    </td>
                    <td>
                      <ItemOptionList options={item.item_option} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </QueryState>
      )}
    </div>
  );
}
