import type { ReactNode } from 'react';
import { Checkbox, Flex, InputNumber, Typography } from 'antd';
import {
  COLOR_CHANNEL_KEYS,
  COLOR_CHANNEL_MAX,
  colorChannelBounds,
  describeColorRange,
  type ColorChannel,
  type ColorChannelKey,
  type ColorChannels,
} from '@/features/colorChannels';

const { Text } = Typography;

const CHANNEL_NAMES: Record<ColorChannelKey, string> = { r: 'R', g: 'G', b: 'B' };

const FIELD_STYLE = { flex: '1 1 0', minWidth: 0 } as const;

/**
 * 범위와 유사도를 오갈 때 값을 이어 준다. 범위에서 유사도로 가면 범위의 가운데를 기준값으로 두고,
 * 유사도에서 범위로 가면 지금 받아들이는 범위를 그대로 옮긴다. 켰다 껐다 해도 조건이 달라지지 않는다.
 */
function switchMode(channel: ColorChannel, similar: boolean): ColorChannel {
  if (similar === channel.similar) return channel;
  const bounds = colorChannelBounds(channel);
  if (similar) {
    const base = bounds ? Math.round((bounds.low + bounds.high) / 2) : null;
    return { ...channel, similar, base: channel.base ?? base };
  }
  return bounds
    ? { ...channel, similar, min: Math.round(bounds.low), max: Math.round(bounds.high) }
    : { ...channel, similar };
}

/**
 * 색의 R, G, B 를 채널마다 따로 거는 입력. 채널마다 "최소 ~ 최대" 범위이거나, 유사도를 켜서
 * "기준값 ± 오차%" 로 건다. 오차%는 채널 전체 폭(0~255)에 대한 것이고, 그렇게 받아들이는 범위를
 * 숫자로 바로 보여 준다. 아무 칸도 채우지 않은 채널은 걸지 않은 것이다.
 *
 * 경매장 상세 검색과 튼튼한 주머니 찾기가 같은 입력을 쓰도록 채널 입력만 따로 두었다.
 */
export function ColorChannelFields({
  channels,
  onChange,
  disabled = false,
}: {
  channels: ColorChannels;
  onChange: (key: ColorChannelKey, next: ColorChannel) => void;
  /** 쓰지 않는 조건이라 고칠 수 없게 둔다. 값은 그대로 남는다. */
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        gap: 6,
        alignItems: 'center',
      }}
    >
      {COLOR_CHANNEL_KEYS.map((key) => {
        const channel = channels[key];
        const name = CHANNEL_NAMES[key];
        const update = (changes: Partial<ColorChannel>) => onChange(key, { ...channel, ...changes });
        return (
          <ChannelRow
            key={key}
            name={name}
            range={channel.similar ? describeColorRange(channel) : ''}
            input={
              channel.similar ? (
                <Flex gap={6} align="center">
                  <InputNumber
                    value={channel.base}
                    onChange={(base) => update({ base })}
                    min={0}
                    max={COLOR_CHANNEL_MAX}
                    precision={0}
                    controls={false}
                    placeholder="기준값"
                    aria-label={`${name} 기준값`}
                    disabled={disabled}
                    style={FIELD_STYLE}
                  />
                  <span aria-hidden>±</span>
                  <InputNumber
                    value={channel.percent}
                    onChange={(percent) => update({ percent: percent ?? 0 })}
                    min={0}
                    max={100}
                    precision={0}
                    controls={false}
                    suffix="%"
                    aria-label={`${name} 오차`}
                    disabled={disabled}
                    style={FIELD_STYLE}
                  />
                </Flex>
              ) : (
                <Flex gap={6} align="center">
                  <InputNumber
                    value={channel.min}
                    onChange={(min) => update({ min })}
                    min={0}
                    max={COLOR_CHANNEL_MAX}
                    precision={0}
                    controls={false}
                    placeholder="최소"
                    aria-label={`${name} 최소`}
                    disabled={disabled}
                    style={FIELD_STYLE}
                  />
                  <span aria-hidden>~</span>
                  <InputNumber
                    value={channel.max}
                    onChange={(max) => update({ max })}
                    min={0}
                    max={COLOR_CHANNEL_MAX}
                    precision={0}
                    controls={false}
                    placeholder="최대"
                    aria-label={`${name} 최대`}
                    disabled={disabled}
                    style={FIELD_STYLE}
                  />
                </Flex>
              )
            }
            check={
              <Checkbox
                checked={channel.similar}
                onChange={(event) => onChange(key, switchMode(channel, event.target.checked))}
                disabled={disabled}
                aria-label={`${name} 유사도`}
              >
                유사도
              </Checkbox>
            }
          />
        );
      })}
    </div>
  );
}

/** 한 채널의 줄. 이름, 입력, 유사도 체크가 한 줄이고, 유사도일 때는 받아들이는 범위가 그 아래에 붙는다. */
function ChannelRow({
  name,
  range,
  input,
  check,
}: {
  name: string;
  range: string;
  input: ReactNode;
  check: ReactNode;
}) {
  return (
    <>
      <Text strong>{name}</Text>
      {input}
      {check}
      {range ? (
        <>
          <span />
          <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
            {range}
          </Text>
          <span />
        </>
      ) : null}
    </>
  );
}
