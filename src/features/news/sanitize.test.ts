import { describe, expect, it } from 'vitest';
import { newsLinkId, sanitizeNewsHtml } from './sanitize';

const parse = (html: string) => {
  const container = document.createElement('div');
  container.innerHTML = sanitizeNewsHtml(html);
  return container;
};

describe('본문 거르기', () => {
  it('스크립트, 스타일, 폼과 on 속성, javascript: 주소를 지운다', () => {
    const body = parse(
      '<p onclick="steal()">글</p><script>alert(1)</script><style>body{display:none}</style><form><input></form><a href="javascript:go_home()">홈</a>',
    );
    expect(body.querySelector('script, style, form, input')).toBeNull();
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
});
