/**
 * 던전 코인 교환 표.
 *
 * 던전을 돌면 고정으로 받는 코인(구슬, 증표, 조각)이 있고, 던전 근처 NPC 가 그 코인을 받고 물건을
 * 내준다. 여기에는 NPC 마다 무엇을 코인 몇 개에 주는지만 적는다. 가격은 화면이 경매장에서 받는다.
 *
 * 교환 목록은 게임 데이터에 없다(NPC 상점을 서버가 내려 준다). 게임 안의 NPC 교환 창 기준으로 적고,
 * 교환 목록이 바뀌는 패치가 있으면 여기를 고친다. 아이템 번호와 이름은 게임 데이터와 맞춰 두었다.
 */

export interface CoinExchange {
  /** 게임 아이템 번호. */
  id: number;
  /** 경매장과 아이템 정보가 쓰는 이름. 시세도 이 이름으로 묻는다. */
  name: string;
  /** 교환에 드는 코인 개수. */
  cost: number;
  /**
   * 그림 저장소의 파일 이름. 경매장에 오른 적 없는 아이템은 이름 사전에 카테고리가 없어
   * 이 이름으로만 그림이 나온다. 없으면 이름 사전으로 찾는다.
   */
  icon?: string;
}

export interface DungeonCoin {
  /** 주소에 쓰는 키. */
  key: string;
  dungeon: string;
  coin: { id: number; name: string };
  /** 교환해 주는 NPC. 게임 아이템 설명에 적힌 대로다. */
  npc: string;
  /** 교환품에 대해 따로 알려야 할 것. */
  note?: string;
  /**
   * 교환품이 거래 불가라 가공해 팔아야 하는 던전. 화면이 가공 계산기로 가는 전환 단추를 둔다.
   * 지금은 중간 재료 제작법을 확인한 브리 레흐만 켠다.
   */
  craftable?: boolean;
  exchanges: CoinExchange[];
}

