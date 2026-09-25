import { theme as antdTheme, type ThemeConfig } from 'antd';

/**
 * 디자인 토큰의 단일 출처.
 *
 * 색·반경·폰트는 전부 여기서 나온다. 컴포넌트가 색을 직접 들고 있으면 안 된다.
 * CSS 쪽(`src/styles/index.css`)은 이 값을 커스텀 프로퍼티로 넘겨받아 쓰는 파생이다.
 * 두 체계가 같은 색을 각자 정의하는 상태를 만들지 않는다.
 */

/**
 * 액센트는 하나로 잠근다. 화면마다 다른 강조색을 쓰지 않는다.
 * 로고의 고구마 껍질 보라(#a83868)에서 왔다. 라이트는 밝은 글자를 얹을 수 있게 한 톤 눌렀고,
 * 다크는 어두운 배경에서 읽히게 밝혔다.
 */
const ACCENT_LIGHT = '#9e3563';
const ACCENT_DARK = '#e48db3';

/**
 * 순백·순흑은 쓰지 않는다. 깊이가 죽는다.
 * 회색은 전부 로고의 갈색 쪽으로 살짝 데운다. 파란 기가 도는 회색은 곰과 어울리지 않는다.
 * 라이트 바탕은 곰 주둥이 크림, 글자와 다크 바탕은 로고 외곽선 초콜릿에서 왔다.
 */
/**
 * 대비 기준(카드 바탕 기준). 처음 값은 테두리 1.3:1, 카드와 바탕 1.08:1 이라 다크에서 경계가 사라졌고,
 * 2.5:1 / 1.6:1 로 올렸더니 이번에는 선이 화면을 가두었다. 그 사이에 둔다.
 * - border: 입력칸과 기본 버튼의 테두리. 1.7~1.9:1. 무엇을 누르고 쓰는지 보이되 칸을 긋지는 않는다.
 * - borderSecondary: 카드와 표의 선. 1.3:1 안팎. 칸을 나누되 앞으로 나서지 않는다.
 * - container 와 layout: 1.13:1. 테두리 없이도 카드가 바탕에서 뜬다.
 * - 글자 단계(antd 는 본문색에 투명도를 걸어 만드는데, 흐린 두 단계가 4.5:1 에 못 미쳤다):
 *   textSecondary 7:1 이상, textTertiary(보조 안내문, Text type="secondary") 와 textPlaceholder 는 4.5:1 이상,
 *   textQuaternary(비활성) 만 3:1 안팎으로 둔다. 비활성은 흐려 보여야 한다.
 */
const SURFACE = {
  light: {
    layout: '#f4ede7',
    container: '#fffcfa',
    elevated: '#fffdfb',
    // 표 머리와 줄 위에 올렸을 때의 바탕. 테두리 색을 빌려 쓰면 테두리가 진해질 때 같이 탁해진다.
    subtle: '#f6f0eb',
    border: '#cfc0b4',
    borderSecondary: '#e9e0d8',
    text: '#2e201b',
    textSecondary: '#5e4f48',
    textTertiary: '#75665e',
    textPlaceholder: '#7a6b63',
    textQuaternary: '#a39489',
  },
  dark: {
    layout: '#120e0b',
    container: '#221b18',
    elevated: '#2c2420',
    subtle: '#2c2420',
    border: '#54463d',
    borderSecondary: '#3a302a',
    text: '#f1e7e0',
    textSecondary: '#cbbfb7',
    textTertiary: '#a89b92',
    textPlaceholder: '#a0938a',
    textQuaternary: '#7d7069',
  },
} as const;

/**
 * 액센트 위에 얹는 글자. 라이트는 카드 바탕색, 다크는 액센트가 밝아서 어두운 바탕색을 쓴다.
 * 흰 글자를 밝은 보라에 얹으면 대비가 2:1 대로 떨어진다. 두 모드 모두 6.5:1 이 넘는다.
 * antd 의 colorTextLightSolid 는 툴팁 글자에도 쓰이므로 전역으로 바꾸지 않고 버튼에만 준다.
 */
const ON_ACCENT = { light: SURFACE.light.container, dark: SURFACE.dark.container } as const;

/** 반경 스케일은 하나. antd 가 여기서 파생시키는 값을 그대로 쓴다. */
const BORDER_RADIUS = 10;

