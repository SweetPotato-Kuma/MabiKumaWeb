import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  InboxOutlined,
  LockOutlined,
  ReadOutlined,
  RedoOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Flex,
  Form,
  Input,
  Progress,
  Row,
  Select,
  Slider,
  Space,
  Tag,
  Typography,
  Upload,
  theme,
} from 'antd';
import {
  forgetItemCards,
  isCardStoreConfigured,
  saveItemCard,
  verifyAdminKey,
} from '@/features/itemcard/cards';
import { useAdminKey } from '@/lib/adminKey';
import {
  pickImageFile,
  readImage,
  toBase64,
  toDataUrl,
  toPngBlob,
} from '@/features/itemcard/canvas';
import {
  analyzeTooltipImage,
  clampRect,
  cropImage,
  removeBackground,
  scaleNearest,
  trimTransparent,
  type Rect,
  type RgbaImage,
} from '@/features/itemcard/imageOps';
import { checkModel, readTooltip, type ModelStatus } from '@/features/itemcard/promptModel';
import { useItemIndexQuery } from '@/features/auction/dictionary';
import { EmptyState } from '@/components/EmptyState';

const { Title, Text, Paragraph } = Typography;

/**
 * 툴팁 스크린샷을 아이템 카드로 바꾸는 화면.
 *
 * 운영자 혼자 쓰는 화면이지만 배포본에도 올라간다. 게임을 하는 컴퓨터에서 바로 찍어
 * 넣으려면 배포된 주소에서 열려야 하기 때문이다. 정적 번들이라 화면을 숨길 방법은
 * 없으므로, 키가 없으면 잠금 화면만 보여 주고 실제 잠금은 워커 쪽에 맡긴다.
 *
 * 흐름은 세 단계다. 붙여 넣기로 이미지를 받고, 캔버스로 툴팁과 아이콘을 갈라내고,
 * 크롬 내장 모델이 읽은 글자를 사람이 고쳐서 저장한다. 세 번째 단계에서 사람이 고치는
 * 자리를 꼭 남겨 둔다. Prompt API 는 한국어를 공식 지원하지 않아서 그냥 믿을 수 없다.
 */

/** 아이콘 검출은 채도 기준이라 가장자리가 좁게 잡힌다. 넉넉히 떼어 내고 배경 제거가 경계를 정하게 한다. */
function paddedIconRect(rect: Rect, image: RgbaImage): Rect {
  const pad = Math.min(20, Math.max(6, Math.round(Math.max(rect.width, rect.height) * 0.3)));
  return clampRect(
    {
      x: rect.x - pad,
      y: rect.y - pad,
      width: rect.width + pad * 2,
      height: rect.height + pad * 2,
    },
    image,
  );
}

/** 작은 게임 폰트는 그대로 넘기면 모델이 못 읽는다. 최근접 이웃으로 키워 계단을 살린다. */
function panelForModel(image: RgbaImage, panel: Rect): RgbaImage {
  const crop = cropImage(image, panel);
  const factor = Math.min(4, Math.max(1, Math.round(900 / Math.max(crop.width, crop.height))));
  return scaleNearest(crop, factor);
}

const STATUS_LABEL: Record<ModelStatus, string> = {
  unsupported: '이 브라우저에는 없음',
  unavailable: '이 기기에서 쓸 수 없음',
  downloadable: '내려받아야 함',
  downloading: '내려받는 중',
  available: '쓸 수 있음',
};

function ModelTag({ status }: { status: ModelStatus | null }) {
  if (status === null) return <Tag>확인 중</Tag>;
  if (status === 'available') return <Tag color="success">{STATUS_LABEL[status]}</Tag>;
  if (status === 'downloadable' || status === 'downloading') {
    return <Tag color="processing">{STATUS_LABEL[status]}</Tag>;
  }
  return <Tag color="warning">{STATUS_LABEL[status]}</Tag>;
}

/**
 * 운영자 키를 묻는 화면.
 *
 * 이 잠금이 지키는 것과 못 지키는 것을 헷갈리지 않는다. 화면 코드는 정적 번들이라
 * 누구나 읽을 수 있고, 여기서 막는 것은 "주소를 우연히 찾은 사람이 쓸 것이 없게" 하는
 * 정도다. 진짜 잠금은 워커가 저장 요청마다 키를 다시 확인하는 쪽에 있다.
 */
