import '../../scripts/harness-test-loader.mjs'
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
const { default: JevCenter } = await import('../src/jev-center-plugin.mjs')

const req = createRequire(new URL('../../deepseek-harness/apps/cli/package.json', import.meta.url))
const { boot, initProfile, readProfilePatches } = req('@deepseek-ai/dsh-app-boot')
const ConfigEditor = req('@deepseek-ai/dsh-config-editor').default
const Settings = req('@deepseek-ai/dsh-settings').default
const Credentials = req('@deepseek-ai/dsh-credentials-local').default
const WebServer = req('@deepseek-ai/dsh-host-webserver').default
const TypertRegistry = req('@deepseek-ai/dsh-typert-registry').default
const TypertGateway = req('@deepseek-ai/dsh-api-gateway').default
const browserReq = createRequire(new URL('../../deepseek-harness/packages/test-support/client-runtime/package.json', import.meta.url))
const { JSDOM } = browserReq('jsdom')
const { getQueriesForElement, fireEvent, waitFor } = browserReq('@testing-library/dom')

async function fixture(t, respond = (_, res) => {
  res.end(JSON.stringify({ model: 'jev-resolved-version', answers: { urgent: { type: 'noul', noul: 0.9 } }, usage: { input_tokens: 20, output_tokens: 1 } }))
}) {
  const root = await mkdtemp(join(tmpdir(), 'jev-center-host-'))
  const dir = join(root, 'profiles/test'), bundle = join(dir, 'node_modules/jev-center-fixture')
  const requests = []
  const upstream = createServer(async (request, response) => {
    const chunks = []; for await (const chunk of request) chunks.push(chunk)
    const received = { path: request.url, method: request.method, authorization: request.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString()) }
    requests.push(received)
    response.setHeader('content-type', 'application/json'); respond(received, response)
  })
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  initProfile(dir, ['jev-center-fixture'])
  await mkdir(bundle, { recursive: true })
  await writeFile(join(root, 'package.json'), '{"name":"jev-center-test"}')
  await writeFile(join(bundle, 'package.json'), JSON.stringify({ name: 'jev-center-fixture', version: '1.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } } }))
  await writeFile(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' }, { id: 'settings', name: 'cordis:settings' },
    { id: 'credentials', name: 'cordis:credentials', config: { path: join(root, '.credentials.yaml'), watch: false } },
    { id: 'webserver', name: 'cordis:webserver', config: { host: '127.0.0.1', port: 0 } },
    { id: 'jev-center', name: 'cordis:jev-center' },
  ] }]))
  await writeFile(join(dir, 'cordis.yml'), '[]\n')
  const profile = { name: 'test', startedBundles: ['jev-center-fixture'], dir, patchPath: join(dir, 'cordis.patch.yml'), installAnchor: join(root, 'package.json'), cwd: root, home: root, overlays: [] }
  let ctx
  const start = async () => boot('jev-center-test', join(dir, 'cordis.yml'), readProfilePatches('test', profile), c => {
    c.provide('profileContext', profile)
    c.provide('appReady', { onReady: listener => { listener(); return () => {} } })
    Object.assign(c.loader.builtins, { editor: ConfigEditor, settings: Settings, credentials: Credentials, webserver: WebServer, 'jev-center': JevCenter })
  })
  t.after(async () => { await ctx?.fiber.dispose(); upstream.closeAllConnections(); await new Promise(resolve => upstream.close(resolve)); await rm(root, { recursive: true, force: true }) })
  ctx = await start()
  const engine = { url: `http://127.0.0.1:${upstream.address().port}`, upstreamModel: 'jev-latest', credentialRef: 'JEV_CENTER_TEST_KEY', enabled: true }
  return { get ctx() { return ctx }, root, requests, engine,
    async save(config = {}) { await ctx.settings.update('jev-center', { engines: [{ ...engine, ...config }] }) },
    async saveMany(engines) { await ctx.settings.update('jev-center', { engines }) },
    async restart() { await ctx.fiber.dispose(); ctx = await start() }, baseUrl: `http://127.0.0.1:${ctx.webServer.port}` }
}

