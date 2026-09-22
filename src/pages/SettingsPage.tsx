import { useState } from 'react';
import { DeleteOutlined, DesktopOutlined, MoonOutlined, SaveOutlined, SunOutlined } from '@ant-design/icons';
import { App, Button, Card, Descriptions, Flex, Form, Input, Popconfirm, Segmented, Typography } from 'antd';
import {
  getDirectBaseUrl,
  getProxyUrl,
  useApiBaseUrlOverride,
  useApiKey,
  useEndpointMode,
} from '@/lib/settings';
import { useThemePreference, type ThemePreference } from '@/lib/themePreference';

const { Title, Text, Paragraph } = Typography;

const THEME_OPTIONS = [
  { value: 'system', label: '시스템', icon: <DesktopOutlined /> },
  { value: 'light', label: '라이트', icon: <SunOutlined /> },
  { value: 'dark', label: '다크', icon: <MoonOutlined /> },
];

export function SettingsPage() {
  const { message } = App.useApp();
  const [apiKey, saveApiKey] = useApiKey();
  const [baseUrlOverride, saveBaseUrlOverride] = useApiBaseUrlOverride();
  const [themePreference, setThemePreference] = useThemePreference();
  const endpoint = useEndpointMode();
  const proxyUrl = getProxyUrl();

  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [baseUrlDraft, setBaseUrlDraft] = useState(baseUrlOverride);

  const routeItems = endpoint.apiKey
    ? [
        { key: 'route', label: '요청 경로', children: <Text code>{endpoint.baseUrl}</Text> },
        { key: 'key', label: '키 사용', children: '내 API 키로 직접 호출합니다.' },
      ]
    : endpoint.viaProxy
      ? [
          { key: 'route', label: '요청 경로', children: <Text code>{endpoint.baseUrl}</Text> },
          { key: 'key', label: '키 사용', children: '프록시가 키를 들고 있어 이 브라우저에는 키가 없습니다.' },
        ]
      : [
          { key: 'route', label: '요청 경로', children: <Text type="warning">아직 조회할 수 없습니다.</Text> },
          { key: 'key', label: '필요한 것', children: '아래에 키를 넣거나 프록시 주소를 지정해 주세요.' },
        ];

  return (
    <Flex vertical gap={20}>
      <Title level={3} style={{ margin: 0 }}>
        설정
      </Title>

      <Card title="지금 요청이 나가는 경로" variant="outlined">
        <Descriptions column={1} size="small" items={routeItems} />
      </Card>

      <Card title="화면 테마" variant="outlined">
        <Flex vertical gap={10} align="flex-start">
          <Segmented
            value={themePreference}
            onChange={(value) => setThemePreference(value as ThemePreference)}
            options={THEME_OPTIONS}
          />
          <Text type="secondary" style={{ fontSize: 13 }}>
            시스템을 고르면 운영체제의 밝기 설정을 따라갑니다.
          </Text>
        </Flex>
      </Card>

      <Card title="API 접속 설정" variant="outlined">
        <Form
          layout="vertical"
          onFinish={() => {
            saveApiKey(keyDraft);
            saveBaseUrlOverride(baseUrlDraft);
            message.success('저장했습니다');
          }}
        >
          <Form.Item
            label="내 넥슨 오픈 API 키 (선택)"
            extra="내 키를 넣으면 프록시를 거치지 않고 넥슨 API를 직접 호출합니다. 값은 이 브라우저의 localStorage에만 저장되며 다른 서버로 보내지 않습니다."
          >
            <Input.Password
              autoComplete="off"
              spellCheck={false}
              value={keyDraft}
              placeholder={proxyUrl ? '비워 두면 프록시를 씁니다' : 'test_ 또는 live_ 로 시작하는 키'}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
          </Form.Item>

          <Form.Item
            label="프록시 주소 직접 지정 (선택)"
            extra={
              proxyUrl ? (
                <>
                  기본 프록시는 <Text code>{proxyUrl}</Text> 입니다. 다른 프록시를 쓰려면 여기에 넣으세요.
                </>
              ) : (
                <>
                  이 빌드에는 기본 프록시가 설정되어 있지 않습니다(<Text code>VITE_PROXY_URL</Text>). 직접 운영하는
                  프록시가 있으면 여기에 넣으세요.
                </>
              )
            }
          >
            <Input
              spellCheck={false}
              value={baseUrlDraft}
              placeholder={proxyUrl || getDirectBaseUrl()}
              onChange={(event) => setBaseUrlDraft(event.target.value)}
            />
          </Form.Item>

          <Flex gap={10} wrap style={{ marginTop: 8 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />}>
              저장
            </Button>
            <Popconfirm
              title="저장된 값을 지웁니다"
              description="이 브라우저에 저장된 API 키와 프록시 주소가 삭제됩니다."
              okText="삭제"
              cancelText="취소"
              okButtonProps={{ danger: true }}
              onConfirm={() => {
                setKeyDraft('');
                setBaseUrlDraft('');
                saveApiKey('');
                saveBaseUrlOverride('');
                message.success('저장된 값을 지웠습니다');
              }}
            >
              <Button danger icon={<DeleteOutlined />}>
                저장된 값 삭제
              </Button>
            </Popconfirm>
          </Flex>
        </Form>
      </Card>

      <Card title="API 키 발급" variant="outlined">
        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
          <Typography.Link href="https://openapi.nexon.com/" target="_blank" rel="noreferrer">
            openapi.nexon.com
          </Typography.Link>
          에 로그인한 뒤 &apos;내 애플리케이션&apos;에서 앱을 등록하면 키가 발급됩니다.
        </Paragraph>
      </Card>
    </Flex>
  );
}
