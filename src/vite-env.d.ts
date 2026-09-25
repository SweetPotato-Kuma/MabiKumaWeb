/// <reference types="vite/client" />

/** .env 로 주입되는 값들. vite/client 의 ImportMetaEnv 에 병합된다. */
interface ImportMetaEnv {
  readonly VITE_BASE_PATH?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_PROXY_URL?: string;
  /** 그림과 카테고리별 그림 목록이 나가는 CDN 주소. 워커의 ICON_BASE_URL 과 같다. */
  readonly VITE_ICON_BASE_URL?: string;
  readonly VITE_NEXON_API_KEY?: string;
}
