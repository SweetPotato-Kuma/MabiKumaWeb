import type { ItemOption } from '@/features/auction/types';

export interface NpcShopPrice {
  price_type: string;
  price_value: number;
}

export interface NpcShopItem {
  item_display_name: string;
  item_count: number;
  item_option?: ItemOption[];
  price?: NpcShopPrice[];
  limit_type?: string;
  limit_value?: number;
  image_url?: string;
}

export interface NpcShopTab {
  tab_name: string;
  item: NpcShopItem[];
}

export interface NpcShopResponse {
  shop_tab_count: number;
  shop: NpcShopTab[];
  date_inquire: string;
  date_shop_next_update: string;
}

export interface NpcShopQueryInput {
  npcName: string;
  serverName: string;
  channel: number;
}
