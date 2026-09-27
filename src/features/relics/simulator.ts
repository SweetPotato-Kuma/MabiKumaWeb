import { useCallback, useState } from 'react';
import { RELIC_LEVELS, type RelicScale } from './murias';
import type { RelicPrices } from './priceFile';
import { rowKeyOf } from './prices';

/**
 * 무리아스의 유물(이데아) 복원 시뮬레이터.
 *
 * 이데아를 복원하면 스킬 옵션 하나가 1~10레벨 중 하나로 붙은 무리아스의 유물이 나온다. 옵션과
 * 레벨의 실제 확률은 공개되지 않아, 모든 옵션과 모든 레벨이 똑같이 나온다고 본다(유물 시세 화면의
 * 본전 확률과 같은 가정). 돈이 드는 일이 아니라 나오는 모양을 미리 겪어 보는 도구다.
 */

export interface RelicPoolEntry extends RelicScale {
  /** 스킬과 효과. 경매장 옵션 문장의 이름 부분과 같다. */
  name: string;
  /** "증가" 또는 "추가". */
  verb: string;
}

/**
 * 복원으로 나올 수 있는 스킬 옵션. 아르카나마다 셋이다. 경매장에 올라온 무리아스의 유물 옵션
 * 문장과 이름, 최대치, 단위가 같아야 시세가 붙는다. 게임에 옵션이 더해지면 여기에도 더한다.
 */
export const MURIAS_RELIC_POOL: readonly RelicPoolEntry[] = [
  // 엘레멘탈 나이트
  { name: '파이어 리프 어택 대미지', verb: '증가', max: 500, unit: '%' },
  { name: '아이스 윈드밀 대미지', verb: '증가', max: 600, unit: '%' },
  { name: '라이트닝 스매시 대미지', verb: '증가', max: 800, unit: '%' },
  // 세인트 바드
  { name: '구원의 메아리 회복량', verb: '증가', max: 10, unit: '%' },
  { name: '정화의 고동 지속 시간', verb: '증가', max: 5, unit: '초' },
  { name: '붕괴의 파동 지속 시간', verb: '증가', max: 5, unit: '초' },
  // 다크 메이지
  { name: '익스플로전 런지 대미지', verb: '증가', max: 20, unit: '%' },
  { name: '라이트닝 체인 대미지', verb: '증가', max: 30, unit: '%' },
  { name: '스노우 스톰 지속 시간', verb: '증가', max: 5, unit: '초' },
  // 알케믹 스팅어
  { name: '플레임 버스트 대미지', verb: '증가', max: 450, unit: '%' },
  { name: '하이드로 피어스 최대 대미지 배율', verb: '증가', max: 1100, unit: '%' },
  { name: '트라이 어설트 피니시 대미지', verb: '증가', max: 1500, unit: '%' },
  // 세이크리드 가드
  {
    name: '희생의 응징 : 성찰의 흔적 적용 중 세이크리드 가드 스킬 대미지',
    verb: '증가',
    max: 5,
    unit: '%',
  },
  { name: '심판의 일격 대미지', verb: '증가', max: 1000, unit: '%' },
  { name: '고결한 서약 매초 희생 회복량', verb: '증가', max: 0.5, unit: '' },
  // 블래스트 랜서
  { name: '임팩트 크러시 대미지', verb: '증가', max: 500, unit: '%' },
  { name: '오버 드라이브 폭발 공격 대미지', verb: '증가', max: 700, unit: '%' },
  { name: '어나이얼레이션 대폭발 과열 계수', verb: '증가', max: 3, unit: '' },
  // 배리어블 거너
  { name: '헤비 아틸러리 대미지', verb: '증가', max: 300, unit: '%' },
  { name: '데바스테이션 캐논 대미지', verb: '증가', max: 400, unit: '%' },
  { name: '페이탈 스코프 대미지', verb: '증가', max: 400, unit: '%' },
  // 포비든 알케미스트
  { name: '케미컬 카니발 대미지', verb: '증가', max: 300, unit: '%' },
  { name: '스파이럴 이럽션 대미지', verb: '증가', max: 200, unit: '%' },
  {
    name: '서먼 나이트메어 속성 에너지 4개 소모 추가 대미지 배율',
    verb: '증가',
    max: 50,
    unit: '%',
  },
  // 퓨리 파이터
  { name: '익시드 : 체인 블로우 피니시 대미지', verb: '증가', max: 300, unit: '%' },
  { name: '익시드 : 임팩트 다이브 대미지', verb: '증가', max: 200, unit: '%' },
  { name: '익시드 : 포스 슬램 대미지', verb: '증가', max: 1000, unit: '%' },
  // 멜로딕 퍼피티어
  { name: '인터루드 슬래시의 4막: 질투의 화신 대미지 배율', verb: '증가', max: 20, unit: '%' },
  { name: '다운비트 악센트 캐릭터 대미지', verb: '추가', max: 700, unit: '%' },
  {
    name: '그랜드 피날레 에코 마리오네트 공격에 캐릭터 대미지',
    verb: '추가',
    max: 1500,
    unit: '%',
  },
];

