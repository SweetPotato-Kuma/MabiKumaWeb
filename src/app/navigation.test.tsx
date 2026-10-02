import { describe, expect, it } from 'vitest';
import { ADMIN_NAV_ITEM, NAV_TREE, navPages, selectedPathFor } from '@/app/navigation';
import pageMeta from '@/app/pageMeta.json';

describe('메뉴 구조', () => {
  const entries = [...NAV_TREE, ADMIN_NAV_ITEM];

  it('칸마다 경로가 하나뿐이고, 화면이 있는 경로만 가리킨다', () => {
    const paths = navPages(entries).map(({ leaf }) => leaf.path);
    expect(new Set(paths).size).toBe(paths.length);
    const known = new Set(pageMeta.pages.map((page) => page.path));
    // 카드 만들기는 운영자 화면이라 검색엔진용 화면 목록에는 없다.
    for (const path of paths.filter((each) => each !== ADMIN_NAV_ITEM.path)) expect(known).toContain(path);
  });

  it('시뮬레이터는 세공, 성수, 유물 복원 순이고 유물 시세는 시뮬레이터 밖에 있다', () => {
    const pages = navPages(entries);
    const simulators = pages.filter(({ trail }) => trail.startsWith('시뮬레이터')).map(({ leaf }) => leaf.label);
    expect(simulators).toEqual(['세공', '성수', '유물 복원']);
    expect(pages.find(({ leaf }) => leaf.path === '/relic-simulator')?.trail).toBe('시뮬레이터, 유물');
    expect(pages.find(({ leaf }) => leaf.path === '/relics')?.trail).toBe('');
  });

  it('던전 코인과 주머니, 통행증은 NPC 상점 아래에 있고 뿔피리는 따로 있다', () => {
    const pages = navPages(entries);
    const shops = pages.filter(({ trail }) => trail === 'NPC 상점').map(({ leaf }) => leaf.label);
    expect(shops).toEqual(['던전 코인', '튼튼한 주머니', '마그 멜 통행증']);
    expect(pages.find(({ leaf }) => leaf.path === '/horn')?.trail).toBe('');
  });

  it('아이템 상세를 보는 동안에도 아이템 정보 칸이 선택돼 있다', () => {
    expect(selectedPathFor('/items', entries)).toBe('/items');
    expect(selectedPathFor('/item/숏-소드', entries)).toBe('/items');
    expect(selectedPathFor('/relic-simulator', entries)).toBe('/relic-simulator');
  });

  it('첫 화면에서는 선택된 칸이 없다', () => {
    expect(selectedPathFor('/', entries)).toBe('');
  });

  it('어느 칸에도 맞지 않는 주소(404)에서는 선택된 칸이 없다', () => {
    expect(selectedPathFor('/nonexistent-page', entries)).toBe('');
    expect(selectedPathFor('/auctionx', entries)).not.toBe('');
  });
});