/** 헤더 높이. 레이아웃이 sticky 여백을 계산할 때도 같은 값을 써야 해서 내보낸다. */
export const HEADER_HEIGHT = 72;

/**
 * 글꼴은 Pretendard 하나. main.tsx 가 사이트 안에 실은 것을 쓴다(외부 CDN 을 부르지 않는다).
 * 글꼴을 정하지 않으면 윈도우는 맑은 고딕, 맥은 애플 SD 고딕으로 떨어져 기기마다 모양이 달랐다.
 * 받기 전이나 못 받았을 때를 위해 뒤에 OS 글꼴을 둔다. 받는 동안은 이 글꼴로 먼저 그린다(swap).
 */
const FONT_FAMILY =
  "'Pretendard Variable', Pretendard, -apple-system, BlinkMacSystemFont, system-ui, 'Apple SD Gothic Neo', 'Malgun Gothic', 'Segoe UI', sans-serif";

export type ThemeMode = 'light' | 'dark';

/**
 * body 와 오버스크롤 영역은 antd 컴포넌트 바깥이라 토큰이 닿지 않는다.
 * 같은 출처에서 나온 값을 커스텀 프로퍼티로 넘겨 CSS 가 파생해 쓰게 한다.
 *
 * 첫 페인트 전에 한 번 호출해야 배경이 번쩍이지 않는다.
 */
export function applyThemeVariables(mode: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const surface = SURFACE[mode];
  const root = document.documentElement;

  root.style.setProperty('--app-bg', surface.layout);
  root.style.setProperty('--app-text', surface.text);
  root.style.setProperty('--app-accent', mode === 'dark' ? ACCENT_DARK : ACCENT_LIGHT);
  root.style.setProperty('--app-font', FONT_FAMILY);
  root.style.colorScheme = mode;
  root.dataset.theme = mode;
}

export function buildThemeConfig(mode: ThemeMode): ThemeConfig {
  const isDark = mode === 'dark';
  const surface = SURFACE[mode];
  const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT;

  return {
    algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorPrimary: accent,
      colorInfo: accent,
      colorLink: accent,
      colorTextBase: surface.text,
      fontFamily: FONT_FAMILY,
      colorBgLayout: surface.layout,
      colorBgContainer: surface.container,
      colorBgElevated: surface.elevated,
      colorBorder: surface.border,
      colorBorderSecondary: surface.borderSecondary,
      colorTextSecondary: surface.textSecondary,
      colorTextTertiary: surface.textTertiary,
      colorTextDescription: surface.textTertiary,
      colorTextPlaceholder: surface.textPlaceholder,
      colorTextQuaternary: surface.textQuaternary,
      borderRadius: BORDER_RADIUS,
      fontSize: 15,
      // VISUAL_DENSITY 6. 결과 영역은 촘촘하게, 진입 영역은 숨 쉬게.
      sizeUnit: 4,
      sizeStep: 4,
      wireframe: false,
    },
    components: {
      Button: {
        primaryColor: ON_ACCENT[mode],
      },
      Radio: {
        buttonSolidCheckedColor: ON_ACCENT[mode],
      },
      Layout: {
        headerBg: 'transparent',
        headerHeight: HEADER_HEIGHT,
        headerPadding: 0,
        bodyBg: surface.layout,
        footerBg: 'transparent',
      },
      Menu: {
        // 헤더 메뉴는 이 사이트의 주 이동 수단이다. 본문보다 커야 눈에 먼저 들어온다.
        fontSize: 16,
        horizontalItemSelectedColor: accent,
        horizontalItemHoverColor: accent,
        itemBg: 'transparent',
        activeBarHeight: 3,
        itemHoverColor: accent,
      },
      Table: {
        headerBg: surface.subtle,
        headerSplitColor: 'transparent',
        cellPaddingBlockSM: 10,
        rowHoverBg: surface.subtle,
        borderColor: surface.borderSecondary,
      },
      Card: {
        // 카드 헤더가 본문보다 앞으로 나서지 않게 여백만 손본다.
        headerFontSize: 15,
      },
      Statistic: {
        contentFontSize: 22,
        titleFontSize: 13,
      },
      Segmented: {
        itemSelectedBg: isDark ? surface.elevated : surface.container,
      },
    },
  };
}