function AdminKeyGate({ onUnlock }: { onUnlock: (key: string) => void }) {
  const [value, setValue] = useState('');
  const [isChecking, setIsChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const configured = isCardStoreConfigured();

  const submit = async () => {
    setIsChecking(true);
    setError(null);
    try {
      if (await verifyAdminKey(value.trim())) onUnlock(value.trim());
      else setError('키가 맞지 않습니다.');
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '키를 확인하지 못했습니다.');
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Flex vertical gap={20} style={{ maxWidth: 460 }}>
      <Flex vertical gap={6}>
        <Title level={3} style={{ margin: 0 }}>
          운영자 화면
        </Title>
        <Text type="secondary">아이템 카드를 만드는 화면입니다. 키가 있어야 열립니다.</Text>
      </Flex>

      <Card variant="outlined">
        {configured ? (
          <Form layout="vertical" onFinish={() => void submit()}>
            <Form.Item
              label="운영자 키"
              validateStatus={error ? 'error' : undefined}
              help={error ?? '이 브라우저에만 저장되고, 저장할 때마다 서버가 다시 확인합니다.'}
            >
              <Input.Password
                value={value}
                onChange={(event) => setValue(event.target.value)}
                autoFocus
                autoComplete="off"
              />
            </Form.Item>
            <Form.Item style={{ marginBottom: 0 }}>
              <Button
                type="primary"
                htmlType="submit"
                icon={<LockOutlined />}
                loading={isChecking}
                disabled={value.trim() === ''}
              >
                열기
              </Button>
            </Form.Item>
          </Form>
        ) : (
          <Alert
            type="warning"
            showIcon
            title="카드 저장소가 설정되지 않았습니다"
            description="VITE_PROXY_URL 이 비어 있어 워커에 닿을 수 없습니다. worker/README.md 의 아이템 카드 항목을 먼저 설정해 주세요."
          />
        )}
      </Card>
    </Flex>
  );
}

/** 키를 확인한 뒤의 본 화면. 붙여 넣기, 잘라내기, 읽기, 저장이 여기서 일어난다. */
function ItemCardEditor({ onLock }: { onLock: () => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const indexQuery = useItemIndexQuery();

  const [source, setSource] = useState<RgbaImage | null>(null);
  const [panel, setPanel] = useState<Rect | null>(null);
  const [iconRect, setIconRect] = useState<Rect | null>(null);
  const [tolerance, setTolerance] = useState(26);

  const [modelStatus, setModelStatus] = useState<ModelStatus | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [form] = Form.useForm();

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void checkModel().then((result) => {
      if (!cancelled) setModelStatus(result.status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadFile = useCallback(async (file: Blob) => {
    try {
      const image = await readImage(file);
      const layout = analyzeTooltipImage(image);

      setSource(image);
      setPanel(layout.panel);
      setIconRect(layout.icon ? paddedIconRect(layout.icon, image) : null);
      setReadError(null);
    } catch (error) {
      setReadError(error instanceof Error ? error.message : '이미지를 읽지 못했습니다.');
    }
  }, []);

  // 게임에서 Print Screen 으로 찍어 바로 붙여 넣는 흐름이 제일 빠르다. 화면 아무 데서나 받는다.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const file = pickImageFile(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void loadFile(file);
    };

    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [loadFile]);

  /** 배경을 지운 아이콘. 허용 오차를 움직이면 다시 계산된다. */
  const cutout = useMemo(() => {
    if (!source || !iconRect) return null;
    const cut = removeBackground(cropImage(source, iconRect), {
      hardTolerance: tolerance,
      softTolerance: tolerance + 32,
    });
    const trimmed = trimTransparent(cut);
    return { image: trimmed, dataUrl: toDataUrl(trimmed) };
  }, [source, iconRect, tolerance]);

  // 원본 위에 찾아낸 자리를 그려 준다. 틀렸는지 눈으로 바로 알 수 있어야 고칠 마음이 든다.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !source) return;

    canvas.width = source.width;
    canvas.height = source.height;

    const context = canvas.getContext('2d');
    if (!context) return;

    const frame = context.createImageData(source.width, source.height);
    frame.data.set(source.data);
    context.putImageData(frame, 0, 0);

    context.lineWidth = 2;
    if (panel) {
      context.strokeStyle = token.colorTextQuaternary;
      context.strokeRect(panel.x + 1, panel.y + 1, panel.width - 2, panel.height - 2);
    }
    if (iconRect) {
      context.strokeStyle = token.colorPrimary;
      context.strokeRect(iconRect.x + 1, iconRect.y + 1, iconRect.width - 2, iconRect.height - 2);
    }
  }, [source, panel, iconRect, token.colorPrimary, token.colorTextQuaternary]);

  /** 캔버스 위 좌표를 원본 픽셀 좌표로 옮긴다. 캔버스는 카드 폭에 맞춰 줄어들어 있다. */
  const toImagePoint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    return {
      x: Math.round(((event.clientX - bounds.left) / bounds.width) * canvas.width),
      y: Math.round(((event.clientY - bounds.top) / bounds.height) * canvas.height),
    };
  };

  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!source) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = toImagePoint(event);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const start = dragStart.current;
    if (!start || !source) return;

    const now = toImagePoint(event);
    const rect = {
      x: Math.min(start.x, now.x),
      y: Math.min(start.y, now.y),
      width: Math.abs(now.x - start.x),
      height: Math.abs(now.y - start.y),
    };
    // 클릭 한 번으로 상자가 사라지지 않게 한다. 끌어야 바뀐다.
    if (rect.width >= 8 && rect.height >= 8) setIconRect(clampRect(rect, source));
  };

  const endDrag = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStart.current = null;
  };

  const resetBoxes = () => {
    if (!source) return;
    const layout = analyzeTooltipImage(source);
    setPanel(layout.panel);
    setIconRect(layout.icon ? paddedIconRect(layout.icon, source) : null);
  };

  const runModel = async () => {
    if (!source || !panel) return;

    setIsReading(true);
    setReadError(null);
    setDownloadProgress(null);

    try {
      const blob = await toPngBlob(panelForModel(source, panel));
      const reading = await readTooltip(blob, {
        onDownloadProgress: (loaded) => setDownloadProgress(loaded),
      });

      form.setFieldsValue({
        name: reading.name,
        subtitle: reading.subtitle,
        description: reading.description,
      });
      message.success('모델이 읽은 값을 채웠습니다. 글자를 확인하고 고쳐 주세요.');
    } catch (error) {
      setReadError(error instanceof Error ? error.message : '툴팁을 읽지 못했습니다.');
    } finally {
      setIsReading(false);
      setDownloadProgress(null);
    }
  };

  const onSave = async (values: {
    name: string;
    category: string;
    subtitle?: string;
    description?: string;
  }) => {
    setIsSaving(true);
    try {
      const iconBase64 = cutout ? await toBase64(await toPngBlob(cutout.image)) : null;
      const result = await saveItemCard({
        card: {
          name: values.name.trim(),
          category: values.category,
          subtitle: values.subtitle?.trim() ?? '',
          description: values.description?.trim() ?? '',
        },
        iconBase64,
      });
      // 기억해 둔 카드를 비운다. 사전과 경매장이 다음에 볼 때 방금 넣은 것을 새로 받는다.
      forgetItemCards();
      message.success(`${values.name} 저장 완료. 사전에 ${result.count}장 있습니다.`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '저장하지 못했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const categoryOptions = useMemo(
    () =>
      (indexQuery.data?.categories ?? []).map((entry) => ({
        value: entry.name,
        label: entry.name,
      })),
    [indexQuery.data],
  );

  const modelUsable = modelStatus === 'available' || modelStatus === 'downloadable';

  return (
    <Flex vertical gap={20}>
      <Flex align="flex-start" justify="space-between" gap={16} wrap>
        <Flex vertical gap={6}>
          <Title level={3} style={{ margin: 0 }}>
            아이템 카드 만들기
          </Title>
          <Text type="secondary">
            게임에서 찍은 툴팁 스크린샷을 붙여 넣으면 아이콘을 잘라내고 글자를 읽어 사전에 넣습니다.
          </Text>
        </Flex>
        <Button icon={<LockOutlined />} onClick={onLock}>
          키 지우기
        </Button>
      </Flex>

      {/* 2단. 768px 미만에서는 한 단으로 떨어져 스크린샷이 위, 입력이 아래로 간다. */}
      <Row gutter={[20, 20]}>
        <Col xs={24} lg={13}>
          <Flex vertical gap={16}>
            <Card
              variant="outlined"
              size="small"
              title="스크린샷"
              extra={
                source ? (
                  <Button size="small" icon={<RedoOutlined />} onClick={resetBoxes}>
                    자리 다시 찾기
                  </Button>
                ) : null
              }
            >
              {source ? (
                <Flex vertical gap={10}>
                  <canvas
                    ref={canvasRef}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      cursor: 'crosshair',
                      touchAction: 'none',
                      imageRendering: 'pixelated',
                      borderRadius: token.borderRadius,
                      border: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    아이콘 자리가 틀렸으면 그림 위에서 끌어 다시 칠하세요. 툴팁 상자는 자동으로만
                    잡습니다.
                  </Text>
                  {panel === null ? (
                    <Alert
                      type="warning"
                      showIcon
                      title="툴팁 상자를 못 찾았습니다"
                      description="툴팁이 다 들어가게 다시 찍어 주세요. 잘린 화면에서는 글자를 읽을 수 없습니다."
                    />
                  ) : null}
                </Flex>
              ) : (
                <Upload.Dragger
                  accept="image/*"
                  showUploadList={false}
                  multiple={false}
                  beforeUpload={(file) => {
                    void loadFile(file);
                    return false;
                  }}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">여기에 끌어다 놓거나 눌러서 고르세요</p>
                  <p className="ant-upload-hint">화면 아무 데서나 Ctrl+V 로 붙여 넣어도 됩니다.</p>
                </Upload.Dragger>
              )}
            </Card>

            <Card variant="outlined" size="small" title="잘라낸 아이콘">
              {cutout ? (
                <Flex gap={20} align="flex-start" wrap>
                  {/* 투명한 곳이 보이도록 체크무늬를 깐다. 색은 토큰에서 나온다. */}
                  <div
                    style={{
                      padding: 12,
                      borderRadius: token.borderRadius,
                      border: `1px solid ${token.colorBorderSecondary}`,
                      backgroundColor: token.colorBgContainer,
                      backgroundImage: `linear-gradient(45deg, ${token.colorFillSecondary} 25%, transparent 25%, transparent 75%, ${token.colorFillSecondary} 75%), linear-gradient(45deg, ${token.colorFillSecondary} 25%, transparent 25%, transparent 75%, ${token.colorFillSecondary} 75%)`,
                      backgroundSize: '16px 16px',
                      backgroundPosition: '0 0, 8px 8px',
                    }}
                  >
                    <img
                      src={cutout.dataUrl}
                      alt="배경을 지운 아이템 아이콘 미리보기"
                      width={cutout.image.width * 3}
                      height={cutout.image.height * 3}
                      style={{ display: 'block', imageRendering: 'pixelated' }}
                    />
                  </div>

                  <Flex vertical gap={8} style={{ flex: 1, minWidth: 200 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <span className="tnum">{cutout.image.width}</span>
                      {' x '}
                      <span className="tnum">{cutout.image.height}</span> 픽셀로 저장됩니다.
                    </Text>
                    <Form layout="vertical" style={{ marginBottom: 0 }}>
                      <Form.Item
                        label="배경으로 볼 범위"
                        help="칸 바탕이 남으면 올리고, 아이템 가장자리가 파이면 내립니다."
                        style={{ marginBottom: 0 }}
                      >
                        <Slider min={8} max={70} value={tolerance} onChange={setTolerance} />
                      </Form.Item>
                    </Form>
                  </Flex>
                </Flex>
              ) : (
                <EmptyState
                  size="small"
                  variant="search"
                  description={
                    source
                      ? '아이콘을 못 찾았습니다. 위 그림에서 아이콘 자리를 끌어 칠해 주세요.'
                      : '스크린샷을 넣으면 아이콘을 잘라내 보여 줍니다.'
                  }
                />
              )}
            </Card>
          </Flex>
        </Col>

        <Col xs={24} lg={11}>
          <Flex vertical gap={16}>
            <Card
              variant="outlined"
              size="small"
              title="툴팁 글자 읽기"
              extra={<ModelTag status={modelStatus} />}
            >
              <Flex vertical gap={12}>
                <Paragraph type="secondary" style={{ marginBottom: 0, fontSize: 12 }}>
                  크롬 내장 모델(Gemini Nano)이 기기 안에서 읽습니다. 서버로 나가는 것은 없습니다.
                  다만 이 모델은 한국어를 공식 지원하지 않아 글자를 틀리게 읽는 일이 잦으니, 아래
                  칸을 꼭 확인하고 고쳐 주세요.
                </Paragraph>

                {modelStatus === 'unsupported' ? (
                  <Alert
                    type="warning"
                    showIcon
                    title="이 브라우저에는 내장 모델이 없습니다"
                    description="크롬 138 이상에서 열면 읽기 버튼이 살아납니다. 그때까지는 아래 칸에 직접 입력해도 저장은 됩니다."
                  />
                ) : null}

                {modelStatus === 'unavailable' ? (
                  <Alert
                    type="warning"
                    showIcon
                    title="이 기기에서 모델을 쓸 수 없습니다"
                    description="저장 공간 22GB 와 지원 하드웨어가 필요합니다. chrome://on-device-internals 에서 상태를 볼 수 있습니다."
                  />
                ) : null}

                {downloadProgress !== null ? (
                  <Progress percent={Math.round(downloadProgress * 100)} status="active" />
                ) : null}

                {readError ? (
                  <Alert
                    type="error"
                    showIcon
                    role="alert"
                    title="읽지 못했습니다"
                    description={readError}
                  />
                ) : null}

                <Button
                  type="primary"
                  icon={<ReadOutlined />}
                  loading={isReading}
                  disabled={!panel || !modelUsable}
                  onClick={() => void runModel()}
                >
                  툴팁 읽기
                </Button>
              </Flex>
            </Card>

            <Card variant="outlined" size="small" title="아이템 카드">
              <Form form={form} layout="vertical" onFinish={(values) => void onSave(values)}>
                <Form.Item
                  name="name"
                  label="아이템 이름"
                  rules={[{ required: true, message: '이름을 넣어 주세요.' }]}
                >
                  <Input placeholder="예: '도' 음 빈 병" />
                </Form.Item>

                <Form.Item
                  name="category"
                  label="카테고리"
                  rules={[{ required: true, message: '카테고리를 골라 주세요.' }]}
                >
                  <Select
                    showSearch
                    placeholder="예: 기타 소모품"
                    options={categoryOptions}
                    loading={indexQuery.isPending}
                    notFoundContent={
                      indexQuery.data
                        ? '맞는 카테고리가 없습니다.'
                        : '카테고리 목록을 아직 받지 못했습니다.'
                    }
                  />
                </Form.Item>

                <Form.Item name="subtitle" label="이름 아래 한 줄">
                  <Input placeholder="예: 보통속도 3타 악기" />
                </Form.Item>

                <Form.Item name="description" label="아이템 설명">
                  <Input.TextArea
                    rows={4}
                    placeholder="예: 입으로 불면 '도' 음이 나는 빈 병이다."
                  />
                </Form.Item>

                <Form.Item style={{ marginBottom: 0 }}>
                  <Space>
                    <Button
                      type="primary"
                      htmlType="submit"
                      icon={<SaveOutlined />}
                      loading={isSaving}
                    >
                      사전에 저장
                    </Button>
                    <Button onClick={() => form.resetFields()}>비우기</Button>
                  </Space>
                </Form.Item>
              </Form>
            </Card>
          </Flex>
        </Col>
      </Row>
    </Flex>
  );
}

/**
 * 키가 없으면 잠금 화면, 있으면 작업 화면.
 *
 * 두 갈래를 다른 컴포넌트로 떼어 둔 이유는 훅 때문이다. 한 컴포넌트 안에서 조건부로
 * 돌아가면 키를 넣는 순간 훅 개수가 달라져 리액트가 상태를 잃는다.
 */
export function ItemCardPage() {
  const [adminKey, setKey] = useAdminKey();

  if (!adminKey) return <AdminKeyGate onUnlock={setKey} />;
  return <ItemCardEditor onLock={() => setKey('')} />;
}
