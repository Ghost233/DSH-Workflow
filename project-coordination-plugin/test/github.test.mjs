import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Coordination } from '../src/coordination.mjs'
import { GitHub } from '../src/github.mjs'

test('failed polling preserves the cursor and retry deduplicates previously stored events', async t => {
  let fail = true
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, 'Bearer fixture-token')
    response.setHeader('content-type', 'application/json')
    if (request.url.startsWith('/repos/example/front/issues/comments')) {
      if (fail) { response.statusCode = 503; response.end('{}'); return }
      response.end(JSON.stringify([{ id: 2, body: 'Please investigate', user: { login: 'outsider', type: 'User' },
        issue_url: 'https://api.github.com/repos/example/front/issues/1', html_url: 'https://github.com/example/front/issues/1#issuecomment-2',
        created_at: '2026-11-10T00:01:00Z', updated_at: '2026-11-10T00:01:00Z' }]))
    } else if (request.url.startsWith('/repos/example/front/issues?')) {
      response.end(JSON.stringify([{ id: 1, number: 1, title: 'Login', body: 'Add a form', user: { login: 'owner', type: 'User' },
        html_url: 'https://github.com/example/front/issues/1', created_at: '2026-11-10T00:00:00Z', updated_at: '2026-11-10T00:00:00Z' }]))
    } else response.end('[]')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const directory = await mkdtemp(join(tmpdir(), 'coordination-github-'))
  const repository = { repository: 'example/front', manager: 'front', allowedActors: ['owner'] }
  const service = new Coordination({ path: join(directory, 'state.sqlite'), configuration: {
    repositories: [repository], members: [{ bot: 'front', role: 'manager', repository: repository.repository }],
  } })
  t.after(async () => { service.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  const github = new GitHub({ service, baseUrl: `http://127.0.0.1:${server.address().port}`, token: async () => 'fixture-token' })
  await assert.rejects(github.poll(repository), /503/)
  assert.equal(service.cursor(repository.repository), undefined)
  fail = false
  await github.poll(repository)
  assert.ok(service.cursor(repository.repository))
  const events = service.claim('front')
  assert.equal(events.length, 2)
  assert.equal(events.find(row => row.source.actor === 'outsider').canDevelop, false)
})

test('an uncertain Issue creation is reconciled before retrying the write', async t => {
  let posts = 0, created
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.method === 'POST') {
      let body = ''; request.on('data', chunk => { body += chunk }); request.on('end', () => {
        posts++
        const input = JSON.parse(body)
        created = { ...input, number: 17, html_url: 'https://github.com/example/front/issues/17', user: { login: 'automation' } }
        request.socket.destroy()
      })
    } else response.end(JSON.stringify(created ? [created] : []))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const directory = await mkdtemp(join(tmpdir(), 'coordination-write-'))
  const repository = { repository: 'example/front', manager: 'front', allowedActors: ['owner'], githubActor: 'automation' }
  const service = new Coordination({ path: join(directory, 'state.sqlite'), configuration: {
    repositories: [repository], members: [{ bot: 'front', role: 'manager', repository: repository.repository }],
  } })
  t.after(async () => { service.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  service.ingestHuman('front', { id: 'human-request', text: 'Implement login', createdAt: Date.now() })
  const [source] = service.claim('front')
  const task = service.accept('front', source.id, source.token, { title: 'Login', criteria: ['login succeeds'] })
  const github = new GitHub({ service, baseUrl: `http://127.0.0.1:${server.address().port}`, token: async () => 'fixture-token' })
  await assert.rejects(github.ensureIssue(task.id))
  assert.equal((await github.ensureIssue(task.id)).number, 17)
  assert.equal(posts, 1)
})

test('PR writes reconcile a lost response and update the same task PR for a new verified head', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coordination-pull-'))
  const repository = { repository: 'example/front', manager: 'front', allowedActors: ['owner'], githubActor: 'automation' }
  const service = new Coordination({ path: join(directory, 'state.sqlite'), configuration: {
    repositories: [repository], members: [{ bot: 'front', role: 'manager', repository: repository.repository }],
  } })
  let created, posts = 0, patches = 0, head = 'a'.repeat(40)
  const branch = 'codex/project-task'
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    let input = ''; for await (const bytes of request) input += bytes
    if (request.method === 'POST') {
      posts++; const payload = JSON.parse(input)
      created = { ...payload, number: 3, html_url: 'https://github.com/example/front/pull/3', state: 'open', draft: false,
        head: { ref: branch, sha: head, repo: { full_name: repository.repository } }, base: { ref: 'main' }, user: { login: 'automation' } }
      request.socket.destroy(); return
    }
    if (request.method === 'PATCH') { patches++; Object.assign(created, JSON.parse(input)); created.head.sha = head }
    if (request.url.includes('/pulls?')) response.end(JSON.stringify(created ? [{ ...created, head: { ...created.head, sha: head } }] : []))
    else response.end(JSON.stringify({ ...created, head: { ...created?.head, sha: head } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { service.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  service.ingest({ id: 'issue', kind: 'issue', actor: 'owner', repository: repository.repository, number: 1 })
  const [event] = service.claim('front')
  const task = service.accept('front', event.id, event.token, { title: 'Form', criteria: ['form works'] })
  const github = new GitHub({ service, baseUrl: `http://127.0.0.1:${server.address().port}`, token: () => 'fixture' })
  await assert.rejects(github.ensurePull(task.id, { branch, head, summary: 'Ready' }))
  assert.equal((await github.ensurePull(task.id, { branch, head, summary: 'Ready' })).pull, created.html_url)
  assert.equal(posts, 1)
  head = 'b'.repeat(40)
  await github.ensurePull(task.id, { branch, head, summary: 'Review fixes verified' })
  assert.equal(posts, 1)
  assert.equal(patches, 1)
  service.stop('front', task.id)
  await assert.rejects(github.ensurePull(task.id, { branch, head: 'c'.repeat(40), summary: 'stopped' }), /stopped/)
  assert.equal(posts + patches, 2)
})

test('an Issue closes only after accepted final completion and the closure is not replayed', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'coordination-close-'))
  const repository = { repository: 'example/front', manager: 'front', allowedActors: ['owner'], githubActor: 'automation' }
  const service = new Coordination({ path: join(directory, 'state.sqlite'), configuration: {
    repositories: [repository], members: [{ bot: 'front', role: 'manager', repository: repository.repository }],
  } })
  let state = 'open', patches = 0
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json')
    if (request.method === 'PATCH') {
      let bytes = ''; for await (const value of request) bytes += value
      assert.deepEqual(JSON.parse(bytes), { state: 'closed', state_reason: 'completed' })
      patches++; state = 'closed'
    }
    response.end(JSON.stringify({ number: 1, state }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(async () => { service.close(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  service.ingest({ id: 'issue', kind: 'issue', actor: 'owner', repository: repository.repository, number: 1 })
  const [event] = service.claim('front')
  const task = service.accept('front', event.id, event.token, { title: 'Investigate', criteria: ['evidence reviewed'] })
  const github = new GitHub({ service, baseUrl: `http://127.0.0.1:${server.address().port}`, token: () => 'fixture' })
  await assert.rejects(github.closeCompletedIssue(task.id), /accepted final completion/)
  service.saveTask(task, { state: 'completed', accepted: true, noChange: true })
  await github.closeCompletedIssue(task.id)
  state = 'open' // A later human reopening must not be overwritten by replaying the old completion.
  await github.closeCompletedIssue(task.id)
  assert.equal(patches, 1)
  assert.equal(state, 'open')
})
