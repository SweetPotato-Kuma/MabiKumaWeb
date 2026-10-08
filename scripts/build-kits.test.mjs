import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseKitList, parseKitTable, parseNotice, writeKitFiles } from './build-kits.mjs';

const page = (seq, rows) =>
  `<li><a id="list_on_${seq}" href="javascript:showEw2(${seq})" >비단 운문 한복 상자</a></li>
   <input type="hidden" id="ew_page_html_${seq}" name="ew_page_html" value="${rows.join('\n')}" />`;

describe('키트 확률표 읽기', () => {
  it('확률형 이벤트 상품 목록에서 번호와 이름을 읽는다', () => {
    expect(parseKitList(page(492, []))).toEqual([{ seq: '492', name: '비단 운문 한복 상자' }]);
  });

  it('등급과 아이템 확률을 읽고, 아이템은 등급 자리를 가리킨다', () => {
    const table = parseKitTable(
      page(492, [
        'S 등급\t6.5128%\t[트렌드] 스페셜 단정한 비단 운문 생활 한복(남성용)\t0.1020%\t\t ',
        'C 등급\t29.7294%\t티아 풍선(5번)\t1.7488%\t\ttrue ',
      ]),
      '492',
    );
    expect(table.grades).toEqual([
      { name: 'S 등급', chance: 0.065128 },
      { name: 'C 등급', chance: 0.297294 },
    ]);
    expect(table.items[1]).toEqual({ name: '티아 풍선(5번)', chance: 0.017488, grade: 1 });
  });

  it('등급이 없는 키트는 등급을 비우고, 이름 뒤 색 코드는 색 목록으로 뗀다', () => {
    const table = parseKitTable(
      page(460, [
        '없음\t없음\t반짝이 이름/채팅 지정 색상 변경 포션 (30일)  ■color:FFF549 ■color:00FFC82F\t2%',
      ]),
      '460',
    );
    expect(table.grades).toEqual([]);
    expect(table.items[0]).toEqual({
      name: '반짝이 이름/채팅 지정 색상 변경 포션 (30일)',
      chance: 0.02,
      colors: ['FFF549', 'FFC82F'],
    });
  });

  it('공지에서 판매 가격과 기간을 읽는다. 그림 설명에 있어도 읽는다', () => {
    const html =
      '<img alt="나이트메어 판타지아 박스 / 판매 가격 : 1,200 캐시 / 판매 기간 : 2026. 10. 1(목) 점검 후 ~ 2026. 10. 14(수) 23:59:00">';
    expect(parseNotice(html)).toEqual({ price: 1200, start: '2026-10-01', end: '2026-10-14' });
    expect(parseNotice('<p>이용 안내</p>')).toEqual({ price: null, start: null, end: null });
  });

  it('화면용으로 목록과 키트마다 한 파일을 쓰고, 키트 파일에는 그 키트 이름의 그림만 담는다', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'kits-'));
    await writeFile(join(dir, 'old-kit.json'), '{}');
    const archive = {
      updated: '2026-10-08',
      current: ['official-1'],
      icons: { 상자: 'box.webp', 날개: 'wing.webp', 풍선: 'balloon.webp' },
      kits: [
        {
          id: 'official-1',
          name: '상자',
          start: '2026-10-01',
          end: null,
          price: 1200,
          grades: [],
          items: [{ name: '날개', chance: 1 }],
        },
      ],
    };
    await writeKitFiles(archive, dir);
    expect((await readdir(dir)).sort()).toEqual(['index.json', 'official-1.json']);
    const index = JSON.parse(await readFile(join(dir, 'index.json'), 'utf8'));
    expect(index.kits[0]).toEqual({
      id: 'official-1',
      name: '상자',
      start: '2026-10-01',
      end: null,
      price: 1200,
      icon: 'box.webp',
      count: 1,
    });
    const kit = JSON.parse(await readFile(join(dir, 'official-1.json'), 'utf8'));
    expect(kit.icons).toEqual({ 상자: 'box.webp', 날개: 'wing.webp' });
  });
});
