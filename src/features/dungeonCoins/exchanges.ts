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
      { id: 5100462, name: '빛바랜 에너지 회로', cost: 35, icon: 'a19bad88a541d6f4.webp' },
      { id: 5100461, name: '고리아스 동력원', cost: 200, icon: '612967490732918e.webp' },
      { id: 5100463, name: '순도 높은 실리엔 섬유 다발', cost: 6, icon: '10030efb380da9d6.webp' },
      { id: 5100466, name: '희미하게 빛나는 명주실', cost: 3, icon: 'da7337635c7c54f1.webp' },
      { id: 5100467, name: '끈적이게 엉긴 식물 덩어리', cost: 3, icon: '70237a696b18fabf.webp' },
      { id: 5100464, name: '순도 높은 힐웬 강판 조각', cost: 6, icon: '9e25103209138958.webp' },
      { id: 5100468, name: '달아오른 광두정', cost: 3, icon: '5e65c1c2005af2c9.webp' },
      { id: 5100465, name: '순도 높은 힐웬 주괴 조각', cost: 6, icon: '51527b097de54fa2.webp' },
      {
        id: 64581,
        name: '도면 - 더스크바운드 비고러스 아머(여성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 60081,
        name: '옷본 - 더스크바운드 에테리얼 튜더 베레모',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 비고러스 레더 헬멧',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 이지스 헬멧',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 이지스 가드(남성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 60081,
        name: '옷본 - 더스크바운드 에테리얼 글러브',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 60081,
        name: '옷본 - 더스크바운드 에테리얼 수트(여성용)',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 이지스 가드(여성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 비고러스 글러브',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 이지스 건틀렛',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 이지스 그리브',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 비고러스 아머(남성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 60081,
        name: '옷본 - 더스크바운드 에테리얼 수트(남성용)',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 64581,
        name: '도면 - 더스크바운드 비고러스 부츠',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 60081,
        name: '옷본 - 더스크바운드 에테리얼 슈즈',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
    ],
  },
  {
    key: 'brie-lech',
    dungeon: '브리 레흐',
    coin: { id: 5300217, name: '브리 레흐 구슬' },
    npc: '브리 레흐 근처의 레넨',
    craftable: true,
    exchanges: [
      { id: 5100303, name: '브리 레흐의 코어', cost: 100, icon: '9a16807c6dbe2c6d.webp' },
      { id: 5100304, name: '브리 레흐의 정수', cost: 100, icon: '69aba7d6efb7484b.webp' },
      { id: 5100312, name: '텅 빈 마력석', cost: 3, icon: '031ae1487c13898d.webp' },
      { id: 5100328, name: '녹음이 깃든 마법사의 보석', cost: 1, icon: '55148e9f6c9a6c75.webp' },
      { id: 64674, name: '깨어난 힘의 정수', cost: 5, icon: '5fd523a0e7b00f1e.webp' },
      { id: 5100326, name: '순백의 깃털', cost: 1, icon: 'bf2cc7cf19d6a37a.webp' },
      { id: 5100325, name: '순백의 가죽 조각', cost: 1, icon: '2ecde856deb841e5.webp' },
      { id: 5100318, name: '오묘한 가죽 조각', cost: 3, icon: '58d0ccf8216f9de8.webp' },
      { id: 5100317, name: '오묘한 마력석', cost: 3, icon: '13ea47650e78d4ab.webp' },
      { id: 5100306, name: '초록빛 기억의 조각', cost: 25, icon: 'c46d6c16c1379c99.webp' },
      { id: 5100329, name: '단단한 늑대의 이빨', cost: 1, icon: '2b604646cac150f5.webp' },
      { id: 5100320, name: '녹음이 감도는 칼날 조각', cost: 1, icon: '3ecf890c28c5745b.webp' },
      { id: 5100305, name: '주황빛 기억의 조각', cost: 25, icon: 'eed720d2ae5d62c4.webp' },
      { id: 5100307, name: '금빛 기억의 조각', cost: 25, icon: '3750712ba6a41947.webp' },
      { id: 5100319, name: '순도 높은 마력의 결정', cost: 3, icon: 'dfda434254ba3921.webp' },
      { id: 5100323, name: '녹음이 감도는 나무 장작', cost: 1, icon: '24eaa0d839ece62c.webp' },
      { id: 5100311, name: '빛바랜 자수실', cost: 3, icon: '5d692e822994d7e9.webp' },
      { id: 5100324, name: '단단한 힐웬 광석 조각', cost: 1, icon: 'd8f2a48beed66b68.webp' },
      { id: 5100310, name: '무른 금속 파편', cost: 3, icon: '1af2b96d6e5cc755.webp' },
      { id: 5100327, name: '투명한 연금술 결정', cost: 1, icon: 'dd6bcdce7deb7a63.webp' },
      { id: 5100322, name: '녹음이 감도는 광석 조각', cost: 1, icon: '998d6deffa3e33ae.webp' },
      { id: 5100308, name: '브리 레흐의 기운이 깃든 문장', cost: 3, icon: 'd5762ad633f38cb9.webp' },
      { id: 5100330, name: '마력석', cost: 1, icon: '24b9e911125e70cb.webp' },
      { id: 5100313, name: '아라고나이트', cost: 3, icon: '9808cb15549de06a.webp' },
      { id: 5100315, name: '오피먼트', cost: 3, icon: '886ac9ad4ac92f63.webp' },
      { id: 5100321, name: '녹음이 감도는 금속 조각', cost: 1, icon: '4e27f26f55cc6ad0.webp' },
      { id: 5100316, name: '오묘한 금속 조각', cost: 3, icon: 'a83dfa3b60e713b7.webp' },
      { id: 5100314, name: '바리사이트', cost: 3, icon: '911c14b9b1f75037.webp' },
      { id: 5100309, name: '무딘 칼날 조각', cost: 3, icon: '83b6c09108acaeb2.webp' },
    ],
  },
  {
    key: 'glenn-bearna',
    dungeon: '글렌 베르나',
    coin: { id: 5200147, name: '빛나는 수정 조각' },
    npc: '글렌 베르나 근처의 상인',
    exchanges: [
      { id: 5100074, name: '결정화된 겨울의 잔해', cost: 35, icon: '64ac020601c2bd00.webp' },
      { id: 5100083, name: '잘려 나간 겨울의 꿈 결정', cost: 200, icon: 'eea344e19f39caa8.webp' },
      {
        id: 2230000,
        name: '스페셜 포레스트 레인저 웨어(남성용)',
        cost: 150,
        icon: 'aeeae4967a69f47a.webp',
      },
      {
        id: 2230001,
        name: '스페셜 포레스트 레인저 웨어(여성용)',
        cost: 150,
        icon: 'f30274f4b9d10096.webp',
      },
      {
        id: 2230002,
        name: '스페셜 포레스트 레인저 머플러 웨어(남성용)',
        cost: 150,
        icon: '3e341462fa5d3767.webp',
      },
      {
        id: 2230003,
        name: '스페셜 포레스트 레인저 머플러 웨어(여성용)',
        cost: 150,
        icon: '49c70cf90c4efc5a.webp',
      },
      {
        id: 2300005,
        name: '포레스트 레인저 글러브(남성용)',
        cost: 150,
        icon: 'b0e352ffc8e2b584.webp',
      },
      {
        id: 2300006,
        name: '포레스트 레인저 글러브(여성용)',
        cost: 150,
        icon: '1a33a33807fe47ab.webp',
      },
      { id: 2400006, name: '포레스트 레인저 부츠(남성용)', cost: 150 },
      { id: 2400007, name: '포레스트 레인저 부츠(여성용)', cost: 150 },
      { id: 5100075, name: '공상을 담은 결정', cost: 1, icon: '53a525bab95b1be5.webp' },
      { id: 5100077, name: '얼어붙은 백철 조각', cost: 6, icon: 'ecc0421e965affa2.webp' },
      { id: 5100084, name: '서늘한 매듭끈', cost: 6, icon: 'd002088023417741.webp' },
      { id: 5100080, name: '해묵은 베일의 올', cost: 3, icon: 'cf72df7e074f72e2.webp' },
      { id: 5100079, name: '얇은 금속선의 파편', cost: 3, icon: '9e61d2c525eac8c9.webp' },
      { id: 5100076, name: '얼어붙은 판금 조각', cost: 6, icon: '4d8298a9c5643527.webp' },
      { id: 5100078, name: '얼어붙은 직물 조각', cost: 6, icon: '0916a6a36d701f5a.webp' },
      { id: 5100081, name: '깨진 묵빛 금속 파편', cost: 3, icon: '6cd4c7c4730eccd8.webp' },
      { id: 5100082, name: '얼음과 융화된 금속 파편', cost: 3, icon: '9253fa748791b93c.webp' },
      {
        id: 60081,
        name: '옷본 - 블리안 엔더스 클래시 글러브',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 60081,
        name: '옷본 - 블리안 엔더스 클래시 수트(여성용)',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 60081,
        name: '옷본 - 블리안 엔더스 클래시 써클릿(여성용)',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 60081,
        name: '옷본 - 블리안 엔더스 클래시 수트(남성용)',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 60081,
        name: '옷본 - 블리안 엔더스 클래시 써클릿(남성용)',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 60081,
        name: '옷본 - 블리안 엔더스 클래시 슈즈',
        cost: 180,
        icon: '0bca095d72497da6.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 인텐스 써클릿(여성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 인텐스 부츠',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 듀러블 가드(여성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 듀러블 가드(남성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 인텐스 글러브',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 듀러블 그리브',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 듀러블 건틀렛',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 듀러블 써클릿(남성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 듀러블 써클릿(여성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 인텐스 아머(남성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 인텐스 아머(여성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
      {
        id: 64581,
        name: '도면 - 블리안 엔더스 인텐스 써클릿(남성용)',
        cost: 180,
        icon: 'df345195d86e9b8f.webp',
      },
    ],
  },
  {
    key: 'crom-bas',
    dungeon: '크롬 바스',
    coin: { id: 5300054, name: '아다만티움 코인' },
    npc: '크롬 바스 입구의 길라크',
    exchanges: [
      { id: 5100040, name: '손상된 글라스 기브넨의 깃털', cost: 200, icon: '964ba5da517f92d3.webp' },
      { id: 5100039, name: '글라스 기브넨의 심장', cost: 200, icon: 'e2efa61adf7b74c1.webp' },
      { id: 5100038, name: '아다만티움', cost: 200, icon: 'e14f8fdc1fc5b99f.webp' },
      { id: 5100045, name: '응축된 힘의 조각 : 스태프', cost: 20, icon: 'e9b2c46e7e7700ae.webp' },
      { id: 5100055, name: '응축된 힘의 조각 : 실드', cost: 20, icon: '28a47986927881a2.webp' },
      { id: 5100369, name: '응축된 힘의 조각 : 힐링 원드', cost: 20, icon: '94d1a98dc6434f61.webp' },
      { id: 5100052, name: '응축된 힘의 조각 : 수리검', cost: 20, icon: '296c4dd6d8330a50.webp' },
      { id: 5100048, name: '응축된 힘의 조각 : 활', cost: 20, icon: '8e8bbd054d16269c.webp' },
      { id: 5100426, name: '응축된 힘의 조각 : 미니어처', cost: 20, icon: '91cf2307a863794a.webp' },
      { id: 5100049, name: '응축된 힘의 조각 : 듀얼건', cost: 20, icon: '821fa0896b252fb9.webp' },
      { id: 5100242, name: '응축된 힘의 조각 : 대형 낫', cost: 20, icon: '183aa65a1abc8c40.webp' },
      { id: 5100042, name: '응축된 힘의 조각 : 양손검', cost: 20, icon: 'c0e0e8070f44ae71.webp' },
      { id: 5100056, name: '응축된 힘의 조각 : 석궁', cost: 20, icon: '108916142a537f5d.webp' },
      { id: 5100046, name: '응축된 힘의 조각 : 너클', cost: 20, icon: 'f076369d01580aa4.webp' },
      {
        id: 5100397,
        name: '응축된 힘의 조각 : 가드실린더',
        cost: 20,
        icon: 'ab9232e944ddd727.webp',
      },
      { id: 5100368, name: '응축된 힘의 조각 : 한손도끼', cost: 20, icon: '6755c1bf90a1952c.webp' },
      { id: 5100041, name: '응축된 힘의 조각 : 한손검', cost: 20, icon: '5a0385f3fc6e4fec.webp' },
      { id: 5100044, name: '응축된 힘의 조각 : 원드', cost: 20, icon: '59d610391e15e07f.webp' },
      { id: 5100051, name: '응축된 힘의 조각 : 핸들', cost: 20, icon: 'd26471482c00230f.webp' },
      { id: 5100243, name: '응축된 힘의 조각 : 오브', cost: 20, icon: '2cec9658d0a0ce97.webp' },
      { id: 5100050, name: '응축된 힘의 조각 : 실린더', cost: 20, icon: '56d198dfadca9b9d.webp' },
      { id: 5100043, name: '응축된 힘의 조각 : 랜스', cost: 20, icon: '3fb486ef9871f3e7.webp' },
      { id: 5100054, name: '응축된 힘의 조각 : 마도서', cost: 20, icon: '3ef72f09ba60731b.webp' },
      { id: 5100053, name: '응축된 힘의 조각 : 양손도끼', cost: 20, icon: '2f4f8ef4cf2a075c.webp' },
      {
        id: 5100047,
        name: '응축된 힘의 조각 : 체인 블레이드',
        cost: 20,
        icon: '9259a64b1706e900.webp',
      },
      { id: 5100241, name: '응축된 힘의 조각 : 한손둔기', cost: 20, icon: '834d3ebed3e04a8c.webp' },
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
      { id: 64674, name: '깨어난 힘의 정수', cost: 10, icon: '5fd523a0e7b00f1e.webp' },
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
