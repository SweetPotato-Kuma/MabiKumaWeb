import { getProxyUrl } from '@/lib/settings';

/**
 * 이슈 제보.
 *
 * GitHub 토큰은 워커만 들고 있다. 방문자 대부분은 GitHub 계정이 없으므로 워커가
 * 대신 이슈를 만든다. 그래서 이 기능은 프록시가 설정된 배포본에서만 동작한다.
 */
export type IssueCategory = 'bug' | 'feature';

export interface IssueReportInput {
  category: IssueCategory;
  title: string;
  body: string;
  /** 어느 화면에서 제보했는지. 재현에 필요해서 함께 보낸다. */
  page: string;
}

export interface IssueReportResult {
  number: number;
  url: string;
}

/** 워커 주소가 없으면 제보를 받을 곳이 없다. 로컬 개발에서 흔한 상태다. */
export function canReportIssue(): boolean {
  return getProxyUrl().length > 0;
}

const FALLBACK_MESSAGE = '제보를 보내지 못했습니다. 잠시 후 다시 시도해 주세요.';

export async function submitIssueReport(input: IssueReportInput): Promise<IssueReportResult> {
  const base = getProxyUrl();
  if (!base) throw new Error('지금은 제보를 받을 수 없습니다.');

  let response: Response;
  try {
    response = await fetch(`${base}/report/issue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // website 는 사람이 채울 일이 없는 칸이다. 워커가 값이 있으면 자동 제출로 본다.
      body: JSON.stringify({ ...input, website: '' }),
    });
  } catch {
    throw new Error('네트워크 요청이 막혔습니다. 연결을 확인해 주세요.');
  }

  const payload = (await response.json().catch(() => null)) as
    | (Partial<IssueReportResult> & { error?: { message?: string } })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message ?? FALLBACK_MESSAGE);
  }
  if (typeof payload?.number !== 'number' || typeof payload.url !== 'string') {
    throw new Error(FALLBACK_MESSAGE);
  }

  return { number: payload.number, url: payload.url };
}
