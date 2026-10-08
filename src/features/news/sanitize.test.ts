import { describe, expect, it } from 'vitest';
import { newsLinkId, sanitizeNewsHtml, scopeCss } from './sanitize';

const parse = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = sanitizeNewsHtml(html);
  return container;
};

describe('본문 거르기', () => {
  it('스크립트, 폼과 on 속성, javascript: 주소를 지우고 스타일은 본문 안으로 가둔다', () => {
    const body = parse(
      '<p onclick="steal()">글</p><script>alert(1)</script><style>body{display:none}</style><form><input></form><a href="javascript:go_home()">홈</a>',
    );
    expect(body.querySelector('script, form, input')).toBeNull();
    // 스타일 시트는 본문 안으로 갇혀 남는다. 바깥(body 등)에는 닿지 않는다.
    expect(body.querySelector('style')?.textContent).toBe('.news-body{body{display:none}}');
    expect(body.querySelector('p')?.hasAttribute('onclick')).toBe(false);
    expect(body.querySelector('a')?.hasAttribute('href')).toBe(false);
  });

  it('유튜브 틀만 남긴다', () => {
    const body = parse(
      '<iframe src="https://www.youtube.com/embed/abc"></iframe><iframe src="https://www.googletagmanager.com/ns.html"></iframe>',
    );
    expect([...body.querySelectorAll('iframe')].map((frame) => frame.getAttribute('src'))).toEqual([
      'https://www.youtube.com/embed/abc',
    ]);
  });

  it('상대 주소를 공식 홈페이지 주소로 바꾸고 바깥 링크는 새 탭으로 연다', () => {
    const body = parse('<img src="/img/a.png"><a href="/C3/Shop/ShopList.asp?showCate=3">샵</a>');
    expect(body.querySelector('img')?.getAttribute('src')).toBe(
      'https://mabinogi.nexon.com/img/a.png',
    );
    expect(body.querySelector('img')?.getAttribute('loading')).toBe('lazy');
    const link = body.querySelector('a');
    expect(link?.getAttribute('href')).toBe(
      'https://mabinogi.nexon.com/C3/Shop/ShopList.asp?showCate=3',
    );
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('받아 둔 새소식 글로 가는 링크는 우리 기록으로 잇는다', () => {
    const body = parse('<a href="notice_view.asp?id=4893864" target="_blank">공지</a>');
    expect(body.querySelector('a')?.getAttribute('href')).toBe('/news?id=4893864');
    expect(body.querySelector('a')?.hasAttribute('target')).toBe(false);
    expect(newsLinkId('https://mabinogi.nexon.com/page/news/update_view.asp?id=4893721')).toBe(
      4893721,
    );
    expect(newsLinkId('https://mabinogi.nexon.com/page/event/2026/0922_moon/index.asp')).toBeNull();
  });

  it('무채색 글자색과 밝은 바탕, 글꼴을 지우고 뜻이 있는 색은 남긴다', () => {
    const body = parse(
      [
        '<font color="#000000" face="굴림">검정</font>',
        '<font color="#ff0000">빨강</font>',
        '<span style="color: rgb(0, 0, 0); font-weight: bold; font-family: 굴림">굵게</span>',
        '<table bgcolor="#FCF7CC"><tr><td style="background-color:#ffffff">칸</td></tr></table>',
        '<span style="background:#9e3563;color:#ffffff">진한 바탕</span>',
      ].join(''),
    );
    const fonts = body.querySelectorAll('font');
    expect(fonts[0].hasAttribute('color')).toBe(false);
    expect(fonts[0].hasAttribute('face')).toBe(false);
    expect(fonts[1].getAttribute('color')).toBe('#ff0000');
    expect(body.querySelector('span')?.getAttribute('style')).toBe('font-weight: bold');
    expect(body.querySelector('table')?.hasAttribute('bgcolor')).toBe(false);
    expect(body.querySelector('td')?.hasAttribute('style')).toBe(false);
    // 진한 바탕은 남기고, 그 위의 흰 글자도 같이 남긴다.
    expect(body.querySelectorAll('span')[1].getAttribute('style')).toBe(
      'background: #9e3563; color: #ffffff',
    );
  });

  it('본문의 스타일 시트는 본문 안으로 가둬 남기고, 위험한 시트는 통째로 버린다', () => {
    const body = parse(
      '<style>.img_g{display:none}@media screen and (max-width:839px){.img_g_list li{width:33%}}</style>' +
        '<style>@import url(https://evil.example/x.css);.a{color:red}</style>' +
        '<style>.b{position:fixed;inset:0}</style>' +
        '<style>.c{background:url(javascript:alert(1))}</style><p>글</p>',
    );
    const sheets = [...body.querySelectorAll('style')].map((style) => style.textContent);
    expect(sheets).toEqual([
      '.news-body{.img_g{display:none}@media screen and (max-width:839px){.img_g_list li{width:33%}}}',
    ]);
    expect(scopeCss('/* 주석 */ .x{color:red}')).toBe('.news-body{.x{color:red}}');
    expect(scopeCss('.x{background:url("https://ssl.nexon.com/a.png")}')).toContain('url(');
    expect(scopeCss('')).toBe('');
  });

  it('갤러리 목록의 # 링크는 그대로 두어 새 탭으로 열리지 않는다', () => {
    const link = parse('<ul><li><a href="#" target="_blank">이름</a></li></ul>').querySelector('a');
    expect(link?.getAttribute('href')).toBe('#');
    expect(link?.hasAttribute('target')).toBe(false);
  });

  it('http:// 로 적힌 그림과 영상은 https:// 로 올린다', () => {
    const body = parse(
      '<img src="http://file.mabinogi.nexon.com/dataAdmin/UpImg/1.jpg"><video src="http://x.example/v.mp4" poster="http://x.example/p.jpg"></video><a href="http://x.example/page">링크</a>',
    );
    expect(body.querySelector('img')?.getAttribute('src')).toBe(
      'https://file.mabinogi.nexon.com/dataAdmin/UpImg/1.jpg',
    );
    expect(body.querySelector('video')?.getAttribute('src')).toBe('https://x.example/v.mp4');
    expect(body.querySelector('video')?.getAttribute('poster')).toBe('https://x.example/p.jpg');
    // 링크는 사용자가 눌러 가는 곳이라 건드리지 않는다.
    expect(body.querySelector('a')?.getAttribute('href')).toBe('http://x.example/page');
  });

  it('순수 검정 바탕은 남기고 회색 바탕은 지운다', () => {
    const body = parse(
      '<div style="background:#000;position:relative">영상</div><div style="background:#1e1e1e">회색</div>',
    );
    const [black, gray] = [...body.querySelectorAll('div')];
    expect(black.getAttribute('style')).toBe('background: #000; position: relative');
    expect(gray.hasAttribute('style')).toBe(false);
  });
});
