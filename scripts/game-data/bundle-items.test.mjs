import { describe, expect, it } from 'vitest';
import {
  cleanDescription,
  featureHolds,
  hiddenReason,
  isHiddenItem,
  koreaDescription,
} from './bundle-items.mjs';

const variant = (description, conditions = []) => ({ description, conditions });

describe('koreaDescription', () => {
  const enabled = new Map([
    ['gfOn', true],
    ['gfLater', true],
    ['gfOff', false],
  ]);

  it('조건 없이 정해진 설명이 있으면 그것이다', () => {
    expect(
      koreaDescription(
        { description: '기본', variants: [variant('다른', [['locale', 'korea']])] },
        enabled,
      ),
    ).toBe('기본');
  });

  it('한국 전용 설명이 순서와 상관없이 먼저다', () => {
    const entity = {
      description: '',
      variants: [variant('한국', [['locale', 'korea']]), variant('일반')],
    };
    expect(koreaDescription(entity, enabled)).toBe('한국');
  });

  it('켜진 기능의 설명 가운데 원본에서 나중에 나온 것이 이긴다', () => {
    const entity = {
      description: '',
      variants: [
        variant('기본'),
        variant('먼저', [['feature', 'gfOn']]),
        variant('나중', [['feature', 'gfLater']]),
      ],
    };
    expect(koreaDescription(entity, enabled)).toBe('나중');
  });

  it('꺼진 기능이나 다른 지역의 설명은 쓰지 않는다', () => {
    const entity = {
      description: '',
      variants: [
        variant('기본'),
        variant('꺼짐', [['feature', 'gfOff']]),
        variant('유럽', [['locale', 'europe']]),
      ],
    };
    expect(koreaDescription(entity, enabled)).toBe('기본');
  });
});

describe('cleanDescription', () => {
  it('게임 표기를 읽을 수 있게 바꾼다', () => {
    expect(
      cleanDescription('첫 줄\\n<color=1>둘째</color> 줄 <hotkey name="x"/> 네반&&마하 {0}'),
    ).toBe('첫 줄\n둘째 줄 [단축키] 네반&마하 …');
    expect(cleanDescription('보석이다.\\빛을 투과시켰을 때')).toBe('보석이다.\n빛을 투과시켰을 때');
  });
});

describe('isHiddenItem', () => {
  it('플레이어가 볼 수 없는 아이템을 가린다', () => {
    expect(isHiddenItem('clancow basic armor', 'clancow basic armor')).toBe(true);
    expect(isHiddenItem('NPC 피네의 갑옷', '피네의 갑옷')).toBe(true);
    expect(isHiddenItem('베어 너클 (몬스터 전용)', '곰의 주먹')).toBe(true);
    expect(isHiddenItem('사용안함', '(임시)')).toBe(true);
    expect(isHiddenItem('아이데른장갑(착용, 배포금지)', '임시설명')).toBe(true);
    expect(isHiddenItem('노란 산타 복장', '노란 산타 복장')).toBe(true);
    expect(isHiddenItem('다크 스켈레톤 부츠', '(유저배포금지)')).toBe(true);
    expect(isHiddenItem('보우(몬스터용, 유저 배포 불가)', '손잡이에 가죽을 덧댄 롱보우.')).toBe(
      true,
    );
  });

  it('숨기는 이유를 나눠 적는다', () => {
    expect(hiddenReason('clancow basic armor', 'clancow basic armor')).toBe('영어 내부 이름');
    expect(hiddenReason('NPC 피네의 갑옷', '피네의 갑옷')).toBe('NPC 장비');
    expect(hiddenReason('다크 스켈레톤 부츠', '(유저배포금지)')).toBe('배포 금지');
    expect(hiddenReason('사용안함', '(임시)')).toBe('사용 안 함');
    expect(hiddenReason('횃불', '횃불')).toBe('설명이 이름과 같음');
    expect(hiddenReason('알렉산드라이트', '빛에 따라 다른 색을 보이는 보석이다.')).toBeNull();
  });

  it('보통 아이템은 그대로 둔다', () => {
    expect(isHiddenItem('중급 나무장작(아르바이트용)', '잘 타는 목재만 선별하여 만든 장작.')).toBe(
      false,
    );
    expect(
      isHiddenItem('생명력과 해독의 크리스탈 (R.100)', '생명력 100을 회복할 수 있는 크리스탈.'),
    ).toBe(false);
  });
});

describe('featureHolds', () => {
  const enabled = new Map([
    ['gfA', true],
    ['gfB', false],
  ]);

  it('기능 하나, 부정, 엮은 조건을 푼다', () => {
    expect(featureHolds('gfA', enabled)).toBe(true);
    expect(featureHolds('!gfB', enabled)).toBe(true);
    expect(featureHolds('gfA&gfB', enabled)).toBe(false);
    expect(featureHolds('gfA & !gfB', enabled)).toBe(true);
    expect(featureHolds('gfB|gfA', enabled)).toBe(true);
    expect(featureHolds('!(gfA|gfB)', enabled)).toBe(false);
  });

  it('모르는 기능은 꺼진 것이다', () => {
    expect(featureHolds('gfUnknown', enabled)).toBe(false);
  });
});