export const DUNGEON_COINS: DungeonCoin[] = [
  {
    key: 'tala-gah',
    dungeon: '탈라 가흐',
    coin: { id: 5300313, name: '탈라 가흐 구슬' },
    npc: '탈라 가흐 근처의 포인셰',
    exchanges: [
      { id: 5100462, name: '빛바랜 에너지 회로', cost: 35, icon: '3ef6d7963f0144fd.png' },
      { id: 5100461, name: '고리아스 동력원', cost: 200, icon: 'bc441a9212b4a278.png' },
      { id: 5100463, name: '순도 높은 실리엔 섬유 다발', cost: 6, icon: '64ce5ffe72b3a30f.png' },
      { id: 5100466, name: '희미하게 빛나는 명주실', cost: 3, icon: '2d595b06ca128c68.png' },
      { id: 5100467, name: '끈적이게 엉긴 식물 덩어리', cost: 3, icon: 'cc9e41954db18ff1.png' },
      { id: 5100464, name: '순도 높은 힐웬 강판 조각', cost: 6, icon: 'dc7c8aa2132ef10e.png' },
      { id: 5100468, name: '달아오른 광두정', cost: 3, icon: 'a853f18fb6d7e1ce.png' },
      { id: 5100465, name: '순도 높은 힐웬 주괴 조각', cost: 6, icon: '39ef8b3c49ab5a5e.png' },
    ],
  },
  {
    key: 'brie-lech',
    dungeon: '브리 레흐',
    coin: { id: 5300217, name: '브리 레흐 구슬' },
    npc: '브리 레흐 근처의 레넨',
    craftable: true,
    exchanges: [
      { id: 5100303, name: '브리 레흐의 코어', cost: 100, icon: 'ecf32e783357e586.png' },
      { id: 5100304, name: '브리 레흐의 정수', cost: 100, icon: 'b7323a5a4d0889cf.png' },
      { id: 5100312, name: '텅 빈 마력석', cost: 3, icon: 'f88b1da520bd6308.png' },
      { id: 5100328, name: '녹음이 깃든 마법사의 보석', cost: 1, icon: '2b1e9b7006032d3f.png' },
      { id: 64674, name: '깨어난 힘의 정수', cost: 5, icon: '688ebc57088d4fbc.png' },
      { id: 5100326, name: '순백의 깃털', cost: 1, icon: '63de6c107248cb2b.png' },
      { id: 5100325, name: '순백의 가죽 조각', cost: 1, icon: '1ae7d1e2010ee989.png' },
      { id: 5100318, name: '오묘한 가죽 조각', cost: 3, icon: '0a98a9fd46e71f4e.png' },
      { id: 5100317, name: '오묘한 마력석', cost: 3, icon: 'afb2e35c6d983418.png' },
      { id: 5100306, name: '초록빛 기억의 조각', cost: 25, icon: '74617ab8b91be711.png' },
      { id: 5100329, name: '단단한 늑대의 이빨', cost: 1, icon: '2a5ad11302599c49.png' },
      { id: 5100320, name: '녹음이 감도는 칼날 조각', cost: 1, icon: '7ea248bb71505235.png' },
      { id: 5100305, name: '주황빛 기억의 조각', cost: 25, icon: 'c210018391603394.png' },
      { id: 5100307, name: '금빛 기억의 조각', cost: 25, icon: 'aefc2f7c62272814.png' },
      { id: 5100319, name: '순도 높은 마력의 결정', cost: 3, icon: '4e701504d8690b9f.png' },
      { id: 5100323, name: '녹음이 감도는 나무 장작', cost: 1, icon: 'f35ed11e01726bdf.png' },
      { id: 5100311, name: '빛바랜 자수실', cost: 3, icon: '63a9bbd561e3bbf0.png' },
      { id: 5100324, name: '단단한 힐웬 광석 조각', cost: 1, icon: 'ec66e365cf608bc4.png' },
      { id: 5100310, name: '무른 금속 파편', cost: 3, icon: 'd6d0811bbe806bac.png' },
      { id: 5100327, name: '투명한 연금술 결정', cost: 1, icon: '9981e6bf767d82ad.png' },
      { id: 5100322, name: '녹음이 감도는 광석 조각', cost: 1, icon: '464144c427e4add9.png' },
      { id: 5100308, name: '브리 레흐의 기운이 깃든 문장', cost: 3, icon: '111e7e49320ad37d.png' },
      { id: 5100330, name: '마력석', cost: 1, icon: '29373fe2a6b2af42.png' },
      { id: 5100313, name: '아라고나이트', cost: 3, icon: 'a3f394463c4dcbb3.png' },
      { id: 5100315, name: '오피먼트', cost: 3, icon: '1c8d2e9555dd0918.png' },
    ],
  },
  {
    key: 'glenn-bearna',
    dungeon: '글렌 베르나',
    coin: { id: 5200147, name: '빛나는 수정 조각' },
    npc: '글렌 베르나 근처의 상인',
    exchanges: [
      { id: 5100074, name: '결정화된 겨울의 잔해', cost: 35, icon: '0e9fcafb6ddb12e6.png' },
      { id: 5100083, name: '잘려 나간 겨울의 꿈 결정', cost: 200, icon: 'e8163d4d886e62d2.png' },
      {
        id: 2230000,
        name: '스페셜 포레스트 레인저 웨어(남성용)',
        cost: 150,
        icon: '5977d7c92be078ae.png',
      },
      {
        id: 2230001,
        name: '스페셜 포레스트 레인저 웨어(여성용)',
        cost: 150,
        icon: '861382bfb1138c69.png',
      },
      {
        id: 2230002,
        name: '스페셜 포레스트 레인저 머플러 웨어(남성용)',
        cost: 150,
        icon: '0b4cd988fc310a71.png',
      },
      {
        id: 2230003,
        name: '스페셜 포레스트 레인저 머플러 웨어(여성용)',
        cost: 150,
        icon: 'd0ef24c040d57215.png',
      },
      {
        id: 2300005,
        name: '포레스트 레인저 글러브(남성용)',
        cost: 150,
        icon: '85f9502926a5ae4a.png',
      },
      {
        id: 2300006,
        name: '포레스트 레인저 글러브(여성용)',
        cost: 150,
        icon: '15c410edff41e5f5.png',
      },
      { id: 2400006, name: '포레스트 레인저 부츠(남성용)', cost: 150 },
      { id: 2400007, name: '포레스트 레인저 부츠(여성용)', cost: 150 },
      { id: 5100075, name: '공상을 담은 결정', cost: 1, icon: 'fcfd1abd614784b8.png' },
      { id: 5100077, name: '얼어붙은 백철 조각', cost: 6, icon: '3b12726795420f55.png' },
      { id: 5100084, name: '서늘한 매듭끈', cost: 6, icon: 'b66d2db08f3e6726.png' },
      { id: 5100080, name: '해묵은 베일의 올', cost: 3, icon: '2ab7575a016105a3.png' },
      { id: 5100079, name: '얇은 금속선의 파편', cost: 3, icon: '2fba4bf8c7d8a82a.png' },
    ],
  },
  {
    key: 'crom-bas',
    dungeon: '크롬 바스',
    coin: { id: 5300054, name: '아다만티움 코인' },
    npc: '크롬 바스 입구의 길라크',
    exchanges: [
      { id: 5100040, name: '손상된 글라스 기브넨의 깃털', cost: 200, icon: 'e2458e957d012a0a.png' },
      { id: 5100039, name: '글라스 기브넨의 심장', cost: 200, icon: 'c50c082666bcff06.png' },
      { id: 5100038, name: '아다만티움', cost: 200, icon: '01908c3434a57061.png' },
      { id: 5100045, name: '응축된 힘의 조각 : 스태프', cost: 20, icon: '1366fb4b33b07285.png' },
      { id: 5100055, name: '응축된 힘의 조각 : 실드', cost: 20, icon: '240a623e416f04c9.png' },
      { id: 5100369, name: '응축된 힘의 조각 : 힐링 원드', cost: 20, icon: 'dcee9fa6afe7ddbd.png' },
      { id: 5100052, name: '응축된 힘의 조각 : 수리검', cost: 20, icon: 'ff48b0c29d4d4d0c.png' },
      { id: 5100048, name: '응축된 힘의 조각 : 활', cost: 20, icon: '9267043b3aad5930.png' },
      { id: 5100426, name: '응축된 힘의 조각 : 미니어처', cost: 20, icon: '5a5115adce996a28.png' },
      { id: 5100049, name: '응축된 힘의 조각 : 듀얼건', cost: 20, icon: 'd01540901f5aa792.png' },
      { id: 5100242, name: '응축된 힘의 조각 : 대형 낫', cost: 20, icon: 'a62bec7cd02bc45d.png' },
      { id: 5100042, name: '응축된 힘의 조각 : 양손검', cost: 20, icon: '2ebc7aa7dd54106d.png' },
      { id: 5100056, name: '응축된 힘의 조각 : 석궁', cost: 20, icon: '5409d3399af7ebda.png' },
      { id: 5100046, name: '응축된 힘의 조각 : 너클', cost: 20, icon: 'e012a44578bcd7b6.png' },
      {
        id: 5100397,
        name: '응축된 힘의 조각 : 가드실린더',
        cost: 20,
        icon: 'c6d172e4721cdab1.png',
      },
      { id: 5100368, name: '응축된 힘의 조각 : 한손도끼', cost: 20, icon: '497a4049c0bc433c.png' },
      { id: 5100041, name: '응축된 힘의 조각 : 한손검', cost: 20, icon: '71fae148c5bfdfd0.png' },
      { id: 5100044, name: '응축된 힘의 조각 : 원드', cost: 20, icon: '75655074841eddf4.png' },
      { id: 5100051, name: '응축된 힘의 조각 : 핸들', cost: 20, icon: 'b9214c30510f734d.png' },
      { id: 5100243, name: '응축된 힘의 조각 : 오브', cost: 20, icon: '1b0fe0f969ecad05.png' },
      { id: 5100050, name: '응축된 힘의 조각 : 실린더', cost: 20, icon: 'b937c5ef368f4838.png' },
      { id: 5100043, name: '응축된 힘의 조각 : 랜스', cost: 20, icon: '130d9bff90c224e8.png' },
      { id: 5100054, name: '응축된 힘의 조각 : 마도서', cost: 20, icon: '35e220b0b1a5f25f.png' },
      { id: 5100053, name: '응축된 힘의 조각 : 양손도끼', cost: 20, icon: '7322f0421b5f3e5e.png' },
      {
        id: 5100047,
        name: '응축된 힘의 조각 : 체인 블레이드',
        cost: 20,
        icon: '88980b25c0936928.png',
      },
    ],
  },
  {
    key: 'crom-bas-abyss',
    dungeon: '크롬 바스 심연',
    coin: { id: 5300296, name: '심연의 증표' },
    npc: '크롬 바스 입구의 길라크',
    note: '심연의 증표로 받는 교환품은 거래할 수 없습니다. 가치는 경매장에서 같은 아이템을 살 때 드는 값입니다.',
    exchanges: [
      { id: 5000298, name: '인챈트 능력 상승의 스크롤', cost: 200 },
      { id: 5000297, name: '인챈트 대성공의 스크롤', cost: 200 },
      { id: 4300972, name: '특별 개조 상승의 스크롤', cost: 70 },
      { id: 64674, name: '깨어난 힘의 정수', cost: 10, icon: '688ebc57088d4fbc.png' },
      { id: 5100439, name: '어둠의 에르그 결정 (100)', cost: 7 },
    ],
  },
];

