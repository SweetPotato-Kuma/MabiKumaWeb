import { feeCalculator } from './fee';
import type { CalculatorEntry, PageCalculatorDef } from './schema';

const taltinFarmCalculator: PageCalculatorDef = {
  id: 'taltin-farm',
  title: '탈틴 농장',
  summary: '생활 협회 주문 납품, 마법의 솥 가공, 두카트 환전 가운데 어느 쪽이 남는지 경매장 시세로 비교합니다.',
  load: async () => ({ default: (await import('@/pages/TaltinFarmPage')).TaltinFarmPage }),
};

/**
 * 계산기 목록. 새 계산기는 스키마와 계산 함수를 적은 정의 하나를 여기에 더하면 된다. 목록 화면, 메뉴, 전체 검색(Ctrl K),
 * 검색엔진용 화면 목록(pageMeta.json)이 이 목록을 읽는다. 표 여러 장처럼 스키마에 담기지 않으면 화면을 직접 넘긴다.
 */
export const CALCULATORS: readonly CalculatorEntry[] = [feeCalculator, taltinFarmCalculator];

/**
 * 계산기 한 화면의 경로. 경로는 빌드가 화면마다 HTML 파일로 굽는 이름이라 한 단계로 둔다(/fee-calculator).
 * 목록은 /calculators 다.
 */
export const calculatorPath = (id: string) => `/${id}-calculator`;

export function calculatorOf(id: string | undefined): CalculatorEntry | undefined {
  return CALCULATORS.find((calculator) => calculator.id === id);
}
