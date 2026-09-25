import {
  Button,
  Checkbox,
  Col,
  Collapse,
  ColorPicker,
  Flex,
  Form,
  Input,
  InputNumber,
  Row,
  Select,
  Slider,
  Tag,
  Typography,
} from 'antd';
import { AddIcon, DeleteIcon } from '@/components/icons';
import {
  activeConditionCount,
  EMPTY_OPTION_FILTER,
  MAX_REFORGE_CONDITIONS,
  type OptionFilter,
  type ReforgeCondition,
} from '@/features/auction/optionFilter';

const { Text } = Typography;

/** 색을 처음 켤 때의 값. 흰색에 아주 가까운 것. */
const DEFAULT_COLOR = { hex: '#ffffff', part: '', minSimilarity: 95 };

const PART_OPTIONS = [
  { value: '', label: '아무 파트' },
  ...['A', 'B', 'C', 'D', 'E', 'F'].map((part) => ({ value: part, label: `파트 ${part}` })),
];

const SPECIAL_OPTIONS = [
  { value: '', label: 'R, S 아무거나' },
  { value: 'R', label: 'R (레드)' },
  { value: 'S', label: 'S (실버)' },
];

/**
 * 경매장 세부 옵션 조건. 접어 두었다가 필요할 때 펼친다.
 *
 * 조건은 찾기를 다시 누르지 않아도 불러온 매물에 바로 걸린다. 넥슨 API 가 옵션으로 찾지 못해
 * 받아 온 뒤 화면에서 거르는 것이라, 이 칸은 검색이 아니라 거르기다.
 */
