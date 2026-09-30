import {
  COLOR_CHANNEL_KEYS,
  COLOR_CHANNEL_MAX,
  colorChannelBounds,
  DEFAULT_COLOR_PERCENT,
  emptyColorChannel,
  emptyColorChannels,
  hasColorChannels,
  type ColorChannel,
  type ColorChannels,
} from '@/features/colorChannels';
import { BAG_NAMES } from './constants';
import { buildBagTree, type BagTreeNode } from './groups';

/**
 * 튼튼한 주머니 찾기의 검색 조건을 주소 쿼리스트링으로 옮기고 되돌린다.
 *
 * 고른 주머니는 `bag` 여러 개다. 서버(`server`)는 서버를 고르는 모든 화면이 함께 쓰므로 useServerParam 이 맡는다. 파트 A, B, C 의 색 조건은 `a`, `b`, `c` 다.
 * 채널마다 `r100-200`(범위, 한쪽만 적어도 된다) 이나 `g120p10`(120 에서 10% 이내) 을 쉼표로 이어
 * 쓴다. 검색 여부는 기본값(파트 A 만 켜짐)과 다를 때만 싣는다. 끈 파트는 `-`, 채널 없이 켠 파트는 `on`
 * 이다. 조건을 건 파트는 켜진 것이라 채널 글자만 있으면 된다. 끈 파트의 채널 값은 싣지 않는다.
 */

/** 파트 하나의 색 조건. 끈 파트는 채널 값이 있어도 쓰지 않는다. */
export interface PartCondition {
  /** 이 파트의 색으로 검색할지. */
  enabled: boolean;
  /** 채널을 하나도 걸지 않았으면 켜 두어도 어떤 색이든 찾는다. */
  channels: ColorChannels;
}

export interface BagSearchConditions {
  /** 트리에서 체크한 칸들. 비어 있으면 모든 주머니. */
  bags: string[];
  /** 파트 A, B, C 의 조건. */
  parts: PartCondition[];
}

/**
 * 처음에는 파트 A 만 켜 둔다. 다만 채널은 모두 비어 있다. 사용자가 채우기 전에 값이 들어 있으면 안 된다.
 * 파트 B, C 는 없는 주머니도 많아서 꺼 둔다.
 */
export const defaultParts = (): PartCondition[] => [
  { enabled: true, channels: emptyColorChannels() },
  { enabled: false, channels: emptyColorChannels() },
  { enabled: false, channels: emptyColorChannels() },
];

const DEFAULT_ENABLED = [true, false, false] as const;
const DISABLED = '-';
const ENABLED_EMPTY = 'on';

const PART_KEYS = ['a', 'b', 'c'] as const;

/** 주머니 하나의 이름이 이 길이를 넘을 수는 없다. 낯선 값이 끝없이 길어지지 않게 자른다. */
const MAX_BAG_KEY = 40;
/** 한 번에 고를 수 있는 칸 수의 상한. 알려진 주머니가 40여 종이다. */
const MAX_BAGS = 80;

/** 알려진 묶음 칸. 이 밖의 묶음 이름은 트리에 없는 칸이라 버린다. */
function groupKeys(nodes: readonly BagTreeNode[]): string[] {
  return nodes.flatMap((node) => (node.children ? [node.value, ...groupKeys(node.children)] : []));
}

const KNOWN_GROUPS = new Set(groupKeys(buildBagTree([...BAG_NAMES])));

/** 채널 하나를 주소 글자로. 걸지 않았으면 빈 글자. */
function channelToken(key: string, channel: ColorChannel): string {
  if (colorChannelBounds(channel) === null) return '';
  if (channel.similar) return `${key}${channel.base}p${channel.percent}`;
  return `${key}${channel.min ?? ''}-${channel.max ?? ''}`;
}

