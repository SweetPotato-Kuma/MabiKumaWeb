/**
 * NPC 가 파는 제작 재료.
 *
 * 넥슨 오픈 API 의 NPC 상점 조회는 NPC 21명(떠돌이 상인, 델, 피오나트 등)만 받고, 제작 재료를
 * 파는 마을 NPC 는 그 안에 없다. 게임 데이터에도 일반 NPC 상점 목록은 들어 있지 않다. 그래서 NPC
 * 판매 재료는 여기에 손으로 모은다. 게임에서 가격이 바뀌면 이 목록도 고쳐야 한다.
 *
 * 값은 개당 골드, 할인 전 값이다.
 */
export interface NpcMaterial {
  price: number;
  /** 파는 NPC. 모르면 비워 둔다. */
  npc?: string;
  /** 값을 어디서 확인했는지. 다음에 고칠 사람이 다시 찾아볼 수 있게. */
  source: string;
}

export const NPC_MATERIALS: Readonly<Record<string, NpcMaterial>> = {
  '각성된 힘의 가루': {
    price: 50_000,
    source: '공개된 아이템 정보의 상점가, 2026-09-26 확인',
  },
  '마력이 깃든 융합제': {
    price: 500_000,
    npc: '브리 레흐 앞 주민',
    // 2025-01 기사에는 개당 80만 골드로 나온다. 지금 상점가와 경매장 시세(약 49만)는 50만 쪽이다.
    source: '공개된 아이템 정보의 상점가, 2026-09-26 확인',
  },
  '빈 병': {
    price: 400,
    npc: '피오나트',
    source: '넥슨 NPC 상점 API, 2026-09-26 확인',
  },
};

/**
 * 수요일(알반 헤루인) 요일 효과. 상점에서 5% 싸게 산다. 요일은 현실 시간 자정에 바뀐다.
 * 할인한 값을 몇 골드 단위로 자르는지는 확인하지 못해 1골드 아래를 버린다.
 */
export const WEDNESDAY_DISCOUNT_PERCENT = 5;

/** 한국 시간으로 오늘이 수요일인지. 게임 서버가 한국 시간을 따른다. */
export function isWednesdayInKorea(now: Date = new Date()): boolean {
  return (
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' }).format(now) ===
    'Wed'
  );
}

/** 이름으로 NPC 판매가를 찾는다. 수요일 할인을 켜면 5% 뺀 값. NPC 가 팔지 않으면 undefined. */
export function npcUnitPrice(name: string, wednesday: boolean): number | undefined {
  const material = NPC_MATERIALS[name];
  if (!material) return undefined;
  // 소수로 곱하면 50000 x 0.95 가 47499.999... 가 되어 1골드가 빠진다. 정수로 계산한다.
  return wednesday
    ? Math.floor((material.price * (100 - WEDNESDAY_DISCOUNT_PERCENT)) / 100)
    : material.price;
}
