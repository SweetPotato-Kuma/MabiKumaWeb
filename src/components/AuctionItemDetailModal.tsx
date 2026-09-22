import { Descriptions, Empty, Flex, Modal, Statistic, Tag, Typography } from 'antd';
import type { ItemOption } from '@/features/auction/types';
import { formatDateTime, formatGold, formatNumber, formatRemaining } from '@/lib/format';

const { Text, Title } = Typography;

/**
 * 표의 한 줄을 눌렀을 때 보여 줄 매물 상세.
 *
 * 경매장 매물과 거래 내역은 시각 필드 이름만 다르고 나머지가 같다. 화면 쪽에서
 * 시각의 뜻을 정해 넘기면 이 모달은 한 벌로 둘 다 감당한다.
 */
export interface AuctionItemDetail {
  displayName: string;
  rawName: string;
  category: string;
  count: number;
  pricePerUnit: number;
  options?: ItemOption[];
  /** '만료' 또는 '거래 시각'. 무엇의 시각인지 화면이 정한다. */
  timeLabel: string;
  timeValue: string;
  /** 만료처럼 미래 시각이면 남은 시간을 함께 보여 준다. */
  showRemaining: boolean;
}

interface Props {
  detail: AuctionItemDetail | null;
  onClose: () => void;
}

function optionLabel(option: ItemOption): string {
  if (!option.option_sub_type) return option.option_type;
  return `${option.option_type} ${option.option_sub_type}`;
}

function optionValue(option: ItemOption): string {
  const range = [option.option_value, option.option_value2].filter(Boolean).join(' ~ ');
  return range || '-';
}

export function AuctionItemDetailModal({ detail, onClose }: Props) {
  const options = detail?.options ?? [];

  return (
    <Modal
      open={detail !== null}
      onCancel={onClose}
      footer={null}
      width={560}
      title={null}
      destroyOnHidden
    >
      {detail === null ? null : (
        <Flex vertical gap={20}>
          <Flex vertical gap={4}>
            <Title level={4} style={{ margin: 0 }}>
              {detail.displayName}
            </Title>
            {detail.displayName !== detail.rawName ? (
              <Text type="secondary" style={{ fontSize: 13 }}>
                {detail.rawName}
              </Text>
            ) : null}
            <div>
              <Tag style={{ marginInlineEnd: 0 }}>{detail.category}</Tag>
            </div>
          </Flex>

          {/* 이 매물을 살지 말지 가르는 두 값. 나머지보다 크게 둔다. */}
          <Flex gap={16} wrap>
            <Statistic
              title="개당 가격"
              value={formatGold(detail.pricePerUnit)}
              styles={{ content: { fontVariantNumeric: 'tabular-nums' } }}
              style={{ flex: '1 1 160px' }}
            />
            <Statistic
              title={detail.showRemaining ? '남은 시간' : detail.timeLabel}
              value={detail.showRemaining ? formatRemaining(detail.timeValue) : formatDateTime(detail.timeValue)}
              styles={{ content: { fontVariantNumeric: 'tabular-nums' } }}
              style={{ flex: '1 1 160px' }}
            />
          </Flex>

          <Descriptions
            column={1}
            size="small"
            bordered
            items={[
              { key: 'count', label: '수량', children: <span className="tnum">{formatNumber(detail.count)}</span> },
              {
                key: 'time',
                label: detail.timeLabel,
                children: <span className="tnum">{formatDateTime(detail.timeValue)}</span>,
              },
            ]}
          />

          <Flex vertical gap={8}>
            <Text strong>세부 옵션</Text>
            {options.length === 0 ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="이 매물에는 세부 옵션이 없습니다." />
            ) : (
              <Descriptions
                column={1}
                size="small"
                bordered
                items={options.map((option, index) => ({
                  key: `${option.option_type}-${option.option_sub_type ?? ''}-${index}`,
                  label: optionLabel(option),
                  children: (
                    <Flex vertical gap={2}>
                      <span className="tnum">{optionValue(option)}</span>
                      {option.option_desc ? (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {option.option_desc}
                        </Text>
                      ) : null}
                    </Flex>
                  ),
                }))}
              />
            )}
          </Flex>

          <Text type="secondary" style={{ fontSize: 12 }}>
            경매장 API 는 아이템 이미지와 도감 설명을 주지 않습니다. 여기 있는 값이 응답에 담긴 전부입니다.
          </Text>
        </Flex>
      )}
    </Modal>
  );
}
