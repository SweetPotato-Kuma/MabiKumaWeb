import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Spin,
  Typography,
} from 'antd';
import { accountApi, ACCOUNT_CONSENT_VERSION, type Account } from '@/features/account/api';
import { disableGoogleAutoSelect, mountGoogleLogin } from '@/features/account/google';
import {
  acceptAccount,
  chooseConflict,
  deleteAccount,
  importEntries,
  logoutAccount,
  startAccountSync,
  useAccountState,
} from '@/features/account/store';
import { getPersonalAccount, type PersonalEntries } from '@/lib/personalStorage';

const { Text, Link } = Typography;
const failMessage = (error: unknown) =>
  error instanceof Error ? error.message : '처리하지 못했습니다.';
interface Snapshot {
  revision: number;
  updatedAt: number;
  entries: PersonalEntries;
}

export function AccountPanel() {
  const accountState = useAccountState();
  const { account, phase, message } = accountState;
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState('');
  const [consent, setConsent] = useState(false);
  const [loginElement, setLoginElement] = useState<HTMLDivElement | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [loginAttempt, setLoginAttempt] = useState(0);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  useEffect(() => startAccountSync(), []);
  const needsProfile = Boolean(account && !account.profile);
  useEffect(() => {
    if (needsProfile) setOpen(true);
  }, [needsProfile]);
  useEffect(() => {
    setSnapshots([]);
    setError('');
  }, [account?.id]);
  async function act(action: () => Promise<void> | void) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (error) {
      setError(failMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const loginNeeded = !account || phase === 'error';
  const loginAction = useRef(act);
  loginAction.current = act;
  useEffect(() => {
    if (!open || !loginNeeded || !loginElement) return;
    const controller = new AbortController();
    setGoogleLoading(true);
    setError('');
    void mountGoogleLogin(
      loginElement,
      async (next) => {
        await loginAction.current(() => acceptAccount(next));
      },
      (error) => {
        if (!controller.signal.aborted) {
          loginElement.replaceChildren();
          setError(error.message);
        }
      },
      controller.signal,
    )
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setError(failMessage(error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setGoogleLoading(false);
      });
    return () => {
      controller.abort();
      loginElement.replaceChildren();
    };
  }, [open, loginNeeded, loginElement, loginAttempt]);
  async function register() {
    await act(async () => {
      const next = await accountApi<Account>('/profile', 'POST', {
        nickname,
        consentVersion: consent ? ACCOUNT_CONSENT_VERSION : null,
      });
      await acceptAccount(next);
    });
  }
  const status =
    phase === 'ready'
      ? '계정 저장 완료'
      : phase === 'local'
        ? ''
        : phase === 'loading'
          ? '계정 확인 중'
          : phase === 'conflict'
            ? '저장 내용 확인 필요'
            : '계정 저장 대기';
  return (
    <>
      <Button
        type="text"
        onClick={() => setOpen(true)}
        aria-label={account ? '사용자 프로필' : '로그인'}
        title={account?.profile ? `${account.profile.nickname} · ${status}` : '로그인'}
      >
        <span
          style={{
            maxWidth: 96,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {account?.profile?.nickname ?? (account ? '프로필 등록' : '로그인')}
        </span>
      </Button>
      <Modal
        title={account?.profile ? '사용자 프로필' : account ? '프로필 등록' : '로그인'}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Flex vertical gap={16}>
          {message ? (
            <Alert
              type={phase === 'error' || phase === 'conflict' ? 'warning' : 'info'}
              title={message}
              showIcon
            />
          ) : null}
          {error ? <Alert type="error" title={error} showIcon /> : null}
          {!account ? (
            <>
              <Alert
                type="info"
                title="로그인하지 않아도 모든 도구를 사용할 수 있습니다."
                description="입력한 내용은 이 브라우저에만 저장됩니다. 사이트 데이터를 지우거나 기기를 바꾸면 복구할 수 없습니다. 계정에 저장하려면 Google로 로그인해 주세요."
              />
            </>
          ) : needsProfile ? (
            <>
              <Text>외부 인증이 완료되었습니다. 계정에 사용할 프로필을 등록해 주세요.</Text>
              <Form layout="vertical">
                <Form.Item label="닉네임" htmlFor="account-nickname">
                  <Input
                    id="account-nickname"
                    placeholder="2~20자"
                    value={nickname}
                    maxLength={20}
                    onChange={(event) => setNickname(event.target.value)}
                  />
                </Form.Item>
              </Form>
              <Text>기존 저장 내용은 등록 후 자동으로 동기화됩니다.</Text>
              <Flex align="flex-start">
                <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)}>
                  닉네임과 도구 입력값을 서버에 저장하는 데 동의합니다.
                </Checkbox>
              </Flex>
              <Link href={`${import.meta.env.BASE_URL}privacy`} target="_blank" rel="noreferrer">
                저장·개인정보 안내
              </Link>
              <Button
                type="primary"
                loading={busy}
                disabled={!consent || nickname.trim().length < 2}
                onClick={() => void register()}
              >
                프로필 등록하고 시작
              </Button>
            </>
          ) : (
            <>
              <Descriptions
                bordered
                size="small"
                column={1}
                items={[
                  { key: 'nickname', label: '닉네임', children: account.profile?.nickname },
                  { key: 'provider', label: '연결된 로그인', children: 'Google' },
                  { key: 'storage', label: '저장 상태', children: status },
                ]}
              />
              <Text>
                {account.profile?.nickname}님의 계정에 자동 저장합니다. 서버 저장이 끝나기 전의
                변경은 이 기기에 보관됩니다.
              </Text>
              {phase === 'conflict' && accountState.conflict ? (
                <Flex gap={8} wrap>
                  <Popconfirm
                    title="이 기기의 내용으로 계정 데이터를 바꿀까요?"
                    description="겹치는 항목만 이 기기의 값으로 바꿉니다."
                    onConfirm={() => chooseConflict('local')}
                  >
                    <Button>이 기기 내용 사용</Button>
                  </Popconfirm>
                  <Popconfirm
                    title="계정 내용으로 이 기기의 데이터를 바꿀까요?"
                    onConfirm={() => chooseConflict('remote')}
                  >
                    <Button>계정 내용 사용</Button>
                  </Popconfirm>
                </Flex>
              ) : null}
              <Button
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const id = account.id;
                    const result = await accountApi<{ snapshots: Snapshot[] }>('/history');
                    if (getPersonalAccount() === id) setSnapshots(result.snapshots);
                  })
                }
              >
                최근 복구본 보기
              </Button>
              {snapshots.map((snapshot) => (
                <Flex key={snapshot.revision} justify="space-between" align="center">
                  <Text>
                    버전 {snapshot.revision} ·{' '}
                    {new Date(snapshot.updatedAt).toLocaleString('ko-KR')}
                  </Text>
                  <Popconfirm
                    title="이 복구본으로 현재 내용을 바꿀까요?"
                    onConfirm={() => void act(() => importEntries(snapshot.entries))}
                  >
                    <Button size="small">복원</Button>
                  </Popconfirm>
                </Flex>
              ))}
            </>
          )}
          {loginNeeded ? (
            <Flex vertical gap={8}>
              {googleLoading ? <Spin aria-label="Google 로그인 불러오는 중" /> : null}
              <div ref={setLoginElement} />
              {error && !googleLoading ? (
                <Button onClick={() => setLoginAttempt((attempt) => attempt + 1)}>
                  로그인 다시 시도
                </Button>
              ) : null}
            </Flex>
          ) : null}
          {account ? (
            <>
              <Popconfirm
                title="로그아웃할까요?"
                description="저장 대기 내용은 이 계정의 기기 사본에 남습니다. 로그아웃하면 원래 비로그인 데이터로 돌아갑니다."
                onConfirm={() =>
                  void act(async () => {
                    await logoutAccount();
                    disableGoogleAutoSelect();
                    setSnapshots([]);
                  })
                }
              >
                <Button disabled={busy}>로그아웃</Button>
              </Popconfirm>
              <Popconfirm
                title="프로필과 계정의 저장 내용·복구본을 모두 삭제할까요?"
                description="이 작업은 되돌릴 수 없습니다. 비로그인 데이터는 유지됩니다."
                onConfirm={() =>
                  void act(async () => {
                    await deleteAccount();
                    disableGoogleAutoSelect();
                    setSnapshots([]);
                  })
                }
              >
                <Button danger disabled={busy}>
                  계정 데이터 삭제
                </Button>
              </Popconfirm>
            </>
          ) : null}
        </Flex>
      </Modal>
    </>
  );
}
