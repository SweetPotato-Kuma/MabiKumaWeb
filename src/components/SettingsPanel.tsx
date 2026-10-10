import { useState } from 'react';
import { Button, Checkbox, Flex, Popover, Segmented, Tooltip, Typography } from 'antd';
import { SettingsIcon } from '@/components/icons';
import { HomeWidgetSettings } from '@/components/home/HomeWidgetSettings';
import { SERVER_NAMES } from '@/features/servers/constants';
import { formatGoldWith } from '@/lib/format';
import { useUserSettings, type PriceStyle } from '@/lib/userSettings';

const { Text } = Typography;

const SERVER_OPTIONS = SERVER_NAMES.map((server) => ({ value: server, label: server }));

const PRICE_STYLE_OPTIONS: { value: PriceStyle; label: string }[] = [
  { value: 'number', label: '숫자' },
  { value: 'korean', label: '한글' },
];

/** 가격 표기를 미리 보여 주는 값. 설정을 바꾸면 이 줄이 바로 그 모양으로 바뀐다. */
const PRICE_SAMPLE = 1_149_001_234;

/**
 * 방문자 설정. 헤더의 팝오버와 좁은 화면의 메뉴 서랍이 같은 내용을 쓴다.
 * 바꾸면 바로 저장되고 지금 보는 화면에도 곧장 반영된다(userSettings).
 */
export function SettingsPanel({ onWidgetEdit }: { onWidgetEdit?: () => void }) {
  const [settings, update] = useUserSettings();
  const korean = settings.priceStyle === 'korean';

  return (
    <Flex vertical gap={16}>
      <Flex vertical gap={6}>
        <Text strong>기본 서버</Text>
        <Segmented
          block
          aria-label="기본 서버"
          options={SERVER_OPTIONS}
          value={settings.server}
          onChange={(server) => update({ server })}
        />
      </Flex>

      <Flex vertical gap={6}>
        <Text strong>가격 표기</Text>
        <Segmented
          block
          aria-label="가격 표기"
          options={PRICE_STYLE_OPTIONS}
          value={settings.priceStyle}
          onChange={(priceStyle) => update({ priceStyle })}
        />
        <Checkbox
          checked={settings.omitSmall}
          disabled={!korean}
          onChange={(event) => update({ omitSmall: event.target.checked })}
        >
          1만 미만 생략
        </Checkbox>
        <Text type="secondary" className="tnum" style={{ fontSize: 12 }}>
          {formatGoldWith(PRICE_SAMPLE, {
            style: settings.priceStyle,
            omitSmall: settings.omitSmall,
          })}
        </Text>
      </Flex>

      <Checkbox
        checked={settings.hideSymbols}
        onChange={(event) => update({ hideSymbols: event.target.checked })}
      >
        심볼·도면·옷본 제외
      </Checkbox>
      <HomeWidgetSettings onOpen={onWidgetEdit} />
    </Flex>
  );
}

/** 헤더의 설정 단추. 누르면 설정 팝오버가 열린다. */
export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger="click"
      placement="bottomRight"
      title="설정"
      content={
        <div style={{ width: 280, maxWidth: 'calc(100vw - 56px)' }}>
          <SettingsPanel onWidgetEdit={() => setOpen(false)} />
        </div>
      }
    >
      <Tooltip title="설정">
        <Button type="text" aria-label="설정" icon={<SettingsIcon />} />
      </Tooltip>
    </Popover>
  );
}
