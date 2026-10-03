import version from './generated/squareIconVersion.json';

/** 기존 카드와 제작법의 그림 식별자를 정사각 WebP 주소로 연결한다. */
export function squareIconUrl(src: string): string | undefined {
  const match = /(?:^|\/)([a-f0-9]{16})\.png(?:\?[^#]*)?$/.exec(src);
  return match
    ? `${import.meta.env.BASE_URL}data/item-icons/${match[1]}.webp?v=${version}`
    : undefined;
}
