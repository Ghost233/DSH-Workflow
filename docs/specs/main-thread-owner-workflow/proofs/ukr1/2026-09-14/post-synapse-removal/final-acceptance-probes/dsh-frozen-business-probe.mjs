import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { test, after } from 'node:test';

// Diagnostic only: execute frozen candidate code without modifying it or live state.
const root = '/Volumes/LargeStorage/code/DSH-Workflow/.dsh-workflow/artifacts/';
const panel = root + 'act-297d38c9e886cb3c02ccd27195c3085937b6c73e/tree/';
const worker = root + 'act-6ff11bf4359f475bb029ad37b713c333c628054a/tree/';
const scratch = await mkdtemp('/private/tmp/dsh-business-probe-');
after(() => rm(scratch, { recursive: true }));
let fetchCalls = 0;
globalThis.fetch = async () => { fetchCalls++; throw new Error('External network forbidden in diagnostic'); };

const inputs = {};
async function source(base, path) {
  const text = await readFile(base + path, 'utf8');
  inputs[path] = createHash('sha256').update(text).digest('hex');
  return text;
}
for (const [path, name] of [['worker/families.ts', 'families'], ['worker/local-acceptance.ts', 'local-acceptance'], ['src/proto/aa-bb.ts', 'aa-bb']]) {
  const text = await source(worker, path);
  const transformed = stripTypeScriptTypes(text, { mode: 'strip' }).replace('from "./families"', 'from "./families.mjs"');
  await writeFile(`${scratch}/${name}.mjs`, transformed);
}
const { handleLocalAcceptanceRoute } = await import(pathToFileURL(`${scratch}/local-acceptance.mjs`).href);
const { AaBbFrameReader } = await import(pathToFileURL(`${scratch}/aa-bb.mjs`).href);
const panelText = await source(panel, 'src/panel/views/MarketView.tsx');
const startMarker = '    onCommit: (ids) => {';
const endMarker = '\n    },\n    listRef,';
assert.equal(panelText.split(startMarker).length, 2, 'exactly one real onCommit callback');
const start = panelText.indexOf(startMarker) + startMarker.length;
const end = panelText.indexOf(endMarker, start);
assert.ok(end > start);
const callbackBody = stripTypeScriptTypes(`function commit(ids) {${panelText.slice(start, end)}\n}`, { mode: 'strip' });
console.log('Frozen source SHA256:', JSON.stringify(inputs));

test('Panel overlapping writes retain acknowledged A when later B fails', async () => {
  const initial = ['a', 'b', 'c'], orderA = ['b', 'a', 'c'], orderB = ['c', 'b', 'a'];
  let visible = initial;
  const committedOrderRef = { current: initial }, orderWriteRef = { current: 0 };
  const pending = [];
  const commit = new Function('committedOrderRef', 'orderWriteRef', 'setOrderError', 'setOrderIds', 'uploadWatchOrder', 'writeWatchOrder', 'i18n', `${callbackBody}; return commit`)(
    committedOrderRef, orderWriteRef, () => {}, ids => { visible = ids; },
    () => new Promise(resolve => pending.push(resolve)), () => {}, { t: text => text });
  commit(orderA); commit(orderB);
  pending[0](true);
  await new Promise(resolve => setImmediate(resolve));
  pending[1](false);
  await new Promise(resolve => setImmediate(resolve));
  console.log('Panel acknowledged order:', orderA, 'actual UI rollback:', visible);
  assert.deepEqual(visible, orderA, 'UI must retain the last server-acknowledged order');
});

test('Worker local stream can be decoded by the real production frame reader', async () => {
  const url = new URL('http://local.invalid/api/token-list/conso/coinhub/v2/token/list/stream');
  const response = handleLocalAcceptanceRoute(new Request(url), { LOCAL_ACCEPTANCE: 'true' }, url);
  assert.equal(response.status, 200);
  const reader = new AaBbFrameReader(), frames = [];
  const body = new Uint8Array(await response.arrayBuffer());
  console.log('Worker stream content type:', response.headers.get('content-type'), 'bytes:', body.length);
  reader.feed(body, frame => frames.push(frame));
  reader.finish();
  assert.ok(frames.length > 0, 'consumer must receive at least one valid protocol frame');
});

test('Control: local gate is opt-in and probing performs no external fetch', () => {
  const url = new URL('http://local.invalid/api/token-list/conso/coinhub/v2/token/list/stream');
  assert.equal(handleLocalAcceptanceRoute(new Request(url), {}, url), null);
  assert.equal(fetchCalls, 0);
});
