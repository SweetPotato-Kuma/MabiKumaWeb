import type { ReactNode } from 'react';
import { Empty } from 'antd';
import emptyBear from '@/assets/empty-bear.png';

/** 그림 원본의 가로세로 비. 너비와 높이를 미리 적어 두어 그림이 늦게 떠도 글이 밀리지 않게 한다. */
const RATIO = 279 / 240;

/** 카드 한 장을 채우는 빈 화면과, 모달이나 패널 안에서 한 줄을 대신하는 빈 칸. */
const HEIGHT = { default: 120, small: 72 } as const;

interface EmptyStateProps {
  description: ReactNode;
  size?: keyof typeof HEIGHT;
}

/**
 * 보여 줄 데이터가 없을 때 쓰는 빈 상태. antd Empty 에 곰 그림만 바꿔 끼운다.
 * 무엇을 하면 채워지는지는 description 에 한 줄로 적는다.
 */
export function EmptyState({ description, size = 'default' }: EmptyStateProps) {
  const height = HEIGHT[size];
  return (
    <Empty
      image={<img src={emptyBear} alt="" width={Math.round(height * RATIO)} height={height} />}
      styles={{ image: { height } }}
      description={description}
    />
  );
}
