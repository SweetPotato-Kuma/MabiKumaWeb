/**
 * 옷본과 도면의 경매장 이름.
 *
 * 경매장은 이 아이템의 item_name 을 "옷본", "도면" 으로만 알고 무엇을 만드는 것인지는
 * item_display_name("도면 - 더스크바운드 이지스 헬멧") 에 둔다. 그래서 시세는 item_name 으로 종류째
 * 받고 display name 으로 가려야 한다. 남은 사용 횟수가 줄어든 것은 코인 상점에서 받는 것과 다른
 * 물건이라 새것(30회)만 본다.
 */

const PATTERN_NAME = /^(옷본|도면) - /;

export const FULL_USES = '30';

export const isPatternName = (name: string): boolean => PATTERN_NAME.test(name);

/** 경매장에 item_name 으로 물을 이름. 옷본과 도면이 아니면 이름 그대로다. */
export function listingNameOf(name: string): string {
  return PATTERN_NAME.exec(name)?.[1] ?? name;
}

interface ListedItem {
  item_name: string;
  item_display_name: string;
  item_option?: { option_type: string; option_value?: string | null }[];
}

/** 이 매물이 name 아이템의 것인지. */
export function isListingOf(item: ListedItem, name: string): boolean {
  if (!isPatternName(name)) return item.item_name === name;
  if (item.item_display_name !== name) return false;
  const uses = item.item_option?.find((option) => option.option_type === '남은 사용 횟수');
  return uses === undefined || uses.option_value === FULL_USES;
}
