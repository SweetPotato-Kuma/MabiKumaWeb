import { test } from 'vitest';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { publishedGameData } from './published-game-data.mjs';

test('한 게시본의 해시를 확인하고 검증된 객체만 캐시한다', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'mabikuma-build-'));
  const bytes = Buffer.from('{"new":true}');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const manifest = {
    schema: 1,
    revision: sha256,
    files: {
      'arcana.json': { key: `game-data/objects/${sha256}.js`, sha256, bytes: bytes.length },
    },
  };
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url);
    return new Response(url.endsWith('manifest.json') ? JSON.stringify(manifest) : bytes);
  };
  try {
    const published = await publishedGameData(fetcher, dir);
    assert.deepEqual(await published.read('arcana.json'), { new: true });
    await published.read('arcana.json');
    assert.equal(urls.length, 2);
    await assert.rejects(published.read('missing.json'), /게시 목록/);
    await writeFile(resolve(dir, 'objects', `${sha256}.json`), '{}');
    assert.deepEqual(await published.read('arcana.json'), { new: true });
    assert.equal(urls.length, 3);
    const broken = await publishedGameData(
      async (url) => new Response(url.endsWith('manifest.json') ? JSON.stringify(manifest) : '{}'),
      resolve(dir, 'broken'),
    );
    await assert.rejects(broken.read('arcana.json'), /해시/);
    await assert.rejects(
      publishedGameData(async () => new Response('', { status: 503 }), dir),
      /HTTP 503/,
    );
  } finally {
    assert.ok(
      dir.startsWith(resolve(tmpdir(), 'mabikuma-build-')) &&
        dir.startsWith(resolve(tmpdir()) + sep),
    );
    await rm(dir, { recursive: true, force: true });
  }
});
