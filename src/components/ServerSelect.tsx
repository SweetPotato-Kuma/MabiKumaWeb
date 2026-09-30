import { Grid, Segmented, Select } from 'antd';
import { SERVER_NAMES } from '@/features/servers/constants';
import { ALL_SERVERS } from '@/lib/useServerParam';

/**
 * 서버 고르기. 모든 화면이 이 하나를 쓴다. 세그먼트 버튼이고, "모든 서버" 는 그 화면이 지원할 때만 둔다.
 *
 * 다섯 칸(모든 서버 포함)은 576px 미만에서 한 줄에 다 들지 않아 끝 칸이 잘린다. 그때만 고르기 상자로 바꾼다.
 * 네 칸은 좁은 화면에서도 줄 폭에 맞춘다.
 */
export function ServerSelect({
  value,
  onChange,
  allowAll = false,
  block = false,
  id,
}: {
  value: string;
  onChange: (server: string) => void;
  allowAll?: boolean;
  /** 줄 폭을 다 쓴다. 좁은 화면에서 버튼이 한쪽에 몰리지 않게 한다. */
  block?: boolean;
  /** 고르기 상자일 때 라벨과 잇는 id. */
  id?: string;
}) {
  const screens = Grid.useBreakpoint();
  const options = [
    ...(allowAll ? [{ value: ALL_SERVERS, label: '모든 서버' }] : []),
    ...SERVER_NAMES.map((server) => ({ value: server as string, label: server as string })),
  ];

  if (allowAll && screens.sm === false) {
    return (
      <Select id={id} aria-label="서버" value={value} onChange={onChange} options={options} style={{ width: '100%' }} />
    );
  }
  return (
    <Segmented
      aria-label="서버"
      block={block}
      value={value}
      onChange={(next) => onChange(String(next))}
      options={options}
      style={{ maxWidth: '100%' }}
    />
  );
}