/** 파트의 채널 조건을 주소 글자로. 건 채널이 없으면 null 이라 주소에서 빠진다. */
function channelsToParam(channels: ColorChannels): string | null {
  const tokens = COLOR_CHANNEL_KEYS.map((key) => channelToken(key, channels[key])).filter(Boolean);
  return tokens.length > 0 ? tokens.join(',') : null;
}

const CHANNEL_TOKEN = /^([rgb])(?:(\d{1,3})?-(\d{1,3})?|(\d{1,3})p(\d{1,3}))$/;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** 주소 글자에서 채널 조건을. 알아볼 수 없는 조각은 그 조각만 버린다. */
function channelsFromParam(value: string | null): ColorChannels {
  const channels = emptyColorChannels();
  if (!value) return channels;
  for (const token of value.split(',').slice(0, 3)) {
    const match = CHANNEL_TOKEN.exec(token);
    if (!match) continue;
    const key = match[1] as 'r' | 'g' | 'b';
    if (match[4] !== undefined) {
      channels[key] = {
        ...emptyColorChannel(),
        similar: true,
        base: clamp(Number(match[4]), 0, COLOR_CHANNEL_MAX),
        percent: clamp(Number(match[5] ?? DEFAULT_COLOR_PERCENT), 0, 100),
      };
      continue;
    }
    const min = match[2] === undefined ? null : clamp(Number(match[2]), 0, COLOR_CHANNEL_MAX);
    const max = match[3] === undefined ? null : clamp(Number(match[3]), 0, COLOR_CHANNEL_MAX);
    channels[key] =
      min !== null && max !== null && min > max
        ? { ...emptyColorChannel(), min: max, max: min }
        : { ...emptyColorChannel(), min, max };
  }
  return channels;
}

/** 주소의 검색 조건. 낯선 값은 기본값으로 돌린다. */
export function readBagConditions(params: URLSearchParams): BagSearchConditions {
  // 새로 나온 주머니는 알려진 목록에 없을 수 있어 이름은 그대로 받고, 묶음 칸만 아는 것으로 거른다.
  const bags = [...new Set(params.getAll('bag'))]
    .filter((key) => key.length > 0 && key.length <= MAX_BAG_KEY)
    .filter((key) => !key.startsWith('group:') || KNOWN_GROUPS.has(key))
    .slice(0, MAX_BAGS);

  const parts = PART_KEYS.map((key, part): PartCondition => {
    const value = params.get(key);
    if (value === DISABLED) return { enabled: false, channels: emptyColorChannels() };
    if (value === ENABLED_EMPTY) return { enabled: true, channels: emptyColorChannels() };
    const channels = channelsFromParam(value);
    // 채널 글자가 있으면 켠 파트다. 알아볼 수 없는 글자는 기본 상태로 돌린다.
    return hasColorChannels(channels)
      ? { enabled: true, channels }
      : { enabled: DEFAULT_ENABLED[part], channels };
  });

  return { bags, parts };
}

/** 검색 조건을 주소에 쓸 값으로. 기본값과 같으면 null 이라 주소에서 빠진다. */
export function bagConditionParams(
  conditions: BagSearchConditions,
): Record<string, string | string[] | null> {
  const parts = Object.fromEntries(
    PART_KEYS.map((key, part) => {
      const { enabled, channels } = conditions.parts[part] ?? defaultParts()[part];
      if (!enabled) return [key, DEFAULT_ENABLED[part] ? DISABLED : null];
      return [key, channelsToParam(channels) ?? (DEFAULT_ENABLED[part] ? null : ENABLED_EMPTY)];
    }),
  );

  return {
    bag: conditions.bags,
    ...parts,
  };
}

/** 주소에 검색 조건이 하나라도 실려 있는지(서버 포함). 나눠 받은 링크로 들어왔는지 가르는 데 쓴다. */
export function hasBagConditions(params: URLSearchParams): boolean {
  return ['server', 'bag', ...PART_KEYS].some((key) => params.has(key));
}