/** 나올 수 있는 결과 수. 옵션 수 x 10레벨. */
export const RELIC_OUTCOMES = MURIAS_RELIC_POOL.length * RELIC_LEVELS.length;

export interface RelicDraw {
  /** 몇 번째 복원인지. 1부터. 표의 키로도 쓴다. */
  no: number;
  option: RelicPoolEntry;
  level: number;
}

/** [0, 1) 난수. 테스트에서 바꿔 끼운다. */
export type RandomSource = () => number;

const pick = (length: number, random: RandomSource) =>
  Math.min(length - 1, Math.floor(random() * length));

/** 한 번 복원한다. 옵션을 고르고 레벨을 따로 고른다. 둘 다 고르게 나온다. */
export function drawRelic(no: number, random: RandomSource = Math.random): RelicDraw {
  const option = MURIAS_RELIC_POOL[pick(MURIAS_RELIC_POOL.length, random)];
  const level = RELIC_LEVELS[pick(RELIC_LEVELS.length, random)];
  return { no, option, level };
}

/** 지금 시세로 친 결과 하나의 값. */
export interface DrawPrice {
  price: number;
  /** 지금 매물의 최저가인지, 매물이 없어 최종 거래가를 쓴 것인지. */
  source: 'listing' | 'trade';
}

/**
 * 결과 하나의 값. 그 옵션 그 레벨의 지금 최저가, 매물이 없으면 최종 거래가다. 둘 다 없으면 null.
 * 본전 확률(prices.ts 의 ideaOdds)과 같은 규칙이라 두 화면의 숫자가 같은 뜻이다.
 */
export function drawPrice(
  draw: Pick<RelicDraw, 'option' | 'level'>,
  prices: Pick<RelicPrices, 'listed' | 'lastTrades'>,
): DrawPrice | null {
  const key = rowKeyOf(draw.option);
  const listed = prices.listed.get(key)?.[draw.level - 1];
  if (listed != null) return { price: listed, source: 'listing' };
  const trade = prices.lastTrades.get(key)?.[draw.level - 1];
  return trade ? { price: trade.price, source: 'trade' } : null;
}

export interface RelicSimulator {
  /** 지금까지 나온 것. 먼저 나온 것이 앞이다. */
  draws: RelicDraw[];
  /** 마지막으로 누른 단추가 몇 번 복원했는지. 끝에서 이만큼이 "방금 나온 것" 이다. */
  lastBatch: number;
  draw: (times: number) => void;
  reset: () => void;
}

/**
 * 복원 기록. 새로 고치거나 화면을 떠나면 처음부터다. 저장할 까닭이 없는 놀이 기록이라
 * 브라우저에 남기지 않는다.
 */
export function useRelicSimulator(random?: RandomSource): RelicSimulator {
  const [state, setState] = useState<{ draws: RelicDraw[]; lastBatch: number }>({
    draws: [],
    lastBatch: 0,
  });
  const draw = useCallback(
    (times: number) =>
      setState((prev) => {
        const added = Array.from({ length: times }, (_, index) =>
          // 난수는 뽑을 때 찾는다. 처음 그릴 때의 Math.random 을 붙잡아 두지 않는다.
          drawRelic(prev.draws.length + index + 1, random ?? Math.random),
        );
        return { draws: [...prev.draws, ...added], lastBatch: times };
      }),
    [random],
  );
  const reset = useCallback(() => setState({ draws: [], lastBatch: 0 }), []);
  return { ...state, draw, reset };
}