export interface CoinPurchase {
  /** 내야 하는 코인 이름. */
  coin: string;
  /** 교환품 하나에 드는 코인 개수. */
  cost: number;
}

let purchasesByName: Map<string, CoinPurchase[]> | undefined;

/** 이 이름의 아이템을 코인으로 살 수 있는 곳. 여러 NPC 가 팔면 모두, 없으면 빈 배열. */
export function coinPurchasesOf(name: string): CoinPurchase[] {
  if (!purchasesByName) {
    purchasesByName = new Map();
    for (const { coin, exchanges } of DUNGEON_COINS) {
      for (const exchange of exchanges) {
        const list = purchasesByName.get(exchange.name) ?? [];
        list.push({ coin: coin.name, cost: exchange.cost });
        purchasesByName.set(exchange.name, list);
      }
    }
  }
  return purchasesByName.get(name.replace(/\s*\(거래 ?불가\)$/, '')) ?? [];
}

export function dungeonCoinOf(key: string | null): DungeonCoin {
  return DUNGEON_COINS.find((entry) => entry.key === key) ?? DUNGEON_COINS[0];
}

export interface CoinTotal {
  coin: string;
  /** 코인으로 살 수 있는 재료를 모두 코인으로 샀을 때의 코인 개수. */
  total: number;
}

/**
 * 살 재료 목록에서 코인 상점에서 파는 것만 골라 코인별 개수를 합한다.
 * 같은 이름이 여러 줄이면 개수를 더하고, 여러 코인으로 살 수 있는 재료는 코인마다 센다.
 */
export function coinTotalsOf(rows: readonly { name: string; required: number }[]): CoinTotal[] {
  const totals = new Map<string, number>();
  for (const { name, required } of rows) {
    for (const { coin, cost } of coinPurchasesOf(name)) {
      totals.set(coin, (totals.get(coin) ?? 0) + cost * required);
    }
  }
  return [...totals].map(([coin, total]) => ({ coin, total }));
}
