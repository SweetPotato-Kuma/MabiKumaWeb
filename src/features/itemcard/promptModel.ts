/**
 * 크롬 내장 모델(Prompt API, Gemini Nano)로 툴팁 이미지를 읽는다.
 *
 * 모델이 기기 안에서 돌기 때문에 키도 서버도 필요 없고 호출당 비용도 없다.
 * 대신 두 가지를 알고 써야 한다.
 *
 * 1. 크롬 138 이상에서만 있다. 다른 브라우저에는 `LanguageModel` 자체가 없다.
 * 2. **한국어는 Prompt API 가 공식 지원하는 언어가 아니다.** 지원 목록은 en, ja, es,
 *    de, fr 뿐이다. 한국어를 선언하면 `NotSupportedError` 가 날 수 있고, 넘어가더라도
 *    글자를 틀리게 읽는 일이 잦다. 그래서 한국어 선언을 먼저 시도하고 막히면 영어로
 *    내려앉되, **결과는 항상 사람이 고칠 수 있는 입력칸에 넣는다.** 모델이 읽은 값을
 *    그대로 사전에 밀어 넣지 않는다.
 *
 * 공식 문서: https://developer.chrome.com/docs/ai/prompt-api
 */

export type ModelStatus =
  'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'available';

export interface TooltipReading {
  name: string;
  subtitle: string;
  description: string;
}

interface ExpectedInput {
  type: 'text' | 'image' | 'audio';
  languages?: string[];
}

interface LanguageModelSession {
  prompt(
    input: unknown,
    options?: { responseConstraint?: unknown; signal?: AbortSignal },
  ): Promise<string>;
  destroy(): void;
}

interface LanguageModelApi {
  availability(options: Record<string, unknown>): Promise<string>;
  create(options: Record<string, unknown>): Promise<LanguageModelSession>;
}

declare global {
  var LanguageModel: LanguageModelApi | undefined;
}

/**
 * 한국어 선언부터 시도한다. 통과하면 모델이 한국어 문맥을 알고 읽는다.
 * 막히면 영어 선언으로 내려앉는다. 이미지 안의 글자는 어차피 한국어라 읽기는 시도한다.
 */
const INPUT_SETS: ExpectedInput[][] = [
  [{ type: 'text', languages: ['ko'] }, { type: 'image' }],
  [{ type: 'text', languages: ['en'] }, { type: 'image' }],
  [{ type: 'image' }],
];

/** 스펙이 한 번 바뀌어 예전 이름이 돌아오는 크롬이 있다. 두 벌을 다 받는다. */
function normalizeStatus(raw: string): ModelStatus {
  switch (raw) {
    case 'available':
    case 'readily':
      return 'available';
    case 'downloadable':
    case 'after-download':
      return 'downloadable';
    case 'downloading':
      return 'downloading';
    default:
      return 'unavailable';
  }
}

function sessionOptions(inputs: ExpectedInput[]): Record<string, unknown> {
  return {
    expectedInputs: inputs,
    // 출력은 영어 선언으로 고정한다. 한국어 출력은 지원 목록에 없어서 선언하면 거절당한다.
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  };
}

/** 지금 이 브라우저에서 모델을 쓸 수 있는지. 쓸 수 있으면 어떤 입력 선언으로 쓸지도 같이. */
export async function checkModel(): Promise<{
  status: ModelStatus;
  inputs: ExpectedInput[] | null;
}> {
  if (typeof globalThis.LanguageModel === 'undefined')
    return { status: 'unsupported', inputs: null };

  let best: { status: ModelStatus; inputs: ExpectedInput[] } | null = null;

  for (const inputs of INPUT_SETS) {
    let status: ModelStatus;
    try {
      status = normalizeStatus(await globalThis.LanguageModel.availability(sessionOptions(inputs)));
    } catch {
      // 지원하지 않는 언어를 선언하면 던지는 경우가 있다. 다음 후보로 넘어간다.
      continue;
    }
    if (status === 'available') return { status, inputs };
    if (status !== 'unavailable' && !best) best = { status, inputs };
  }

  if (best) return best;
  return { status: 'unavailable', inputs: null };
}

const READING_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    subtitle: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['name', 'subtitle', 'description'],
  additionalProperties: false,
} as const;

/**
 * 지시문은 영어로 쓴다. 모델이 공식 지원하는 언어라 지시를 덜 흘린다.
 * 읽어야 할 글자가 한국어라는 것과, 번역하지 말고 본 대로 옮기라는 것만 분명히 한다.
 */
const INSTRUCTION = [
  'This is a screenshot of an item tooltip from the Korean game Mabinogi.',
  'Transcribe the Korean text exactly as it appears. Do not translate it.',
  'Do not add words that are not in the image.',
  '',
  'name: the item name on the first line. Keep any quotation marks that are part of the name.',
  'subtitle: the small grey line right under the name. Empty string if there is none.',
  'description: the body text under the orange "아이템 설명" heading, as one line.',
  'Leave out the shop price line and any durability or repair note.',
].join('\n');

export interface ReadTooltipOptions {
  signal?: AbortSignal;
  /** 모델을 내려받는 중이면 0 에서 1 사이 진행률이 흘러 들어온다. */
  onDownloadProgress?: (loaded: number) => void;
}

function parseReading(raw: string): TooltipReading {
  // responseConstraint 를 걸어도 코드 펜스를 씌워 오는 크롬 빌드가 있다.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/, '')
    .trim();
  const parsed = JSON.parse(cleaned) as Partial<TooltipReading>;

  return {
    name: (parsed.name ?? '').trim(),
    subtitle: (parsed.subtitle ?? '').trim(),
    description: (parsed.description ?? '').replace(/\s+/g, ' ').trim(),
  };
}

/**
 * 툴팁을 잘라낸 이미지 한 장을 모델에 넘기고 이름·한 줄 설명·본문을 받는다.
 *
 * 세션은 매번 새로 만들고 끝나면 버린다. 붙여 넣기 사이에 문맥이 남으면 앞 아이템의
 * 이름이 다음 결과에 섞인다.
 */
export async function readTooltip(
  image: Blob | ImageData | HTMLCanvasElement,
  options: ReadTooltipOptions = {},
): Promise<TooltipReading> {
  const api = globalThis.LanguageModel;
  if (!api)
    throw new Error('이 브라우저에는 크롬 내장 모델이 없습니다. 크롬 138 이상에서 열어 주세요.');

  const { status, inputs } = await checkModel();
  if (!inputs || status === 'unavailable') {
    throw new Error(
      '크롬 내장 모델이 이 기기에서 이미지를 받지 못합니다. 저장 공간과 chrome://on-device-internals 를 확인해 주세요.',
    );
  }

  const session = await api.create({
    ...sessionOptions(inputs),
    signal: options.signal,
    monitor(monitor: EventTarget) {
      monitor.addEventListener('downloadprogress', (event) => {
        options.onDownloadProgress?.((event as ProgressEvent & { loaded: number }).loaded);
      });
    },
  });

  try {
    const raw = await session.prompt(
      [
        {
          role: 'user',
          content: [
            { type: 'text', value: INSTRUCTION },
            { type: 'image', value: image },
          ],
        },
      ],
      { responseConstraint: READING_SCHEMA, signal: options.signal },
    );

    try {
      return parseReading(raw);
    } catch {
      // 스키마를 어기고 그냥 문장을 뱉는 경우. 통째로 설명에 넣고 사람이 나누게 둔다.
      return { name: '', subtitle: '', description: raw.trim() };
    }
  } finally {
    session.destroy();
  }
}
