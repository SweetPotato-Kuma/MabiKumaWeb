import { Descriptions, Empty, Flex, Modal, Statistic, Tag, Tooltip, Typography, theme } from 'antd';
import {
  colorPartLabel,
  formatOptionValue,
  groupItemOptions,
  parseRgb,
  rgbToCss,
  splitEffects,
  type OptionGroup,
} from '@/features/auction/itemOptions';
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

/** 라벨이 두 줄로 접히면 표가 들쭉날쭉해진다. 라벨 칸은 넓게 잡고 줄바꿈을 막는다. */
const LABEL_STYLE = { width: 148, whiteSpace: 'nowrap' } as const;

function optionLabel(option: ItemOption): string {
  if (!option.option_sub_type) return option.option_type;
  return `${option.option_type} ${option.option_sub_type}`;
}

/**
 * 옵션 한 칸의 값.
 *
 * 설명이 붙어 있으면 쉼표로 이어진 효과를 줄 단위로 끊는다. 한 줄로 두면 읽을 수 없고,
 * 그렇다고 모두 펼치면 줄이 늘어나므로 값과 설명의 크기를 분명히 갈라 둔다.
 */
function OptionValue({ option }: { option: ItemOption }) {
  const effects = splitEffects(option.option_desc);

  return (
    <Flex vertical gap={effects.length > 0 ? 4 : 0}>
      <span className="tnum">{formatOptionValue(option)}</span>
      {effects.length > 0 ? (
        <Flex vertical gap={2} component="ul" style={{ margin: 0, paddingInlineStart: 16 }}>
          {effects.map((effect, index) => (
            <li key={index}>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {effect}
              </Text>
            </li>
          ))}
        </Flex>
      ) : null}
    </Flex>
  );
}

/**
 * 아이템 보호.
 *
 * 값이 "인챈트 실패" 처럼 오는데, 이건 아이템이 그 상태라는 뜻이 아니라 그 상황에서
 * 아이템을 지켜 준다는 뜻으로 읽힌다. 표의 한 칸에 "아이템 보호 | 인챈트 실패" 로
 * 두면 상태처럼 읽히므로 문장으로 풀어 둔다. 넥슨 스펙에 정의된 문구가 아니라
 * 게임 안의 뜻을 따른 해석이다.
 */
function ProtectionTags({ protections }: { protections: ItemOption[] }) {
  return (
    <Flex vertical gap={6}>
      <Text strong style={{ fontSize: 13 }}>
        아이템 보호
      </Text>
      <Flex gap={8} wrap>
        {protections.map((protection, index) => (
          <Tag key={`${protection.option_type}-${index}`} color="success" style={{ marginInlineEnd: 0 }}>
            {formatOptionValue(protection)} 시 보호
          </Tag>
        ))}
      </Flex>
      <Text type="secondary" style={{ fontSize: 12 }}>
        적힌 상황에서 아이템을 지켜 줍니다. 아이템이 그 상태라는 뜻이 아닙니다.
      </Text>
    </Flex>
  );
}

/** 색상 다섯 줄은 한 줄로 모은다. 숫자 셋보다 칠해진 네모가 빠르다. */
function ColorSwatches({ colors }: { colors: ItemOption[] }) {
  const { token } = theme.useToken();

  return (
    <Flex gap={12} wrap>
      {colors.map((color, index) => {
        const value = formatOptionValue(color);
        const rgb = parseRgb(color.option_value);

        return (
          <Flex key={`${color.option_type}-${index}`} vertical align="center" gap={4}>
            {rgb ? (
              <Tooltip title={value}>
                <span
                  aria-label={`${color.option_type} ${value}`}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: token.borderRadius,
                    background: rgbToCss(rgb),
                    // 흰색 계열이면 배경에 묻힌다. 테두리로 경계를 남긴다.
                    border: `1px solid ${token.colorBorder}`,
                    display: 'block',
                  }}
                />
              </Tooltip>
            ) : (
              <Text className="tnum" style={{ fontSize: 12 }}>
                {value}
              </Text>
            )}
            <Text type="secondary" style={{ fontSize: 11 }}>
              {colorPartLabel(color)}
            </Text>
          </Flex>
        );
      })}
    </Flex>
  );
}

function OptionGroupTable({ group }: { group: OptionGroup }) {
  return (
    <Flex vertical gap={6}>
      <Text strong style={{ fontSize: 13 }}>
        {group.title}
      </Text>
      <Descriptions
        // 값이 짧은 묶음은 두 칸으로 놓아 줄 수를 절반으로 줄인다.
        column={group.dense ? 2 : 1}
        size="small"
        bordered
        styles={{ label: LABEL_STYLE }}
        items={group.options.map((option, index) => ({
          key: `${option.option_type}-${option.option_sub_type ?? ''}-${index}`,
          label: optionLabel(option),
          children: <OptionValue option={option} />,
        }))}
      />
    </Flex>
  );
}

export function AuctionItemDetailModal({ detail, onClose }: Props) {
  const { groups, colors, protections } = groupItemOptions(detail?.options);
  const hasOptions = groups.length > 0 || colors.length > 0 || protections.length > 0;

  return (
    <Modal open={detail !== null} onCancel={onClose} footer={null} width={860} title={null} destroyOnHidden>
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

          {/* 이 매물을 살지 말지 가르는 값들. 나머지보다 크게 둔다. */}
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
            <Statistic
              title="수량"
              value={formatNumber(detail.count)}
              styles={{ content: { fontVariantNumeric: 'tabular-nums' } }}
              style={{ flex: '1 1 120px' }}
            />
          </Flex>

          <Descriptions
            column={1}
            size="small"
            bordered
            styles={{ label: LABEL_STYLE }}
            items={[
              {
                key: 'time',
                label: detail.timeLabel,
                children: <span className="tnum">{formatDateTime(detail.timeValue)}</span>,
              },
            ]}
          />

          {hasOptions ? (
            <Flex vertical gap={16}>
              {protections.length > 0 ? <ProtectionTags protections={protections} /> : null}

              {groups.map((group) => (
                <OptionGroupTable key={group.title} group={group} />
              ))}

              {colors.length > 0 ? (
                <Flex vertical gap={8}>
                  <Text strong style={{ fontSize: 13 }}>
                    아이템 색상
                  </Text>
                  <ColorSwatches colors={colors} />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    파트 A 부터 E 까지는 염색이 칠해지는 구역입니다. 어느 구역인지는 아이템마다 달라서 API 가
                    알려 주지 않습니다.
                  </Text>
                </Flex>
              ) : null}
            </Flex>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="이 매물에는 세부 옵션이 없습니다." />
          )}

          <Text type="secondary" style={{ fontSize: 12 }}>
            경매장 API 는 아이템 이미지와 도감 설명을 주지 않습니다. 여기 있는 값이 응답에 담긴 전부입니다.
          </Text>
        </Flex>
      )}
    </Modal>
  );
}
