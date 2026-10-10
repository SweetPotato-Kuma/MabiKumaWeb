import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Flex, Input, Modal, Popconfirm, Typography } from 'antd';
import { accountApi, ACCOUNT_CONSENT_VERSION, type Account } from '@/features/account/api';
import { disableGoogleAutoSelect, mountGoogleLogin } from '@/features/account/google';
import {
  acceptAccount,
  chooseConflict,
  deleteAccount,
  importEntries,
  logoutAccount,
  startAccountSync,
  syncAccount,
  useAccountState,
} from '@/features/account/store';
import {
  getPersonalAccount,
  getPersonalDocument,
  guestEntries,
  replaceGuestEntries,
  type PersonalEntries,
} from '@/lib/personalStorage';
import { validateEntries } from '../../shared/personal-data.js';

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
  const [takeLocal, setTakeLocal] = useState(true);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const loginElement = useRef<HTMLDivElement>(null);
  const fileElement = useRef<HTMLInputElement>(null);
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
  async function login() {
    await act(async () => {
      if (!loginElement.current) return;
      await mountGoogleLogin(
        loginElement.current,
        async (next) => {
          await act(() => acceptAccount(next));
        },
        (error) => setError(error.message),
      );
    });
  }
  async function register() {
    await act(async () => {
      const local = takeLocal ? guestEntries() : null;
      const next = await accountApi<Account>('/profile', 'POST', {
        nickname,
        consentVersion: consent ? ACCOUNT_CONSENT_VERSION : null,
      });
      await acceptAccount(next);
      if (local && Object.keys(local).length) importEntries(local);
    });
  }
  function exportFile() {
    const entries = getPersonalAccount() ? getPersonalDocument().entries : guestEntries();
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ version: 1, entries }, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `mabikuma-settings-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const status =
    phase === 'ready'
      ? '계정 저장 완료'
      : phase === 'local'
        ? '이 브라우저에 저장'
        : phase === 'loading'
          ? '계정 확인 중'
          : phase === 'conflict'
            ? '저장 내용 확인 필요'
            : '계정 저장 대기';
  return (
    <>
      <Button type="text" onClick={() => setOpen(true)} aria-label="계정 및 저장" title={status}>
        계정
      </Button>
      <Modal
        title="계정 및 저장"
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <Flex vertical gap={16}>
          <Text strong>{status}</Text>
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
              <Button loading={busy} onClick={() => void login()}>
                Google로 로그인
              </Button>
              <div ref={loginElement} />
            </>
          ) : needsProfile ? (
            <>
              <Text>외부 인증이 완료되었습니다. 계정에 사용할 프로필을 등록해 주세요.</Text>
              <Input
                aria-label="닉네임"
                placeholder="닉네임 (2~20자)"
                value={nickname}
                maxLength={20}
                onChange={(event) => setNickname(event.target.value)}
              />
              <Checkbox
                checked={takeLocal}
                onChange={(event) => setTakeLocal(event.target.checked)}
              >
                이 브라우저의 기존 저장 내용을 계정으로 가져오기
              </Checkbox>
              <Checkbox checked={consent} onChange={(event) => setConsent(event.target.checked)}>
                닉네임과 도구 입력값을 서버에 저장하는 데 동의합니다.
              </Checkbox>
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
              <Text>
                {account.profile?.nickname}님의 계정에 자동 저장합니다. 서버 저장이 끝나기 전의
                변경은 이 기기에 보관됩니다.
              </Text>
              {phase === 'conflict' && accountState.conflict ? (
                <Flex gap={8} wrap>
                  <Popconfirm
                    title="이 기기의 내용으로 계정 데이터를 바꿀까요?"
                    description="먼저 현재 내용을 파일로 내보내 두는 것을 권장합니다."
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
                loading={busy}
                disabled={phase === 'conflict'}
                onClick={() =>
                  void act(() =>
                    getPersonalAccount() === account.id ? syncAccount() : acceptAccount(account),
                  )
                }
              >
                저장 상태 다시 확인
              </Button>
              {phase === 'error' ? (
                <>
                  <Button onClick={() => void login()}>다시 로그인</Button>
                  <div ref={loginElement} />
                </>
              ) : null}
              <Popconfirm
                title="비로그인 때 저장한 내용으로 계정 데이터를 바꿀까요?"
                description="합산하지 않고 전체를 교체합니다. 현재 계정 내용은 먼저 파일로 내보내 주세요."
                onConfirm={() => void act(() => importEntries(guestEntries()))}
              >
                <Button disabled={phase === 'loading' || phase === 'conflict' || busy}>
                  기존 로컬 내용 가져오기
                </Button>
              </Popconfirm>
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
          <Popconfirm
            title="파일의 내용으로 현재 저장 내용을 바꿉니다. 계속할까요?"
            onConfirm={() => fileElement.current?.click()}
          >
            <Button
              disabled={
                busy ||
                phase === 'conflict' ||
                phase === 'loading' ||
                needsProfile ||
                Boolean(account && getPersonalAccount() !== account.id)
              }
            >
              백업 파일 가져오기
            </Button>
          </Popconfirm>
          <input
            ref={fileElement}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              const id = getPersonalAccount();
              if (!file) return;
              void act(async () => {
                if (file.size > 300000) throw new Error('백업 파일이 너무 큽니다.');
                const value = JSON.parse(await file.text());
                if (value.version !== 1 || !validateEntries(value.entries))
                  throw new Error('올바른 백업 파일이 아닙니다.');
                if (getPersonalAccount() !== id)
                  throw new Error('계정이 바뀌었습니다. 다시 파일을 가져와 주세요.');
                if (id) importEntries(value.entries);
                else replaceGuestEntries(value.entries);
              });
            }}
          />
          <Button onClick={() => void act(exportFile)}>현재 데이터 파일로 내보내기</Button>
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
