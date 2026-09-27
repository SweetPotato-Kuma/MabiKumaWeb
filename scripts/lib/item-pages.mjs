import { itemSlug } from '../../src/features/auction/itemSlug.mjs';

/**
 * 아이템 한 장마다 구울 HTML 의 재료.
 *
 * 앱은 아이템을 스크립트로 그린다. 구글은 스크립트를 돌려 보긴 하지만 만 개가 넘는 쪽을 전부
 * 돌려 주리라 기대할 수 없고, 네이버는 거의 돌리지 않는다. 그래서 아이템마다 이름, 카테고리,
 * 제작 재료, 쓰이는 곳을 글자로 박아 둔다. 앱이 뜨면 이 내용은 화면으로 바뀐다.
 *
 * 쪽은 이름 사전(names.json)에 있는 이름마다 하나다. 같은 이름이 여러 카테고리에 있으면
 * 사전에 먼저 적힌 카테고리로 굽는다. 앱도 주소에 카테고리가 없으면 같은 것을 고른다.
 */

/** 제작법 목록이 너무 길면 쪽이 늘어지기만 한다. 앱에서 전부 볼 수 있다. */
const MAX_RECIPES = 5;
const MAX_USED_IN = 40;

/** src/features/crafting/recipes.ts 의 rankText 와 같은 규칙이다. */
export function rankText(rank) {
  if (rank <= 0) return '연습 랭크';
  if (rank <= 6) return `${'FEDCBA'[rank - 1]}랭크`;
  if (rank <= 15) return `${16 - rank}랭크`;
  return `${rank - 15}단`;
}

/** 받침이 있으면 을, 없으면 를. 한글로 끝나지 않으면 알 수 없어 둘 다 적는다. */
export function objectParticle(word) {
  const code = word.charCodeAt(word.length - 1);
  if (code < 0xac00 || code > 0xd7a3) return '을(를)';
  return (code - 0xac00) % 28 === 0 ? '를' : '을';
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/**
 * @param {{ categories: string[], items: [string, number][] }} names 이름 사전
 * @param {{ skills: { id: number, name: string }[], items: Record<string, [string, number, string?]>, recipes: any[] } | null} recipes 제작법 책
 */
export function collectItemPages(names, recipes) {
  const categoriesByName = new Map();
  for (const [name, categoryIndex] of names.items) {
    const seen = categoriesByName.get(name) ?? [];
    const category = names.categories[categoryIndex];
    if (!seen.includes(category)) seen.push(category);
    categoriesByName.set(name, seen);
  }

  const itemName = (id) => recipes?.items[String(id)]?.[0] ?? '';
  const skillName = new Map((recipes?.skills ?? []).map((skill) => [skill.id, skill.name]));
  const slotText = ([ids, count]) => {
    const first = itemName(ids[0]);
    if (!first) return '';
    return `${first}${ids.length > 1 ? ' 등' : ''} ${count}개`;
  };

  /** 이름 -> 그 이름을 만드는 제작법들, 이름 -> 그 이름을 재료로 쓰는 아이템들. */
  const craftsOf = new Map();
  const usedIn = new Map();
  for (const recipe of recipes?.recipes ?? []) {
    const product = itemName(recipe.item);
    if (!product) continue;

    const skill = [skillName.get(recipe.skill) ?? '', recipe.tool ? `(${recipe.tool})` : '']
      .join('')
      .trim();
    const materials = [...recipe.materials, ...(recipe.finish ?? [])].map(slotText).filter(Boolean);
    const list = craftsOf.get(product) ?? [];
    list.push({ skill: `${skill} ${rankText(recipe.rank)}`.trim(), materials, yield: recipe.yield });
    craftsOf.set(product, list);

    for (const [ids] of [...recipe.materials, ...(recipe.finish ?? [])]) {
      for (const id of ids) {
        const material = itemName(id);
        if (!material) continue;
        const products = usedIn.get(material) ?? new Set();
        products.add(product);
        usedIn.set(material, products);
      }
    }
  }

  return [...categoriesByName].map(([name, categories]) => ({
    name,
    slug: itemSlug(name),
    category: categories[0],
    categories,
    crafts: (craftsOf.get(name) ?? []).slice(0, MAX_RECIPES),
    usedIn: [...(usedIn.get(name) ?? [])].filter((product) => product !== name).slice(0, MAX_USED_IN),
  }));
}

/**
 * 아이템 한 장의 본문. #root 안에 넣으므로 앱이 뜨면 앱 화면으로 바뀐다.
 * 스타일시트가 뜨기 전에 잠깐 보일 수 있어 글자만 읽히게 최소한으로 꾸민다.
 *
 * @param {ReturnType<typeof collectItemPages>[number]} page
 * @param {{ siteName: string, itemPath: (name: string) => string, known: Set<string> }} context
 */
export function renderItemBody(page, { siteName, itemPath, known }) {
  const categoryQuery = encodeURIComponent(page.category);
  const auctionHref = `/auction?keyword=${encodeURIComponent(page.name)}&category=${categoryQuery}`;
  const lines = [
    `<main style="max-width:960px;margin:0 auto;padding:24px 16px;line-height:1.6">`,
    `<nav aria-label="위치"><a href="/">${escapeHtml(siteName)}</a> › <a href="/items">아이템 정보</a> › <a href="/items?category=${categoryQuery}">${escapeHtml(page.category)}</a></nav>`,
    `<h1>${escapeHtml(page.name)}</h1>`,
    `<p>마비노기 ${escapeHtml(page.categories.join(', '))} 아이템입니다. ${escapeHtml(siteName)}에서 ${escapeHtml(page.name)}의 경매장 최저가와 시세 기록, 그림과 설명을 볼 수 있습니다.</p>`,
    `<p><a href="${escapeHtml(auctionHref)}">${escapeHtml(page.name)} 경매장 시세 보기</a></p>`,
  ];

  if (page.crafts.length) {
    lines.push(`<h2>${escapeHtml(page.name)} 제작법</h2>`, '<ul>');
    for (const craft of page.crafts) {
      const made = craft.yield > 1 ? ` (한 번에 ${craft.yield}개)` : '';
      lines.push(`<li>${escapeHtml(craft.skill)}${made}: ${escapeHtml(craft.materials.join(', '))}</li>`);
    }
    lines.push('</ul>');
  }

  if (page.usedIn.length) {
    lines.push(`<h2>${escapeHtml(page.name)}${objectParticle(page.name)} 재료로 쓰는 아이템</h2>`, '<ul>');
    for (const product of page.usedIn) {
      const label = escapeHtml(product);
      lines.push(known.has(product) ? `<li><a href="${escapeHtml(itemPath(product))}">${label}</a></li>` : `<li>${label}</li>`);
    }
    lines.push('</ul>');
  }

  lines.push('</main>');
  return lines.join('\n');
}
