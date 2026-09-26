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
   * 교환품이 거래 불가라 가공해 팔아야 하는 던전. 화면이 가공 계산기를 붙인다.
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
      { id: 2230000, name: '스페셜 포레스트 레인저 웨어(남성용)', cost: 150, icon: '5977d7c92be078ae.png' },
      { id: 2230001, name: '스페셜 포레스트 레인저 웨어(여성용)', cost: 150, icon: '861382bfb1138c69.png' },
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
      { id: 2300005, name: '포레스트 레인저 글러브(남성용)', cost: 150, icon: '85f9502926a5ae4a.png' },
      { id: 2300006, name: '포레스트 레인저 글러브(여성용)', cost: 150, icon: '15c410edff41e5f5.png' },
      { id: 2400006, name: '포레스트 레인저 부츠(남성용)', cost: 150 },
      { id: 2400007, name: '포레스트 레인저 부츠(여성용)', cost: 150 },
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

export function dungeonCoinOf(key: string | null): DungeonCoin {
  return DUNGEON_COINS.find((entry) => entry.key === key) ?? DUNGEON_COINS[0];
}
