import { describe, expect, it } from 'vitest';
import { parseKitList, parseKitTable, parseNotice } from './build-kits.mjs';

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
});