export function AuctionOptionFilter({
  value,
  onChange,
}: {
  value: OptionFilter;
  onChange: (next: OptionFilter) => void;
}) {
  const active = activeConditionCount(value);
  const patch = (next: Partial<OptionFilter>) => onChange({ ...value, ...next });
  const setReforge = (index: number, next: Partial<ReforgeCondition>) =>
    patch({
      reforges: value.reforges.map((condition, at) =>
        at === index ? { ...condition, ...next } : condition,
      ),
    });

  const body = (
    <Flex vertical gap={12}>
      <Text type="secondary" style={{ fontSize: 12 }}>
        넥슨 경매장 API 는 옵션으로 찾지 못해, 불러온 매물을 이 조건으로 거릅니다. 맞는 것이
        모자라면 다음 매물을 더 불러옵니다. 찾기를 다시 누르지 않아도 바로 걸립니다.
      </Text>
      <Form layout="vertical" style={{ marginBottom: 0 }}>
        {/* 두 단 격자. 768px 미만에서는 한 단으로 떨어진다. */}
        <Row gutter={[16, 0]}>
          <Col xs={24} md={12}>
            <Form.Item label="세공" style={{ marginBottom: 12 }}>
              <Flex vertical gap={8}>
                {value.reforges.map((condition, index) => (
                  <Flex key={index} gap={8} align="center">
                    <Input
                      value={condition.keyword}
                      onChange={(event) => setReforge(index, { keyword: event.target.value })}
                      placeholder="예: 스매시 대미지"
                      aria-label={`세공 ${index + 1} 옵션 이름`}
                      allowClear
                      style={{ flex: '1 1 auto', minWidth: 0 }}
                    />
                    <InputNumber
                      value={condition.minLevel}
                      onChange={(level) => setReforge(index, { minLevel: level ?? null })}
                      min={1}
                      max={30}
                      precision={0}
                      suffix="레벨 이상"
                      aria-label={`세공 ${index + 1} 최소 레벨`}
                      className="tnum"
                      style={{ width: 150, flex: '0 0 150px' }}
                    />
                    {value.reforges.length > 1 ? (
                      <Button
                        type="text"
                        icon={<DeleteIcon />}
                        aria-label={`세공 ${index + 1} 조건 빼기`}
                        onClick={() =>
                          patch({ reforges: value.reforges.filter((_, at) => at !== index) })
                        }
                      />
                    ) : null}
                  </Flex>
                ))}
                {value.reforges.length < MAX_REFORGE_CONDITIONS ? (
                  <Button
                    size="small"
                    icon={<AddIcon />}
                    style={{ alignSelf: 'flex-start' }}
                    onClick={() =>
                      patch({ reforges: [...value.reforges, { keyword: '', minLevel: null }] })
                    }
                  >
                    세공 조건 추가
                  </Button>
                ) : null}
              </Flex>
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label="인챈트" htmlFor="auction-filter-enchant" style={{ marginBottom: 12 }}>
              <Input
                id="auction-filter-enchant"
                value={value.enchant}
                onChange={(event) => patch({ enchant: event.target.value })}
                placeholder="예: 울프헌터"
                allowClear
              />
            </Form.Item>
            <Form.Item
              label="옵션 문구"
              htmlFor="auction-filter-text"
              extra="세트 효과, 장인 개조처럼 위에 없는 옵션을 찾을 때 씁니다."
              style={{ marginBottom: 12 }}
            >
              <Input
                id="auction-filter-text"
                value={value.text}
                onChange={(event) => patch({ text: event.target.value })}
                placeholder="예: 파이널 히트 강화"
                allowClear
              />
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label="특별 개조" style={{ marginBottom: 12 }}>
              <Flex gap={8}>
                <Select
                  value={value.specialType}
                  onChange={(specialType) => patch({ specialType })}
                  options={SPECIAL_OPTIONS}
                  aria-label="특별 개조 종류"
                  style={{ flex: '1 1 auto', minWidth: 0 }}
                />
                <InputNumber
                  value={value.minSpecialStep}
                  onChange={(step) => patch({ minSpecialStep: step ?? null })}
                  min={1}
                  max={10}
                  precision={0}
                  suffix="단계 이상"
                  aria-label="특별 개조 최소 단계"
                  className="tnum"
                  style={{ width: 150, flex: '0 0 150px' }}
                />
              </Flex>
            </Form.Item>
          </Col>

          <Col xs={24} md={12}>
            <Form.Item label="에르그" htmlFor="auction-filter-erg" style={{ marginBottom: 12 }}>
              <InputNumber
                id="auction-filter-erg"
                value={value.minErgLevel}
                onChange={(level) => patch({ minErgLevel: level ?? null })}
                min={1}
                max={50}
                precision={0}
                suffix="레벨 이상"
                className="tnum"
                style={{ width: 170 }}
              />
            </Form.Item>
          </Col>

          <Col xs={24}>
            <Form.Item label="색상" style={{ marginBottom: 0 }}>
              <Flex vertical gap={8}>
                <Checkbox
                  checked={value.color !== null}
                  onChange={(event) => patch({ color: event.target.checked ? DEFAULT_COLOR : null })}
                >
                  색으로 거르기 (장비 파트 색, 염색 앰플 색)
                </Checkbox>
                {value.color ? (
                  <Flex gap={12} wrap align="center">
                    <ColorPicker
                      value={value.color.hex}
                      onChange={(color) =>
                        value.color && patch({ color: { ...value.color, hex: color.toHexString() } })
                      }
                      // 마비노기는 색을 RGB 로 보여 준다. 주머니 찾기와 같은 입력 방식을 쓴다.
                      defaultFormat="rgb"
                      disabledAlpha
                      showText={(color) => {
                        const { r, g, b } = color.toRgb();
                        return <span className="tnum">{`R:${r} G:${g} B:${b}`}</span>;
                      }}
                      aria-label="찾을 색"
                    />
                    <Select
                      value={value.color.part}
                      onChange={(part) => value.color && patch({ color: { ...value.color, part } })}
                      options={PART_OPTIONS}
                      aria-label="색을 볼 파트"
                      style={{ width: 130 }}
                    />
                    <Flex gap={8} align="center" style={{ flex: '1 1 220px', minWidth: 200 }}>
                      <Text style={{ whiteSpace: 'nowrap' }}>비슷함</Text>
                      <Slider
                        value={value.color.minSimilarity}
                        onChange={(minSimilarity) =>
                          value.color && patch({ color: { ...value.color, minSimilarity } })
                        }
                        min={80}
                        max={100}
                        step={0.5}
                        aria-label="색이 비슷한 정도"
                        style={{ flex: '1 1 auto' }}
                      />
                      <Text className="tnum" style={{ whiteSpace: 'nowrap' }}>
                        {value.color.minSimilarity}% 이상
                      </Text>
                    </Flex>
                  </Flex>
                ) : null}
              </Flex>
            </Form.Item>
          </Col>
        </Row>
      </Form>
      {active > 0 ? (
        <Button
          size="small"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => onChange(EMPTY_OPTION_FILTER)}
        >
          옵션 조건 지우기
        </Button>
      ) : null}
    </Flex>
  );

  return (
    <Collapse
      size="small"
      items={[
        {
          key: 'options',
          label: (
            <Flex gap={8} align="center">
              <span>세부 옵션으로 거르기</span>
              {active > 0 ? <Tag>조건 {active}개</Tag> : null}
            </Flex>
          ),
          children: body,
        },
      ]}
    />
  );
}
