import { Link } from 'react-router-dom';
import { Flex, List, Tag, Typography, theme } from 'antd';
import {
  formatNewsDate,
  formatNewsDateTime,
  newsPostPath,
  type NewsPost,
} from '@/features/news/api';

const { Text } = Typography;

/** 글 제목 옆의 상태 표시. 고친 횟수와 지워짐. */
export function NewsPostTags({ post }: { post: NewsPost }) {
  return (
    <>
      {post.revisions > 1 ? (
        <Tag
          variant="filled"
          color="warning"
          style={{ marginInlineEnd: 0 }}
          title={post.editedAt ? `${formatNewsDateTime(post.editedAt)} 고침` : undefined}
        >
          고침 {post.revisions - 1}
        </Tag>
      ) : null}
      {post.deletedAt ? (
        <Tag variant="filled" color="error" style={{ marginInlineEnd: 0 }}>
          지워짐
        </Tag>
      ) : null}
    </>
  );
}

/** 분류 배지의 최소 폭. 12px 글자로 "개발자 노트" 가 드는 폭. */
const CATEGORY_WIDTH = 72;

/**
 * 새소식 목록. 넓은 화면은 분류, 제목, 날짜를 한 줄에, 좁은 화면은 제목 아래로 분류와 날짜를 내린다.
 * 제목은 링크지만 줄마다 보라색이 늘어서면 목록이 시끄러워 본문 글자색으로 둔다. 밑줄은 hover 와 포커스에서 antd 가 그린다.
 */
/** compact 면 줄 위아래 여백을 줄인다(첫 화면의 새소식 블록). */
export function NewsPostList({
  posts,
  wide,
  compact = false,
}: {
  posts: NewsPost[];
  wide: boolean;
  compact?: boolean;
}) {
  const { token } = theme.useToken();

  return (
    <List
      dataSource={posts}
      rowKey="id"
      split
      renderItem={(post) => {
        // 넓은 화면에서는 분류 칸 폭을 가장 긴 "개발자 노트" 에 맞춰 제목이 같은 자리에서 시작하게 한다.
        const category = (
          <Tag
            variant="filled"
            style={{
              marginInlineEnd: 0,
              flex: 'none',
              ...(wide ? { minWidth: CATEGORY_WIDTH, textAlign: 'center' as const } : null),
            }}
          >
            {post.category}
          </Tag>
        );
        const title = (
          <Link to={newsPostPath(post.id)} style={{ color: token.colorText, minWidth: 0 }}>
            {post.title}
          </Link>
        );
        const date = (
          <Text type="secondary" className="tnum" style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
            {formatNewsDate(post.postedAt)}
          </Text>
        );
        return (
          <List.Item
            style={{ paddingInline: 0, paddingBlock: compact ? 7 : undefined, display: 'block' }}
          >
            {wide ? (
              <Flex align="center" gap={12}>
                {category}
                <Flex align="center" gap={8} wrap style={{ flex: 1, minWidth: 0 }}>
                  {title}
                  <NewsPostTags post={post} />
                </Flex>
                {date}
              </Flex>
            ) : (
              <Flex vertical gap={4}>
                {title}
                <Flex align="center" gap={8} wrap>
                  {category}
                  {date}
                  <NewsPostTags post={post} />
                </Flex>
              </Flex>
            )}
          </List.Item>
        );
      }}
    />
  );
}