const question = { state: 'Please fix this today.', questions: { urgent: { type: 'noul', instructions: 'Is this urgent?' } } }

test('native Remote connection test uses the same fixed judgment without an HTTP-only UI route', async t => {
  const f = await fixture(t, (_, response) => response.end(JSON.stringify({
    model: 'jev-remote-version', answers: { connectivity: { type: 'noul', noul: 1 } },
    usage: { input_tokens: 5, output_tokens: 1 },
  })))
  await f.save({ modelName: 'quick' })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'remote-fixture-key')
  await f.ctx.plugin(TypertRegistry)
  await f.ctx.plugin(TypertGateway)
  const result = await f.ctx.typertGateway.invoke({ namespace: 'jevCenter', method: 'testConnection', args: { modelName: 'quick' } })
  assert.equal(result.ok, true)
  assert.equal(result.model, 'jev-remote-version')
  assert.equal(typeof result.elapsedMs, 'number')
  assert.equal(f.requests.length, 1)
  assert.deepEqual(f.requests[0].body, { model: 'jev-latest', state: 'The light is on.',
    questions: { connectivity: { type: 'noul', instructions: 'Is the light on?' } } })
  await assert.rejects(f.ctx.typertGateway.invoke({ namespace: 'jevCenter', method: 'testConnection', args: { modelName: 42 } }))
  assert.equal(f.requests.length, 1)
})

test('standard Settings and credentials save an engine without a model call, then a named consumer receives its typed judgment', async t => {
  const f = await fixture(t)
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'test-secret-key')
  await f.save({ modelName: 'quick' })
  assert.equal(f.requests.length, 0)
  const descriptor = f.ctx.settings.describe({ redactSecrets: true }).find(row => row.ns === 'jev-center')
  assert.equal(descriptor.value.engines[0].credentialRef, 'JEV_CENTER_TEST_KEY')
  assert.equal(descriptor.value.engines[0].timeoutMs, 5000)
  assert.equal(JSON.stringify(descriptor).includes('test-secret-key'), false)
  await f.restart()
  const result = await f.ctx.get('jevCenter').evaluate('quick', question)
  assert.deepEqual(result.answers, { urgent: { type: 'noul', noul: 0.9 } })
  assert.equal(result.ok, true)
  assert.equal(result.model, 'jev-resolved-version')
  assert.ok(result.elapsedMs >= 0)
  assert.deepEqual(f.requests[0], { path: '/v1/systemone', method: 'POST', authorization: 'Bearer test-secret-key', body: { ...question, model: 'jev-latest' } })
  assert.equal((await readFile(join(f.root, 'profiles/test/cordis.patch.yml'), 'utf8')).includes('test-secret-key'), false)
})

