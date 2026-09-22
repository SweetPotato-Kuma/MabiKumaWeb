import { theme as antdTheme, type ThemeConfig } from 'antd';

/**
 * 디자인 토큰의 단일 출처.
 *
 * 색·반경·폰트는 전부 여기서 나온다. 컴포넌트가 색을 직접 들고 있으면 안 된다.
 * CSS 쪽(`src/styles/index.css`)은 이 값을 커스텀 프로퍼티로 넘겨받아 쓰는 파생이다.
 * 두 체계가 같은 색을 각자 정의하는 상태를 만들지 않는다.
 */

/** 액센트는 하나로 잠근다. 화면마다 다른 강조색을 쓰지 않는다. */
const ACCENT_LIGHT = '#3f5bd9';
const ACCENT_DARK = '#7e93ff';

/** 순백·순흑은 쓰지 않는다. 깊이가 죽는다. */
const SURFACE = {
  light: {
    layout: '#f4f6fb',
    container: '#fcfcfe',
    elevated: '#ffffff',
    border: '#e2e6f0',
    borderSecondary: '#edf0f6',
    text: '#1c2130',
  },
  dark: {
    layout: '#12141b',
    container: '#1a1d26',
    elevated: '#22262f',
    border: '#2f3542',
    borderSecondary: '#262b36',
    text: '#e7e9ef',
  },
} as const;

/** 반경 스케일은 하나. antd 가 여기서 파생시키는 값을 그대로 쓴다. */
const BORDER_RADIUS = 10;

const FONT_FAMILY = [
  'Pretendard',
  '-apple-system',
  'BlinkMacSystemFont',
  'Segoe UI',
  'Apple SD Gothic Neo',
  'Malgun Gothic',
  'system-ui',
  'sans-serif',
].join(', ');

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
      colorBgLayout: surface.layout,
      colorBgContainer: surface.container,
      colorBgElevated: surface.elevated,
      colorBorder: surface.border,
      colorBorderSecondary: surface.borderSecondary,
      borderRadius: BORDER_RADIUS,
      fontFamily: FONT_FAMILY,
      fontSize: 15,
      // VISUAL_DENSITY 6. 결과 영역은 촘촘하게, 진입 영역은 숨 쉬게.
      sizeUnit: 4,
      sizeStep: 4,
      wireframe: false,
    },
    components: {
      Layout: {
        headerBg: 'transparent',
        headerHeight: 64,
        headerPadding: 0,
        bodyBg: surface.layout,
        footerBg: 'transparent',
      },
      Menu: {
        horizontalItemSelectedColor: accent,
        itemBg: 'transparent',
        activeBarHeight: 2,
      },
      Table: {
        headerBg: isDark ? surface.elevated : surface.borderSecondary,
        headerSplitColor: 'transparent',
        cellPaddingBlockSM: 10,
        rowHoverBg: isDark ? surface.elevated : surface.borderSecondary,
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
