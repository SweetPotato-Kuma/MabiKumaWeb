/**
 * 세트 효과 표 파일 검사.
 *
 * 다른 사이트에서 받아 온 게임 데이터 파일을 그대로 읽어 검사한다. 그 사이트가 막거나 형식을 바꾸면 우리 코드와
 * 상관없이 깨지므로, 기본 시험(npm test, 배포와 동기화)에서는 빼고 `npm run test:data` 로 따로 돌린다.
 * 데이터를 우리 쪽으로 옮기면 다시 기본 시험에 넣는다.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { itemSetEffects, type SetEffectData } from './setEffects';

describe('세트 효과 표 파일', () => {
  const data = JSON.parse(
    readFileSync(resolve(process.cwd(), '.cache/game-data/current/set-effects.json'), 'utf8'),
  ) as SetEffectData;

  it('아이템이 가리키는 효과가 모두 정의돼 있다', () => {
    const missing = Object.values(data.items)
      .flat()
      .map(([key]) => key)
      .filter((key) => !data.effects[key]);
    expect(missing).toEqual([]);
  });

  it('효과 이름과 설명에 채우지 못한 자리나 글자 그대로의 줄바꿈이 없다', () => {
    const texts = Object.values(data.effects).flatMap((def) => [def.name, def.desc]);
    expect(texts.filter((text) => /\{\d+\}|\[int:|\\n|not found key/.test(text))).toEqual([]);
  });

  it('제보된 장비의 세트 효과가 들어 있다', () => {
    const effects = itemSetEffects(data, '얼티밋 기아스 데버스테이션 써클릿');
    expect(effects.map((effect) => effect.def.name)).toEqual([
      '연속 공격 발동 확률 증가',
      '급소 관통 지속 시간 증가',
      '쾌속 지속 시간 증가',
    ]);
    expect(effects[0].own).toEqual({ min: 3, max: 5, bonus: [] });
    expect(effects[0].others.map((other) => other.name)).toContain(
      '얼티밋 기아스 데버스테이션 글러브',
    );
  });
});