test('the JEV page saves through standard Settings and credentials and tests a fixed question with resolved model and elapsed time', async t => {
  const f = await fixture(t, (received, response) => {
    response.end(JSON.stringify({ model: 'jev-connection-version', answers: { connectivity: { type: 'noul', noul: 1 } }, usage: { input_tokens: 5, output_tokens: 1 } }))
  })
  const page = await fetch(`${f.baseUrl}/jev-center`).then(response => response.text())
  assert.match(page, /测试连接/)
  assert.match(page, /凭据引用/)
  const put = (path, body) => fetch(`${f.baseUrl}/jev-center/api/${path}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal((await put('credential', { ref: 'JEV_CENTER_TEST_KEY', value: 'page-secret' })).status, 200)
  assert.equal((await put('config', { engines: [f.engine] })).status, 200)
  assert.equal((await f.ctx.credentials.resolve('JEV_CENTER_TEST_KEY')).value, 'page-secret')
  assert.equal(f.ctx.settings.describe().find(row => row.ns === 'jev-center').value.engines[0].url, f.engine.url)
  assert.equal(f.requests.length, 0)
  const descriptor = await fetch(`${f.baseUrl}/jev-center/api/config`).then(response => response.json())
  assert.equal(JSON.stringify(descriptor).includes('page-secret'), false)
  const result = await fetch(`${f.baseUrl}/jev-center/api/test`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modelName: 'jev-latest', state: 'private conversation must not be sent' }) }).then(response => response.json())
  assert.equal(result.ok, true)
  assert.equal(result.model, 'jev-connection-version')
  assert.ok(Number.isFinite(result.elapsedMs))
  assert.deepEqual(f.requests[0].body, { model: 'jev-latest', state: 'The light is on.', questions: { connectivity: { type: 'noul', instructions: 'Is the light on?' } } })
  assert.equal(JSON.stringify(result).includes('page-secret'), false)
})

test('missing or disabled engines and missing credentials return distinct errors without calling upstream', async t => {
  const f = await fixture(t), center = f.ctx.get('jevCenter')
  assert.equal((await center.evaluate('absent', question)).error.code, 'ENGINE_MISSING')
  await f.save({ enabled: false })
  assert.equal((await center.evaluate('jev-latest', question)).error.code, 'ENGINE_DISABLED')
  await f.save()
  assert.equal((await center.evaluate('jev-latest', question)).error.code, 'CREDENTIAL_MISSING')
  assert.equal(f.requests.length, 0)
})

test('upstream authentication, invalid-request and service failures produce safe distinct errors without retries', async t => {
  const f = await fixture(t, (received, response) => { response.statusCode = Number(received.body.state); response.end(JSON.stringify({ error: 'Authorization: Bearer failure-secret-key' })) })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'failure-secret-key'); await f.save()
  for (const [status, code] of [[401, 'AUTHENTICATION_FAILED'], [403, 'AUTHENTICATION_FAILED'], [422, 'UPSTREAM_REQUEST_REJECTED'], [429, 'UPSTREAM_UNAVAILABLE'], [500, 'UPSTREAM_UNAVAILABLE'], [529, 'UPSTREAM_UNAVAILABLE']]) {
    const result = await f.ctx.get('jevCenter').evaluate('jev-latest', { ...question, state: String(status) })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, code)
    assert.equal(JSON.stringify(result).includes('failure-secret-key'), false)
    assert.equal(JSON.stringify(result).includes('Authorization'), false)
  }
  assert.equal(f.requests.length, 6)
})

test('invalid or incomplete upstream judgments are reported without exposing response text', async t => {
  const valid = { model: 'jev-version', answers: { urgent: { type: 'noul', noul: 0.5 } }, usage: { input_tokens: 5, output_tokens: 1 } }
  const bodies = ['not JSON Authorization: invalid-answer-secret', { ...valid, answers: {} }, { ...valid, answers: { urgent: { type: 'noul', noul: 1.2 } } }, { ...valid, answers: { urgent: { type: 'choice', noul: 0.5 } } }, { ...valid, model: undefined }, { ...valid, usage: { input_tokens: -1, output_tokens: 1 } }]
  const f = await fixture(t, (received, response) => { const body = bodies[Number(received.body.state)]; response.end(typeof body === 'string' ? body : JSON.stringify(body)) })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'invalid-answer-secret'); await f.save()
  for (let i = 0; i < bodies.length; i++) {
    const result = await f.ctx.get('jevCenter').evaluate('jev-latest', { ...question, state: String(i) })
    assert.equal(result.error.code, 'INVALID_RESPONSE')
    assert.equal(JSON.stringify(result).includes('invalid-answer-secret'), false)
  }
  assert.equal(f.requests.length, bodies.length)
})

test('a stalled JEV response times out on its configured deadline without aborting its caller or retrying', async t => {
  const f = await fixture(t, (_, response) => { response.writeHead(200); response.flushHeaders() })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'timeout-secret'); await f.save({ timeoutMs: 35 })
  const caller = new AbortController()
  const result = await Promise.race([
    f.ctx.get('jevCenter').evaluate('jev-latest', question, { signal: caller.signal }),
    new Promise(resolve => { const timeout = setTimeout(() => resolve({ error: { code: 'NOT_BOUNDED' } }), 1000); timeout.unref() }),
  ])
  assert.equal(result.error.code, 'TIMEOUT')
  assert.equal(caller.signal.aborted, false)
  assert.equal(f.requests.length, 1)
})

test('one named request supports official Choice, Score and Noul questions with typed returned distributions', async t => {
  const answers = {
    route: { type: 'choice', choice: 'normal', probabilities: { anomaly: 0.05, normal: 0.9, unknown: 0.05 }, confidence: 0.8 },
    progress: { type: 'score', score: 1.2, legend: { '0': 'none', '1': 'some', '2': 'complete' }, probabilities: { '0': 0, '1': 0.8, '2': 0.2 }, confidence: 0.7 },
    urgent: { type: 'noul', noul: 0.9 },
  }
  const f = await fixture(t, (_, response) => response.end(JSON.stringify({ model: 'jev-resolved', answers, usage: { input_tokens: 40, output_tokens: 8 } })))
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'all-types-secret'); await f.save()
  const request = { state: { task: 'Investigate new hypothesis' }, questions: {
    route: { type: 'choice', instructions: { question: 'Classify progress' }, criteria: { anomaly: 'Repeated analysis', normal: 'New evidence', unknown: 'Insufficient context' } },
    progress: { type: 'score', instructions: 'Rate progress', criteria: ['none', 'some', 'complete'] },
    urgent: question.questions.urgent,
  } }
  const result = await f.ctx.get('jevCenter').evaluate('jev-latest', request)
  assert.equal(result.ok, true)
  assert.deepEqual(result.answers, answers)
  assert.deepEqual(f.requests[0].body, { ...request, model: 'jev-latest' })
})

test('upstream credential echoes in successful metadata never appear in consumer or connection-test results', async t => {
  const f = await fixture(t, (received, response) => {
    response.end(JSON.stringify({ model: 'jev-version leaked-secret', answers: Object.fromEntries(Object.keys(received.body.questions).map(id => [id, { type: 'noul', noul: 1 }])), usage: { input_tokens: 5, output_tokens: 1 } }))
  })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'leaked-secret'); await f.save()
  for (const result of [await f.ctx.get('jevCenter').evaluate('jev-latest', question), await f.ctx.get('jevCenter').testConnection('jev-latest')]) {
    assert.equal(result.error.code, 'INVALID_RESPONSE')
    assert.equal(JSON.stringify(result).includes('leaked-secret'), false)
  }
})

test('a configured full System One URL is used without duplicating its endpoint path', async t => {
  const f = await fixture(t)
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'endpoint-secret'); await f.save({ url: `${f.engine.url}/v1/systemone` })
  assert.equal((await f.ctx.get('jevCenter').evaluate('jev-latest', question)).ok, true)
  assert.equal(f.requests[0].path, '/v1/systemone')
})

test('the configuration page rejects unusable model, credential-reference, URL and timeout settings before storing them', async t => {
  const f = await fixture(t)
  for (const patch of [{ upstreamModel: '' }, { credentialRef: 'not a credential reference' }, { url: 'ftp://example.test' }, { timeoutMs: 1.5 }]) {
    const response = await fetch(`${f.baseUrl}/jev-center/api/config`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ engines: [{ ...f.engine, ...patch }] }) })
    assert.equal(response.status, 400)
    assert.deepEqual(f.ctx.settings.describe().find(row => row.ns === 'jev-center').value.engines, [])
  }
  assert.equal(f.requests.length, 0)
})

test('consumer cancellation stops only its own JEV request and does not trigger retries', async t => {
  const cancellation = new AbortController(), observedAgent = new AbortController()
  const f = await fixture(t, (_, response) => { response.writeHead(200); response.flushHeaders(); cancellation.abort() })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'cancellation-secret'); await f.save()
  const result = await f.ctx.get('jevCenter').evaluate('jev-latest', question, { signal: cancellation.signal })
  assert.equal(result.error.code, 'CANCELLED')
  assert.equal(observedAgent.signal.aborted, false)
  assert.equal(f.requests.length, 1)
})

test('invalid Choice distributions and Score ranges cannot become valid judgments', async t => {
  const choice = { type: 'choice', choice: 'normal', probabilities: { anomaly: 0.1, normal: 0.9 }, confidence: 0.8 }
  const score = { type: 'score', score: 0.5, legend: { '0': 'none', '1': 'progress' }, probabilities: { '0': 0.5, '1': 0.5 }, confidence: 0.5 }
  const answers = [
    { route: { ...choice, choice: 'undefined-option' }, progress: score },
    { route: { ...choice, probabilities: { anomaly: 0.1 } }, progress: score },
    { route: { ...choice, probabilities: { anomaly: 0.5, normal: 0.9 } }, progress: score },
    { route: choice, progress: { ...score, score: 4 } },
    { route: choice, progress: { ...score, confidence: -1 } },
    { route: choice, progress: { ...score, legend: {} } },
  ]
  const f = await fixture(t, (received, response) => response.end(JSON.stringify({ model: 'jev-version', answers: answers[Number(received.body.state)], usage: { input_tokens: 40, output_tokens: 8 } })))
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'invalid-types-secret'); await f.save()
  for (let i = 0; i < answers.length; i++) {
    const result = await f.ctx.get('jevCenter').evaluate('jev-latest', { state: String(i), questions: {
      route: { type: 'choice', instructions: 'Classify', criteria: { anomaly: 'repetition', normal: 'new evidence' } },
      progress: { type: 'score', instructions: 'Rate', criteria: ['none', 'progress'] },
    } })
    assert.equal(result.error.code, 'INVALID_RESPONSE')
  }
})

test('standard Settings rejects duplicate enabled callable names on creation, enable and rename before changing stored configuration', async t => {
  const f = await fixture(t)
  const first = { ...f.engine, modelName: 'quick' }, second = { ...f.engine, modelName: 'full', enabled: false }
  await f.saveMany([first, second])
  const saved = await readFile(join(f.root, 'profiles/test/cordis.patch.yml'), 'utf8')
  for (const engines of [
    [first, second, { ...f.engine, modelName: 'quick' }],
    [first, { ...second, modelName: 'quick', enabled: true }],
    [{ ...first, modelName: '' }, { ...second, modelName: '', enabled: true }],
  ]) {
    await assert.rejects(f.saveMany(engines), /调用模型名.*重复/)
    assert.equal(await readFile(join(f.root, 'profiles/test/cordis.patch.yml'), 'utf8'), saved)
    assert.deepEqual(f.ctx.get('jevCenter').describe().map(engine => [engine.modelName, engine.enabled]), [['quick', true], ['full', false]])
  }
})

test('a disabled configuration with the same label does not hide the uniquely enabled named engine', async t => {
  const f = await fixture(t)
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'routing-key')
  await f.saveMany([{ ...f.engine, modelName: 'quick', upstreamModel: 'disabled-upstream', enabled: false },
    { ...f.engine, modelName: 'quick', upstreamModel: 'active-upstream' }])
  const result = await f.ctx.get('jevCenter').evaluate('quick', question)
  assert.equal(result.ok, true)
  assert.equal(f.requests[0].body.model, 'active-upstream')
})

test('the standalone center page manages multiple configurations and tests the selected saved engine', async t => {
  const f = await fixture(t, (received, response) => response.end(JSON.stringify({ model: `resolved-${received.body.model}`,
    answers: { connectivity: { type: 'noul', noul: 1 } }, usage: { input_tokens: 5, output_tokens: 1 } })))
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'page-first-key')
  await f.save({ modelName: 'quick', upstreamModel: 'first-upstream' })
  const dom = new JSDOM(await fetch(`${f.baseUrl}/jev-center`).then(response => response.text()), {
    url: `${f.baseUrl}/jev-center`, runScripts: 'dangerously',
    beforeParse(window) { window.fetch = (url, options) => fetch(new URL(url, f.baseUrl), options) },
  })
  t.after(() => dom.window.close())
  const ui = getQueriesForElement(dom.window.document.body)
  await waitFor(() => assert.equal(ui.getByLabelText('调用模型名').value, 'quick'), { container: dom.window.document })
  fireEvent.click(ui.getByRole('button', { name: '新增配置' }))
  ui.getByLabelText('服务 URL').value = f.engine.url
  ui.getByLabelText('上游模型名').value = 'second-upstream'
  ui.getByLabelText('调用模型名').value = 'full'
  fireEvent.submit(dom.window.document.querySelector('#config'))
  await waitFor(() => assert.equal(f.ctx.get('jevCenter').describe().length, 2), { container: dom.window.document })
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /配置已保存/), { container: dom.window.document })
  assert.equal(f.ctx.get('jevCenter').describe()[0].modelName, 'quick')
  ui.getByLabelText('凭据引用').value = 'JEV_CENTER_TEST_KEY'
  fireEvent.submit(dom.window.document.querySelector('#config'))
  await waitFor(() => assert.equal(f.ctx.get('jevCenter').describe()[1].credentialRef, 'JEV_CENTER_TEST_KEY'), { container: dom.window.document })
  fireEvent.click(ui.getByRole('button', { name: '测试连接' }))
  await waitFor(() => assert.match(ui.getByRole('status').textContent, /resolved-second-upstream/), { container: dom.window.document })
  fireEvent.change(ui.getByLabelText('JEV 引擎配置列表'), { target: { value: '0' } })
  assert.equal(ui.getByLabelText('调用模型名').value, 'quick')
  fireEvent.click(ui.getByRole('button', { name: '删除配置' }))
  await waitFor(() => assert.equal(f.ctx.get('jevCenter').describe().length, 1), { container: dom.window.document })
  assert.equal(f.ctx.get('jevCenter').describe()[0].modelName, 'full')
  assert.equal((await f.ctx.credentials.describe('JEV_CENTER_TEST_KEY')).configured, true)
})

test('parallel named consumers choose independent URLs and credentials even when upstream model names are equal', async t => {
  const first = await fixture(t, (_, response) => response.end(JSON.stringify({ model: 'resolved-first', answers: { urgent: { type: 'noul', noul: 0.1 } }, usage: { input_tokens: 5, output_tokens: 1 } })))
  const second = await fixture(t, (received, response) => response.end(JSON.stringify({ model: 'resolved-second', answers: Object.fromEntries(Object.keys(received.body.questions).map(id => [id, { type: 'noul', noul: 0.9 }])), usage: { input_tokens: 5, output_tokens: 1 } })))
  await first.ctx.credentials.set('JEV_FIRST_KEY', 'first-private-key')
  await first.ctx.credentials.set('JEV_SECOND_KEY', 'second-private-key')
  await first.saveMany([{ ...first.engine, modelName: 'quick', upstreamModel: 'shared-upstream', credentialRef: 'JEV_FIRST_KEY' },
    { ...second.engine, modelName: 'full', upstreamModel: 'shared-upstream', credentialRef: 'JEV_SECOND_KEY' }])
  const center = first.ctx.get('jevCenter')
  const [quick, full] = await Promise.all([center.evaluate('quick', question), center.evaluate('full', question)])
  assert.deepEqual([quick.model, full.model], ['resolved-first', 'resolved-second'])
  assert.deepEqual([quick.answers.urgent.noul, full.answers.urgent.noul], [0.1, 0.9])
  assert.deepEqual([first.requests[0].authorization, second.requests[0].authorization], ['Bearer first-private-key', 'Bearer second-private-key'])
  assert.deepEqual([first.requests[0].body.model, second.requests[0].body.model], ['shared-upstream', 'shared-upstream'])
  assert.equal((await center.testConnection('full')).model, 'resolved-second')
  assert.equal(second.requests[1].body.state, 'The light is on.')
})

test('configuration modification, disabling and deletion preserve in-flight requests but immediately govern new calls', async t => {
  for (const action of ['modify', 'disable', 'delete']) await t.test(action, async t => {
    let pendingResponse, acceptRequest
    const received = new Promise(resolve => { acceptRequest = resolve })
    const old = await fixture(t, (_, response) => { pendingResponse = response; acceptRequest() })
    const next = await fixture(t)
    await old.ctx.credentials.set('JEV_OLD_KEY', 'old-identity-key')
    await old.ctx.credentials.set('JEV_NEW_KEY', 'new-identity-key')
    const selected = { ...old.engine, modelName: 'quick', upstreamModel: 'old-model', credentialRef: 'JEV_OLD_KEY' }
    const alternative = { ...next.engine, modelName: 'full', upstreamModel: 'alternative', credentialRef: 'JEV_NEW_KEY' }
    await old.saveMany([selected, alternative])
    const caller = new AbortController(), center = old.ctx.get('jevCenter')
    const inFlight = center.evaluate('quick', question, { signal: caller.signal })
    await Promise.race([received, inFlight.then(() => { throw new Error('original upstream request was not received') })])
    const replacement = { ...next.engine, modelName: 'quick', upstreamModel: 'new-model', credentialRef: 'JEV_NEW_KEY' }
    await old.saveMany(action === 'delete' ? [alternative] : [action === 'disable' ? { ...selected, enabled: false } : replacement, alternative])
    const newCall = await center.evaluate('quick', question)
    if (action === 'modify') {
      assert.equal(newCall.ok, true)
      assert.equal(next.requests[0].body.model, 'new-model')
      assert.equal(next.requests[0].authorization, 'Bearer new-identity-key')
    } else {
      assert.equal(newCall.error.code, action === 'disable' ? 'ENGINE_DISABLED' : 'ENGINE_MISSING')
      assert.equal(next.requests.length, 0)
    }
    assert.equal(pendingResponse.destroyed, false)
    pendingResponse.end(JSON.stringify({ model: 'old-resolved', answers: { urgent: { type: 'noul', noul: 0.1 } }, usage: { input_tokens: 5, output_tokens: 1 } }))
    assert.equal((await inFlight).model, 'old-resolved')
    assert.equal(caller.signal.aborted, false)
    assert.equal(old.requests[0].body.model, 'old-model')
    assert.equal(old.requests[0].authorization, 'Bearer old-identity-key')
    assert.equal((await old.ctx.credentials.resolve('JEV_OLD_KEY')).value, 'old-identity-key')
  })
})

test('a request already waiting on an upstream response retains its original timeout after configuration changes', async t => {
  let acceptRequest
  const received = new Promise(resolve => { acceptRequest = resolve })
  const f = await fixture(t, (_, response) => { response.writeHead(200); response.flushHeaders(); acceptRequest() })
  await f.ctx.credentials.set('JEV_CENTER_TEST_KEY', 'deadline-identity')
  await f.save({ modelName: 'quick', timeoutMs: 200 })
  const caller = new AbortController(), pending = f.ctx.get('jevCenter').evaluate('quick', question, { signal: caller.signal })
  await Promise.race([received, pending.then(() => { throw new Error('original upstream request was not received') })])
  await f.save({ modelName: 'quick', timeoutMs: 5000 })
  const result = await pending
  assert.equal(result.error.code, 'TIMEOUT')
  assert.ok(result.elapsedMs < 1500, 'in-flight request must use its 200ms deadline, not the newly saved 5s deadline')
  assert.equal(caller.signal.aborted, false)
  assert.equal(f.ctx.get('jevCenter').describe()[0].timeoutMs, 5000)
})

test('the public center configuration route reports model-name conflict and preserves the accepted state', async t => {
  const f = await fixture(t)
  await f.saveMany([{ ...f.engine, modelName: 'quick' }, { ...f.engine, modelName: 'full' }])
  const response = await fetch(`${f.baseUrl}/jev-center/api/config`, { method: 'PUT', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ engines: [{ ...f.engine, modelName: 'quick' }, { ...f.engine, modelName: 'quick' }] }) })
  assert.equal(response.status, 400)
  const result = await response.json()
  assert.equal(result.error.code, 'MODEL_NAME_CONFLICT')
  assert.match(result.error.message, /调用模型名.*重复/)
  assert.deepEqual(f.ctx.get('jevCenter').describe().map(engine => engine.modelName), ['quick', 'full'])
})
