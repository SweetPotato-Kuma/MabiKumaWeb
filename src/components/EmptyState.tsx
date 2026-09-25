import type { ReactNode } from 'react';
import { Empty } from 'antd';
import emptyBearDark from '@/assets/empty-bear-dark.png';
import emptyBear from '@/assets/empty-bear.png';
import searchBearDark from '@/assets/empty-search-dark.png';
import searchBear from '@/assets/empty-search.png';
import { useResolvedThemeMode } from '@/lib/themePreference';

/**
 * 곰 그림 두 장. 찾아봤는데 없을 때(empty)와, 아직 찾기 전이라 무엇을 넣으라고 안내할 때(search).
 * ratio 는 원본의 가로세로 비다. 너비와 높이를 미리 적어 두어 그림이 늦게 떠도 글이 밀리지 않게 한다.
 *
 * 다크 모드에는 크림색 테두리를 두른 판(dark)을 쓴다. 곰의 짙은 외곽선이 어두운 바탕에 묻혀 윤곽이 흐려진다.
 */
const IMAGES = {
  empty: { src: emptyBear, dark: emptyBearDark, ratio: 279 / 240 },
  search: { src: searchBear, dark: searchBearDark, ratio: 262 / 240 },
} as const;

/** 카드 한 장을 채우는 빈 화면과, 모달이나 패널 안에서 한 줄을 대신하는 빈 칸. */
const HEIGHT = { default: 120, small: 72 } as const;

interface EmptyStateProps {
  description: ReactNode;
  size?: keyof typeof HEIGHT;
  variant?: keyof typeof IMAGES;
}

/**
 * 보여 줄 데이터가 없을 때 쓰는 빈 상태. antd Empty 에 곰 그림만 바꿔 끼운다.
 * 무엇을 하면 채워지는지는 description 에 한 줄로 적는다.
 */
export function EmptyState({ description, size = 'default', variant = 'empty' }: EmptyStateProps) {
  const height = HEIGHT[size];
  const isDark = useResolvedThemeMode() === 'dark';
  const { src, dark, ratio } = IMAGES[variant];
  return (
    <Empty
      image={
        <img src={isDark ? dark : src} alt="" width={Math.round(height * ratio)} height={height} />
      }
      styles={{ image: { height } }}
      description={description}
    />
  );
}
