import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, Flex, Image, Typography, theme } from 'antd';
import { newsPostPath } from '@/features/news/api';
import { useItemPreview } from '@/features/news/preview';

const { Text } = Typography;

/**
 * 미리보기의 가장 큰 높이. 의장은 상세 맨 위에 두므로 아래 능력치와 시뮬레이터를 너무 밀어내지 않게 줄인다.
 * 그림은 눌러서 원래 크기로 본다.
 */
const MAX_HEIGHT = 360;

/** 공식 그림은 아래 13% 를 이름 띠 자리로 비워 둔다(공식 갤러리가 그 위에 이름을 얹는다). */
const CAPTION_HEIGHT = '13%';

/**
 * 아이템 상세의 공식 미리보기. 키트나 이벤트 글에 올라온 그림이나 영상이 있는 아이템에만 보이고, 없으면 아무것도
 * 그리지 않는다(대부분의 아이템). 받는 동안과 못 받았을 때도 자리를 만들지 않는다.
 * 영상은 6MB 안팎이라 자동으로 재생하지 않고 누르면 재생한다.
 */
export function ItemPreview({ name }: { name: string }) {
  const { token } = theme.useToken();
  const query = useItemPreview(name);
  const [broken, setBroken] = useState(false);
  const preview = query.data;
  if (!preview || broken) return null;

  return (
    <Card title="공식 미리보기" size="small">
      <Flex vertical gap={12} align="flex-start">
        {preview.kind === 'video' ? (
          <video
            src={preview.url}
            aria-label={`${preview.name} 공식 미리보기 영상`}
            controls
            loop
            muted
            playsInline
            preload="metadata"
            onError={() => setBroken(true)}
            style={{ display: 'block', maxWidth: '100%', maxHeight: MAX_HEIGHT }}
          />
        ) : (
          <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
            <Image
              src={preview.url}
              alt={`${preview.name} 공식 미리보기`}
              onError={() => setBroken(true)}
              style={{ display: 'block', maxWidth: '100%', maxHeight: MAX_HEIGHT, width: 'auto' }}
            />
            {/* 그림 위에 얹은 이름이라 누름은 그림으로 통과시킨다. 눌러 크게 보면 원본 그대로다. */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 'auto 0 0 0',
                height: CAPTION_HEIGHT,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 12px',
                color: token.colorTextLightSolid,
                fontSize: 14,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                pointerEvents: 'none',
              }}
            >
              {preview.name}
            </span>
          </div>
        )}
        <Text type="secondary" style={{ fontSize: 13 }}>
          <Link to={newsPostPath(preview.postId)}>{preview.title}</Link>
        </Text>
      </Flex>
    </Card>
  );
}
