import { describe, expect, it } from 'vitest';
import { groupByArcana, skillOfOption, type Arcana } from './arcana';
import { summarizeMurias } from './prices';

const ARCANAS: Arcana[] = [
  {
    id: 6,
    name: '블래스트 랜서',
    awakening: 59107,
    skills: [
      { id: 59102, name: '임팩트 크러시' },
      { id: 59105, name: '오버 드라이브' },
    ],
  },
  {
    id: 10,
    name: '퓨리 파이터',
    awakening: 59189,
    skills: [
      { id: 59180, name: '익시드 : 체인 블로우' },
      { id: 59182, name: '익시드 : 포스 슬램' },
    ],
  },
];

const murias = (value: string, price: number) => ({
  item_name: '무리아스의 유물',
  auction_price_per_unit: price,
  item_option: [{ option_type: '무리아스 유물', option_value: value }],
});

describe('skillOfOption', () => {
  it('옵션 이름 앞의 스킬로 아르카나를 찾는다', () => {
    expect(skillOfOption('오버 드라이브 폭발 공격 대미지', ARCANAS)?.arcana.name).toBe(
      '블래스트 랜서',
    );
    expect(skillOfOption('익시드:포스 슬램 대미지', ARCANAS)?.skill.id).toBe(59182);
    expect(skillOfOption('새로운 스킬 대미지', ARCANAS)).toBeNull();
  });
});

describe('groupByArcana', () => {
  it('아르카나 번호 순서로, 안에서는 스킬 순서로 두고 못 찾은 옵션은 맨 뒤에 모은다', () => {
    const { rows } = summarizeMurias([
      murias('익시드 : 포스 슬램 대미지 700% 증가 (최대 1000%)', 1),
      murias('오버 드라이브 폭발 공격 대미지 490% 증가 (최대 700%)', 2),
      murias('오버 드라이브 폭발 공격 대미지 700% 증가 (최대 700%)', 3),
      murias('임팩트 크러시 대미지 450% 증가 (최대 500%)', 4),
      murias('새로운 스킬 대미지 10% 증가 (최대 100%)', 5),
    ]);
    const groups = groupByArcana(rows, ARCANAS);
    expect(groups.map((group) => group.arcana?.name ?? null)).toEqual([
      '블래스트 랜서',
      '퓨리 파이터',
      null,
    ]);
    expect(groups[0].options.map((option) => option.row.name)).toEqual([
      '임팩트 크러시 대미지',
      '오버 드라이브 폭발 공격 대미지',
    ]);
    expect(groups[0].count).toBe(3);
    expect(groups[2].options[0].skill).toBeNull();
  });
});
