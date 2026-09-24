/**
 * 주머니 고르기 트리.
 *
 * 42종을 한 줄로 늘어놓으면 원하는 것을 찾기 어렵다. 재료 성격으로 묶고, 같은 재료에
 * 튼튼한과 더 튼튼한이 함께 있으면 그 아래를 한 번 더 나눈다. 상위 칸을 고르면 그 안의
 * 주머니를 모두 고른 것이 된다.
 *
 * 분류는 이름으로 가른다. 넥슨이 새 주머니를 내면 맞는 칸으로 들어가고, 어디에도 맞지
 * 않으면 "기타" 에 모인다. 목록에서 빠지지는 않는다.
 */

export interface BagTreeNode {
  /** 잎은 주머니 이름 그대로, 묶음은 "group:" 으로 시작한다. */
  value: string;
  /** 트리에 보이는 짧은 이름. */
  title: string;
  /** 고른 뒤 선택 칸에 보이는 이름. 짧은 이름만으로는 헷갈리는 것을 풀어 쓴다. */
  label: string;
  children?: BagTreeNode[];
}

interface Category {
  key: string;
  title: string;
  match: RegExp;
}

const CATEGORIES: Category[] = [
  { key: 'herb', title: '허브', match: /허브|만드레이크|해독초/ },
  { key: 'leather', title: '가죽', match: /가죽/ },
  { key: 'fabric', title: '옷감', match: /옷감/ },
  { key: 'silk', title: '실크', match: /실크/ },
  { key: 'material', title: '재료', match: /양털|거미줄|꽃바구니|실뭉치/ },
  { key: 'food', title: '식품', match: /달걀|감자|옥수수|밀|보리/ },
];
const OTHER: Category = { key: 'other', title: '기타', match: /.^/ };

const STURDIER = /^더 튼튼한 /;
const GRADE = /^(더 )?튼튼한 /;

/** 가죽, 옷감, 실크는 품질 순서가 있다. 가나다순이면 고급이 저가형보다 앞에 온다. */
const QUALITY_ORDER = ['저가형', '일반', '고급', '최고급'];

/** "더 튼튼한 골드 허브 주머니" → "골드 허브". 트리에서는 윗칸이 등급과 재료를 말해 준다. */
export function bareName(name: string): string {
  return name.replace(GRADE, '').replace(/\s*주머니$/, '');
}

export function isSturdier(name: string): boolean {
  return STURDIER.test(name);
}

function categoryOf(name: string): Category {
  const bare = bareName(name);
  return CATEGORIES.find((category) => category.match.test(bare)) ?? OTHER;
}

/** 주머니가 속한 분류. 결과를 분류별 탭으로 나눌 때 쓴다. */
export function bagCategory(name: string): { key: string; title: string } {
  const { key, title } = categoryOf(name);
  return { key, title };
}

/** 분류 순서. 트리와 탭이 같은 순서로 보이게 한다. */
export const CATEGORY_ORDER: readonly string[] = [...CATEGORIES, OTHER].map(
  (category) => category.key,
);

function compareBags(a: string, b: string): number {
  const rank = (name: string) => {
    const index = QUALITY_ORDER.indexOf(bareName(name).split(' ')[0]);
    return index < 0 ? QUALITY_ORDER.length : index;
  };
  return rank(a) - rank(b) || bareName(a).localeCompare(bareName(b), 'ko');
}

function leaf(name: string): BagTreeNode {
  return { value: name, title: bareName(name), label: name };
}

/** 주머니 이름들로 트리를 만든다. 비어 있는 칸은 만들지 않는다. */
export function buildBagTree(names: Iterable<string>): BagTreeNode[] {
  const byCategory = new Map<Category, string[]>();
  for (const name of new Set(names)) {
    const category = categoryOf(name);
    byCategory.set(category, [...(byCategory.get(category) ?? []), name]);
  }

  const tree: BagTreeNode[] = [];
  for (const category of [...CATEGORIES, OTHER]) {
    const members = byCategory.get(category);
    if (!members) continue;
    const plain = members.filter((name) => !isSturdier(name)).sort(compareBags);
    const sturdier = members.filter(isSturdier).sort(compareBags);

    const node: BagTreeNode = {
      value: `group:${category.key}`,
      title: category.title,
      label: category.title,
    };
    // 튼튼한과 더 튼튼한이 둘 다 있을 때만 한 번 더 나눈다. 한쪽뿐이면 칸만 깊어진다.
    node.children =
      plain.length > 0 && sturdier.length > 0
        ? [
            {
              value: `group:${category.key}:plain`,
              title: category.title,
              label: `튼튼한 ${category.title}`,
              children: plain.map(leaf),
            },
            {
              value: `group:${category.key}:sturdier`,
              title: `더 튼튼한 ${category.title}`,
              label: `더 튼튼한 ${category.title}`,
              children: sturdier.map(leaf),
            },
          ]
        : [...plain, ...sturdier].map(leaf);
    tree.push(node);
  }
  return tree;
}

/**
 * 고른 칸들을 주머니 이름 집합으로 푼다. 아무것도 고르지 않았으면 null(모든 주머니)이다.
 * 트리에 없는 값은 주머니 이름으로 본다. 찾기 전에 고른 주머니가 트리에서 잠깐 빠져도
 * 선택이 사라지지 않게 하려는 것이다.
 */
export function namesOfSelection(
  tree: readonly BagTreeNode[],
  values: readonly string[],
): Set<string> | null {
  if (values.length === 0) return null;

  const leaves = new Map<string, string[]>();
  const walk = (node: BagTreeNode): string[] => {
    const names = node.children ? node.children.flatMap(walk) : [node.value];
    leaves.set(node.value, names);
    return names;
  };
  tree.forEach(walk);

  return new Set(
    values.flatMap((value) => leaves.get(value) ?? (value.startsWith('group:') ? [] : [value])),
  );
}
