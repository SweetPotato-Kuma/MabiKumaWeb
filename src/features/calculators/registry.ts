import { feeCalculator } from './fee';
import type { CalculatorDef } from './schema';

/**
 * 계산기 목록. 새 계산기는 스키마와 계산 함수를 적은 정의 하나를 여기에 더하면 된다. 목록 화면, 메뉴, 전체 검색(Ctrl K),
 * 검색엔진용 화면 목록(pageMeta.json)이 이 목록을 읽는다.
 */
export const CALCULATORS: readonly CalculatorDef[] = [feeCalculator];

/**
 * 계산기 한 화면의 경로. 경로는 빌드가 화면마다 HTML 파일로 굽는 이름이라 한 단계로 둔다(/fee-calculator).
 * 목록은 /calculators 다.
 */
export const calculatorPath = (id: string) => `/${id}-calculator`;

export function calculatorOf(id: string | undefined): CalculatorDef | undefined {
  return CALCULATORS.find((calculator) => calculator.id === id);
}
