/**
 * 공개된 게임 리소스 묶음을 받아 푸는 공용 코드.
 *
 * 리소스 묶음은 protobuf 바이너리이고 스키마는 따로 공개돼 있지 않다. 그 도구의 번들 안에
 * protobuf-ts 가 만든 메시지 정의가 그대로 들어 있어서, 번들을 받아 필드 목록을 읽고 그것으로
 * 바이너리를 푼다. 자세한 사정은 build-recipes.mjs 머리말에 있다.
 */
import { brotliDecompressSync } from 'node:zlib';

const SITE = 'https://prilus.gitlab.io/';
export const RESOURCE_ORIGIN = 'https://mabires.pril.cc/';

async function fetchOk(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response;
}

/** 번들에서 메시지 정의를 모두 읽는다. 이름 -> 필드 목록. */
function extractSchemas(bundle) {
  const pattern = /([\w$]+)=new class extends [\w$]+\{constructor\(\)\{super\(`([^`]+)`,\[/g;
  const schemas = {};
  const nameOfVar = {};
  // 필드 목록 안의 T:()=>Xy 는 다른 메시지 변수를 가리킨다. 없는 이름은 이름 문자열로 돌려받는다.
  const scope = new Proxy(
    {},
    { has: () => true, get: (_target, key) => (typeof key === 'string' ? key : undefined) },
  );
  let match;
  while ((match = pattern.exec(bundle))) {
    const start = pattern.lastIndex - 1;
    let depth = 0;
    let end = start;
    for (; end < bundle.length; end += 1) {
      if (bundle[end] === '[') depth += 1;
      else if (bundle[end] === ']' && --depth === 0) break;
    }
    const fields = new Function(
      'scope',
      `with (scope) { return ${bundle.slice(start, end + 1)}; }`,
    )(scope);
    nameOfVar[match[1]] = match[2];
    schemas[match[2]] = fields;
  }
  const messageOf = (T) => {
    const target = T();
    return Array.isArray(target) ? target[0] : (nameOfVar[target] ?? target);
  };
  for (const fields of Object.values(schemas)) {
    for (const field of fields) {
      if (field.kind === 'message') field.message = messageOf(field.T);
      if (field.kind === 'map' && field.V.kind === 'message')
        field.V.message = messageOf(field.V.T);
    }
  }
  // 변수 이름은 배포마다 바뀐다. 제작법 목록을 필드로 가진 메시지가 리소스 묶음 전체다.
  const root = Object.keys(schemas).find((name) =>
    schemas[name].some((field) => field.name === 'ProductionList'),
  );
  if (!root) throw new Error('리소스 묶음 메시지를 찾지 못했습니다.');
  return { schemas, root };
}

/** protobuf 바이너리를 스키마대로 푸는 최소한의 읽개. 필요한 스칼라 종류만 다룬다. */
function decode(buffer, schemas, rootName) {
  // varint() 가 pos 를 옮긴다. `pos + Number(varint())` 처럼 한 식에 섞으면 옮기기 전 pos 를 읽으므로
  // 길이는 언제나 먼저 읽어 두고 더한다.
  let pos = 0;
  const varint = () => {
    let result = 0n;
    let shift = 0n;
    for (;;) {
      const byte = buffer[pos++];
      result |= BigInt(byte & 127) << shift;
      if (!(byte & 128)) return result;
      shift += 7n;
    }
  };
  const scalar = (T) => {
    switch (T) {
      case 1: {
        const v = buffer.readDoubleLE(pos);
        pos += 8;
        return v;
      }
      case 2: {
        const v = buffer.readFloatLE(pos);
        pos += 4;
        return v;
      }
      case 7: {
        const v = buffer.readUInt32LE(pos);
        pos += 4;
        return v;
      }
      case 15: {
        const v = buffer.readInt32LE(pos);
        pos += 4;
        return v;
      }
      case 6:
      case 16: {
        const v = buffer.readBigInt64LE(pos);
        pos += 8;
        return Number(v);
      }
      case 8:
        return varint() !== 0n;
      case 9: {
        const n = Number(varint());
        const v = buffer.toString('utf8', pos, pos + n);
        pos += n;
        return v;
      }
      case 12: {
        const n = Number(varint());
        pos += n;
        return null;
      }
      case 5:
        return Number(BigInt.asIntN(32, varint()));
      case 3:
        return Number(BigInt.asIntN(64, varint()));
      case 17:
      case 18: {
        const v = varint();
        return Number((v >> 1n) ^ -(v & 1n));
      }
      default:
        return Number(varint());
    }
  };
  const skip = (wireType) => {
    if (wireType === 0) varint();
    else if (wireType === 1) pos += 8;
    else if (wireType === 2) {
      const n = Number(varint());
      pos += n;
    } else if (wireType === 5) pos += 4;
    else throw new Error(`알 수 없는 wire type ${wireType}`);
  };
  const message = (length, name) => {
    const fields = schemas[name];
    if (!fields) throw new Error(`스키마 없음: ${name}`);
    const byNumber = Object.fromEntries(fields.map((field) => [field.no, field]));
    const out = {};
    const end = pos + length;
    while (pos < end) {
      const tag = Number(varint());
      const field = byNumber[tag >>> 3];
      const wireType = tag & 7;
      if (!field) {
        skip(wireType);
        continue;
      }
      if (field.kind === 'message') {
        const value = message(Number(varint()), field.message);
        if (field.repeat) (out[field.name] ??= []).push(value);
        else out[field.name] = value;
      } else if (field.kind === 'map') {
        const entryLength = Number(varint());
        const entryEnd = pos + entryLength;
        let key;
        let value;
        while (pos < entryEnd) {
          const entryTag = Number(varint());
          if (entryTag >>> 3 === 1) key = scalar(field.K);
          else
            value =
              field.V.kind === 'message'
                ? message(Number(varint()), field.V.message)
                : scalar(field.V.T ?? 5);
        }
        (out[field.name] ??= {})[key] = value;
      } else {
        const T = field.kind === 'enum' ? 5 : field.T;
        if (field.repeat && wireType === 2 && T !== 9 && T !== 12) {
          const packedLength = Number(varint());
          const packedEnd = pos + packedLength;
          const list = (out[field.name] ??= []);
          while (pos < packedEnd) list.push(scalar(T));
        } else {
          const value = scalar(T);
          if (field.repeat) (out[field.name] ??= []).push(value);
          else out[field.name] = value;
        }
      }
    }
    return out;
  };
  return message(buffer.length, rootName);
}

/** 리소스 묶음 전체와 그 버전(만든 날짜). region 은 'kr'. */
export async function loadResourceData(region = 'kr') {
  const html = await (await fetchOk(SITE)).text();
  const entry = html.match(/src="\/?(assets\/index-[\w-]+\.js)"/)?.[1];
  if (!entry) throw new Error('첫 화면에서 번들 주소를 찾지 못했습니다.');
  const bundle = await (await fetchOk(new URL(entry, SITE))).text();
  const { schemas, root } = extractSchemas(bundle);
  const version = await (
    await fetchOk(`${RESOURCE_ORIGIN}resourceversion/${region}/${region}_resourceversion.json`)
  ).json();
  const packed = Buffer.from(
    await (
      await fetchOk(`${RESOURCE_ORIGIN}resourcedata/${region}/${region}_resourcedata.bin.br`)
    ).arrayBuffer(),
  );
  const data = decode(brotliDecompressSync(packed), schemas, root);
  const updated = new Date(version.CreatedAt * 1000).toISOString().slice(0, 10);
  return { data, updated };
}

/** 문자열 표에서 글을 찾는 함수. 없는 키(not found key)는 빈 문자열이다. */
export function stringLookup(data) {
  const strings = new Map(data.StringTable.map((entry) => [entry.Id, entry.Str]));
  return (key) => {
    const value = strings.get(key);
    return value && !value.startsWith('not found key') ? value : '';
  };
}
