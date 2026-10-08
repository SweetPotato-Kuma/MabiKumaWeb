import { useMemo } from 'react';
import { Flex, Typography, theme } from 'antd';
import {
  diffLines,
  diffRows,
  htmlToLines,
  type DiffRow,
  type WordPiece,
} from '@/features/news/diff';
import type { NewsRevision } from '@/features/news/api';

const { Text } = Typography;

/** 비교할 줄. 제목도 한 줄로 넣어 제목만 고친 판도 잡히게 한다. */
const linesOf = (revision: NewsRevision) => [
  `제목: ${revision.title}`,
  ...htmlToLines(revision.body),
];

/**
 * 앞 판과 이 판의 글 비교. 지운 줄은 "-" 와 지움 색, 더한 줄은 "+" 와 더함 색이다. 색만으로 가르지 않게 부호를 붙이고,
 * 줄 안에서 바뀐 낱말은 더 진한 색으로 다시 칠한다(지운 낱말은 취소선도 긋는다).
 */
export function NewsDiff({ before, after }: { before: NewsRevision; after: NewsRevision }) {
  const { token } = theme.useToken();
  const rows = useMemo(() => diffRows(diffLines(linesOf(before), linesOf(after))), [before, after]);
  const changed = rows.some((row) => row.kind === 'del' || row.kind === 'add');

  if (!changed) {
    return <Text type="secondary">글은 같고 꾸밈만 바뀌었습니다.</Text>;
  }

  const tone = {
    del: { background: token.colorErrorBg, strong: token.colorErrorBorder, sign: '-' },
    add: { background: token.colorSuccessBg, strong: token.colorSuccessBorder, sign: '+' },
  } as const;

  const pieces = (row: Extract<DiffRow, { kind: 'del' | 'add' }>, list: WordPiece[]) =>
    list.map((piece, index) =>
      piece.changed ? (
        row.kind === 'del' ? (
          <del key={index} style={{ background: tone.del.strong, borderRadius: 4 }}>
            {piece.text}
          </del>
        ) : (
          <ins
            key={index}
            style={{ background: tone.add.strong, borderRadius: 4, textDecoration: 'none' }}
          >
            {piece.text}
          </ins>
        )
      ) : (
        <span key={index}>{piece.text}</span>
      ),
    );

  return (
    <Flex vertical gap={2} role="list" aria-label="바뀐 곳" style={{ lineHeight: 1.7 }}>
      {rows.map((row, index) => {
        if (row.kind === 'skip') {
          return (
            <Text
              key={index}
              type="secondary"
              role="listitem"
              style={{ fontSize: 13, paddingBlock: 4 }}
            >
              같은 줄 {row.count}개
            </Text>
          );
        }
        if (row.kind === 'same') {
          return (
            <Flex key={index} gap={8} role="listitem" style={{ paddingInline: 8 }}>
              <span aria-hidden="true" style={{ width: '1ch', flex: 'none' }} />
              <span>{row.text}</span>
            </Flex>
          );
        }
        const { background, sign } = tone[row.kind];
        return (
          <Flex
            key={index}
            gap={8}
            role="listitem"
            aria-label={row.kind === 'del' ? '지운 줄' : '더한 줄'}
            style={{ background, borderRadius: token.borderRadiusSM, paddingInline: 8 }}
          >
            <span aria-hidden="true" style={{ width: '1ch', flex: 'none', fontWeight: 600 }}>
              {sign}
            </span>
            <span>{row.pieces ? pieces(row, row.pieces) : row.text}</span>
          </Flex>
        );
      })}
    </Flex>
  );
}
