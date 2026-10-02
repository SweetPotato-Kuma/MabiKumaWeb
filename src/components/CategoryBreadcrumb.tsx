import { Fragment } from 'react';
import { Flex, Tag, theme } from 'antd';
import { ChevronRightIcon } from '@/components/icons';
import { categoryPath } from '@/features/auction/categoryTree';

/**
 * 고른 카테고리까지 거쳐 온 길(전체 > 원거리 장비 > 활)을 배지로 보인다.
 * 위쪽 배지를 누르면 그 단계로 올라가 찾는다. 마지막 배지가 지금 고른 카테고리다.
 */
export function CategoryBreadcrumb({
  category,
  onSelect,
}: {
  category: string;
  onSelect: (category: string) => void;
}) {
  const { token } = theme.useToken();
  const path = categoryPath(category);
  if (path.length === 0) return null;

  return (
    <Flex gap={2} wrap align="center" role="navigation" aria-label="카테고리 경로">
      {path.map((crumb, index) => {
        const current = index === path.length - 1;
        return (
          <Fragment key={crumb.value || 'all'}>
            {index > 0 ? <ChevronRightIcon style={{ color: token.colorTextTertiary }} /> : null}
            <Tag
              className="no-select"
              role={current ? undefined : 'button'}
              tabIndex={current ? undefined : 0}
              aria-current={current ? 'true' : undefined}
              onClick={current ? undefined : () => onSelect(crumb.value)}
              onKeyDown={
                current
                  ? undefined
                  : (event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      onSelect(crumb.value);
                    }
              }
              style={{
                marginInlineEnd: 0,
                cursor: current ? 'default' : 'pointer',
                ...(current ? { color: token.colorPrimary, borderColor: token.colorPrimary, fontWeight: 600 } : {}),
              }}
            >
              {crumb.label}
            </Tag>
          </Fragment>
        );
      })}
    </Flex>
  );
}
