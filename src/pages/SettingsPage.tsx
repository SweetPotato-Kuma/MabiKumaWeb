import { useEffect, useState } from 'react';
import {
  getDirectBaseUrl,
  getProxyUrl,
  useApiBaseUrlOverride,
  useApiKey,
  useEndpointMode,
} from '@/lib/settings';

export function SettingsPage() {
  const [apiKey, saveApiKey] = useApiKey();
  const [baseUrlOverride, saveBaseUrlOverride] = useApiBaseUrlOverride();
  const endpoint = useEndpointMode();
  const proxyUrl = getProxyUrl();

  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrlOverride);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 2000);
    return () => window.clearTimeout(timer);
  }, [saved]);

  return (
    <div className="page">
      <h1>설정</h1>

      <section className="panel">
        <h2>지금 요청이 나가는 경로</h2>
        {endpoint.apiKey ? (
          <p>
            내 API 키로 <code>{endpoint.baseUrl}</code> 에 직접 호출합니다.
          </p>
        ) : endpoint.viaProxy ? (
          <p>
            프록시 <code>{endpoint.baseUrl}</code> 를 거칩니다. 키는 프록시가 들고 있으므로 이
            브라우저에는 키가 없습니다.
          </p>
        ) : (
          <p className="muted">
            아직 조회할 수 없습니다. 아래에 키를 넣거나 프록시 주소를 지정해 주세요.
          </p>
        )}
      </section>

      <form
        className="panel"
        onSubmit={(event) => {
          event.preventDefault();
          saveApiKey(keyDraft);
          saveBaseUrlOverride(baseUrlDraft);
          setSaved(true);
        }}
      >
        <label className="field field--wide">
          <span>내 넥슨 오픈 API 키 (선택)</span>
          <input
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={keyDraft}
            placeholder={proxyUrl ? '비워 두면 프록시를 씁니다' : 'test_… 또는 live_…'}
            onChange={(event) => setKeyDraft(event.target.value)}
          />
          <small className="muted">
            자기 키를 넣으면 프록시를 거치지 않고 넥슨 API 를 직접 호출합니다. 값은 이 브라우저의
            localStorage 에만 저장되며 다른 서버로 보내지 않습니다.
          </small>
        </label>

        <label className="field field--wide">
          <span>프록시 주소 직접 지정 (선택)</span>
          <input
            type="text"
            spellCheck={false}
            value={baseUrlDraft}
            placeholder={proxyUrl || getDirectBaseUrl()}
            onChange={(event) => setBaseUrlDraft(event.target.value)}
          />
          <small className="muted">
            {proxyUrl ? (
              <>
                기본 프록시는 <code>{proxyUrl}</code> 입니다. 다른 프록시를 쓰려면 여기에
                넣으세요.
              </>
            ) : (
              <>
                이 빌드에는 기본 프록시가 설정되어 있지 않습니다(<code>VITE_PROXY_URL</code>).
                직접 운영하는 프록시가 있으면 여기에 넣으세요.
              </>
            )}
          </small>
        </label>

        <div className="field-row field-row--actions">
          <button type="submit" className="button button--primary">
            저장
          </button>
          <button
            type="button"
            className="button"
            onClick={() => {
              setKeyDraft('');
              setBaseUrlDraft('');
              saveApiKey('');
              saveBaseUrlOverride('');
            }}
          >
            저장된 값 삭제
          </button>
          {saved ? <span className="saved-badge">저장했습니다</span> : null}
        </div>
      </form>

      <section className="panel">
        <h2>API 키 발급</h2>
        <p>
          <a href="https://openapi.nexon.com/" target="_blank" rel="noreferrer">
            openapi.nexon.com
          </a>{' '}
          에 로그인한 뒤 &apos;내 애플리케이션&apos; 에서 앱을 등록하면 키가 발급됩니다.
        </p>
      </section>
    </div>
  );
}
