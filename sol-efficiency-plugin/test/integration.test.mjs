import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { boot, logCommand } from './helpers.mjs'
import { Adapter, requests, setResponseMode } from './fixtures/reducer-model.mjs'

test('real Loader + native write/bash: apply, verify, preserve audit and dispose registrations', async t => {
  const { ctx, cwd, session, tree, execute } = await boot(t)
  const result = await execute('write_then_run', { file_path: 'hello.txt', content: 'hello',
    then_run: { command: 'test "$(cat hello.txt)" = hello', description: 'Verify the written file content' } })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.equal(result.value.commandStatus, 'succeeded', JSON.stringify(result))
  assert.equal(await readFile(join(cwd, 'hello.txt'), 'utf8'), 'hello')
  assert.equal(session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch').length, 2)
  assert.equal(ctx.tools.executionMode({ name: 'write_then_run', arguments: {} }).kind, 'exclusive')
  await tree.remove('sol-efficiency')
  await ctx.loader.await()
  for (let i = 0; i < 100 && ctx.tools.get('write_then_run'); i++) {
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(ctx.tools.get('write_then_run'), undefined)
  assert.equal(ctx.tools.get('edit_then_run'), undefined)
})

test('failed edit skips bash; failed bash preserves the successful mutation', async t => {
  const { execute, cwd } = await boot(t)
  const failedEdit = await execute('edit_then_run', { file_path: 'missing.txt', old_string: 'a', new_string: 'b',
    then_run: { command: 'touch should-not-exist', description: 'Must not run after failure' } })
  assert.equal(failedEdit.value.commandStatus, 'skipped', JSON.stringify(failedEdit))
  await assert.rejects(readFile(join(cwd, 'should-not-exist')))
  const failedCheck = await execute('write_then_run', { file_path: 'kept.txt', content: 'keep this',
    then_run: { command: 'exit 7', description: 'Return nonzero from verification' } })
  assert.equal(failedCheck.value.commandStatus, 'failed')
  assert.equal(failedCheck.value.command.value.exitCode, 7)
  assert.equal(await readFile(join(cwd, 'kept.txt'), 'utf8'), 'keep this')
})

test('native guard denial is enforced on the nested bash dispatch', async t => {
  const { ctx, execute, cwd } = await boot(t)
  ctx.on('tools/pre-execute', async (exec, next) => exec.name === 'bash'
    ? { kind: 'deny', reason: 'Verification denied by fixture policy' } : next())
  const result = await execute('write_then_run', { file_path: 'guarded.txt', content: 'written',
    then_run: { command: 'touch denied-command', description: 'Test the native denial policy' } })
  assert.equal(result.value.mutation.isError, false)
  assert.equal(result.value.command.isError, true)
  assert.match(result.value.command.error.message, /denied by fixture policy/)
  await assert.rejects(readFile(join(cwd, 'denied-command')))
})

test('version change between mutation and bash prevents verification', async t => {
  const { ctx, execute, cwd } = await boot(t)
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name === 'bash') await writeFile(join(cwd, 'race.txt'), 'external edit')
    return next()
  })
  const result = await execute('write_then_run', { file_path: 'race.txt', content: 'original',
    then_run: { command: 'touch raced-command', description: 'Must not verify stale content' } })
  assert.equal(result.value.command.isError, true)
  assert.equal(result.value.command.error.info.code, 'SOL_STALE_FILE')
  await assert.rejects(readFile(join(cwd, 'raced-command')))
})

test('nested additional context and turn conclusion reach the outer result', async t => {
  const { ctx, execute, cwd, tree } = await boot(t)
  await tree.remove('tool-fs')
  ctx.tools.register(defineTool({ name: 'write', description: 'Fixture terminal mutation', parameters: {},
    output: { schema: { type: 'string' }, render: () => [{ type: 'text', text: 'terminal mutation' }] },
    async execute(_args, exec) {
      exec.concludeTurn()
      exec.deferContext(createUserMessage({ content: [{ type: 'text', text: 'stop after write' }],
        source: { kind: 'plugin', plugin: 'fixture' } }))
      return 'done'
    },
  }))
  const result = await execute('write_then_run', { file_path: 'terminal.txt', content: 'done',
    then_run: { command: 'touch after-terminal', description: 'Must not run after terminal' } })
  assert.equal(result.concludesTurn, true, JSON.stringify(result))
  assert.equal(result.additionalContexts[0].content[0].text, 'stop after write')
  assert.equal(result.value.commandStatus, 'skipped')
  await assert.rejects(readFile(join(cwd, 'after-terminal')))
})

test('EPR compresses native failed test output, preserves exit status/value and archives exact source', async t => {
  setResponseMode('valid')
  const { execute } = await boot(t)
  const before = requests.length
  const result = await execute('bash', { command: logCommand(true), description: 'Generate a failing test log' })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.match(result.content[0].text, /^dsh_sol_evidence_receipt_v1/)
  assert.match(result.content[0].text, /status=failure/)
  assert.equal(result.value.exitCode, 1)
  assert.ok(result.value.stdout.text.length > 10000)
  const source = JSON.parse(result.content[0].text.match(/^source_artifact=(.+)$/m)[1])
  assert.match(await readFile(source, 'utf8'), /error: test failed/)
  const audit = JSON.parse(result.content[0].text.match(/^audit_artifact=(.+)$/m)[1])
  const saved = JSON.parse(await readFile(audit, 'utf8'))
  assert.equal(saved.validationPassed, true)
  assert.equal(saved.request.reasoningEffort, 'off')
  assert.equal(saved.adapterDefaults.reasoningEffort, true)
  assert.equal(requests.length, before + 1)
  assert.equal(requests.at(-1).purpose, 'compaction')
})

test('EPR auto uses model defaults and omits reasoning for models without that capability', async t => {
  const { tree, execute } = await boot(t)
  for (const [model, effort] of [['default-medium', 'medium'], ['no-reasoning', undefined]]) {
    await tree.update('sol-efficiency', { config: { evidenceReducer: {
      enabled: true, provider: 'sol-test', model,
    } } })
    const before = requests.length
    const result = await execute('bash', { command: logCommand(), description: 'Verify model capability defaults' })
    assert.match(result.content[0].text, /^dsh_sol_evidence_receipt_v1/)
    assert.equal(requests.length, before + 1)
    assert.equal(requests.at(-1).reasoningEffort, effort)
    const audit = JSON.parse(result.content[0].text.match(/^audit_artifact=(.+)$/m)[1])
    const saved = JSON.parse(await readFile(audit, 'utf8'))
    assert.equal(saved.request.reasoningEffort, effort)
    assert.equal(saved.request.model, model)
    assert.deepEqual(saved.adapterDefaults, effort === undefined ? {} : { reasoningEffort: true })
    if (effort === undefined) assert.equal(Object.hasOwn(saved.request, 'reasoningEffort'), false)
  }
})

test('EPR keeps explicit reasoning settings and falls back before dispatch when unsupported', async t => {
  const { tree, execute } = await boot(t)
  for (const [model, supported] of [['fixture', true], ['default-medium', false], ['no-reasoning', false]]) {
    await tree.update('sol-efficiency', { config: { evidenceReducer: {
      enabled: true, provider: 'sol-test', model, reasoningEffort: 'off',
    } } })
    const before = requests.length
    const result = await execute('bash', { command: logCommand(true), description: 'Verify explicit reducer reasoning' })
    assert.equal(result.isError, false)
    assert.equal(result.value.exitCode, 1)
    assert.equal(result.content[0].text.startsWith('dsh_sol_evidence_receipt_v1'), supported)
    assert.equal(requests.length, before + Number(supported))
    if (supported) {
      const audit = JSON.parse(result.content[0].text.match(/^audit_artifact=(.+)$/m)[1])
      assert.deepEqual(JSON.parse(await readFile(audit, 'utf8')).adapterDefaults, {})
    } else assert.match(result.content[0].text, /error: test failed/)
  }
})

test('EPR binds capability resolution, stream and audit to one adapter generation during replacement', async t => {
  const { ctx, tree, execute } = await boot(t)
  const first = new Adapter()
  let prepared = 0
  const basePrepare = first.prepareCall.bind(first)
  first.prepareCall = async (...args) => { prepared++; return basePrepare(...args) }
  const release = ctx.llm.registerAdapter(['sol-generation'], first)
  await tree.update('sol-efficiency', { config: { evidenceReducer: {
    enabled: true, provider: 'sol-generation', model: 'default-medium',
  } } })
  const replacement = new Adapter()
  let replacementCalls = 0
  replacement.stream = async function* () { replacementCalls++; throw new Error('Replacement adapter unavailable') }
  let replaced = false
  ctx.on('llm/stream', async function* (options, next) {
    if (options.provider === 'sol-generation' && !replaced) {
      replaced = true
      release()
      ctx.llm.registerAdapter(['sol-generation'], replacement)
    }
    yield* next()
  })
  const args = { command: logCommand(), description: 'Verify reducer generation consistency' }
  const original = await execute('bash', args)
  assert.match(original.content[0].text, /^dsh_sol_evidence_receipt_v1/)
  assert.equal(prepared, 1)
  assert.equal(replaced, true)
  assert.equal(replacementCalls, 0)
  const audit = JSON.parse(original.content[0].text.match(/^audit_artifact=(.+)$/m)[1])
  const saved = JSON.parse(await readFile(audit, 'utf8'))
  assert.equal(saved.request.reasoningEffort, 'medium')
  assert.equal(saved.request.provider, 'sol-generation')
  const after = await execute('bash', args)
  assert.doesNotMatch(after.content[0].text, /^dsh_sol_evidence_receipt_v1/)
  assert.equal(replacementCalls, 1)
})

test('EPR composes with fusion and does not replace the file mutation confirmation', async t => {
  setResponseMode('valid')
  const { execute } = await boot(t)
  const result = await execute('write_then_run', { file_path: 'fused.txt', content: 'data',
    then_run: { command: logCommand(), description: 'Generate a successful test log' } })
  assert.equal(result.value.commandStatus, 'succeeded', JSON.stringify(result))
  const text = result.content.map(block => block.text).join('\n')
  assert.match(text, /mutation=applied/)
  assert.match(text, /Created file/)
  assert.match(text, /dsh_sol_evidence_receipt_v1/)
})

test('invalid reducer output and provider errors retain the original content', async t => {
  const { execute } = await boot(t)
  for (const mode of ['invalid', 'error']) {
    setResponseMode(mode)
    const result = await execute('bash', { command: logCommand(true), description: 'Exercise reducer fallback behavior' })
    assert.equal(result.isError, false)
    assert.doesNotMatch(result.content[0].text, /dsh_sol_evidence_receipt_v1/)
    assert.match(result.content[0].text, /error: test failed/)
  }
  setResponseMode('valid')
})

test('secret logs and non-diagnostic commands never reach reducer', async t => {
  const { execute } = await boot(t)
  const before = requests.length
  await execute('bash', { command: `${logCommand()}\nprintf 'api_key=private-value\\n'`, description: 'Exercise secret log exclusion' })
  await execute('bash', { command: 'node -e \'process.stdout.write("x".repeat(10000))\'', description: 'Generate a nondiagnostic output' })
  assert.equal(requests.length, before)
})

test('native read-before-edit policy also governs fused edits', async t => {
  const { ctx, tree, execute, cwd } = await boot(t)
  await ctx.loader.create({ name: '@deepseek-ai/dsh-fs-observation-policy' })
  await ctx.loader.await()
  await writeFile(join(cwd, 'observed.txt'), 'old')
  const args = { file_path: 'observed.txt', old_string: 'old', new_string: 'new',
    then_run: { command: 'test "$(cat observed.txt)" = new', description: 'Verify the edited file content' } }
  const denied = await execute('edit_then_run', args)
  assert.equal(denied.value.mutation.isError, true)
  assert.equal(denied.value.commandStatus, 'skipped')
  assert.equal(await readFile(join(cwd, 'observed.txt'), 'utf8'), 'old')
  await execute('read', { file_path: 'observed.txt' })
  const accepted = await execute('edit_then_run', args)
  assert.equal(accepted.value.commandStatus, 'succeeded', JSON.stringify(accepted))
})

test('EPR deadline falls back without changing the native bash result', { timeout: 5000 }, async t => {
  const { tree, execute } = await boot(t)
  await tree.update('sol-efficiency', { config: { evidenceReducer: {
    enabled: true, provider: 'sol-test', model: 'fixture', timeoutMs: 25,
  } } })
  setResponseMode('timeout')
  t.after(() => setResponseMode('valid'))
  const result = await execute('bash', { command: logCommand(), description: 'Exercise the reducer deadline fallback' })
  assert.equal(result.isError, false)
  assert.equal(result.value.exitCode, 0)
  assert.ok(!result.content[0].text.startsWith('dsh_sol_evidence_receipt_v1'))
})

test('pre-cancelled fusion never writes and command timeout retains the mutation', async t => {
  const { execute, cwd } = await boot(t)
  const args = { file_path: 'cancelled.txt', content: 'must not exist',
    then_run: { command: 'exit 0', description: 'Verify cancellation before mutation' } }
  const cancelled = await execute('write_then_run', args, { signal: AbortSignal.abort() })
  assert.equal(cancelled.isError, true)
  await assert.rejects(readFile(join(cwd, 'cancelled.txt')))
  const timed = await execute('write_then_run', { ...args, content: 'keep after timeout',
    then_run: { command: 'sleep 5', description: 'Exercise the native command timeout', timeoutMs: 20 } })
  assert.equal(timed.value.commandStatus, 'failed')
  assert.equal(timed.value.command.value.timedOut, true)
  assert.equal(await readFile(join(cwd, 'cancelled.txt'), 'utf8'), 'keep after timeout')
})

test('unloading EPR aborts in-flight reduction and removes its listener', { timeout: 5000 }, async t => {
  const { ctx, tree, execute } = await boot(t)
  let started
  const entered = new Promise(resolve => { started = resolve })
  ctx.on('llm/stream', async function* (_options, next) {
    started()
    yield* next()
  })
  setResponseMode('timeout')
  t.after(() => setResponseMode('valid'))
  const pending = execute('bash', { command: logCommand(), description: 'Exercise unload during log reduction' })
  await entered
  await tree.remove('sol-efficiency')
  const result = await pending
  assert.equal(result.isError, false)
  const before = requests.length
  await execute('bash', { command: logCommand(), description: 'Verify reducer listener was removed' })
  assert.equal(requests.length, before)
})

test('Code Mode reaches fusion through native nested dispatch; ordinary bash skips reducer', { timeout: 10000 }, async t => {
  const { ctx, tree, execute, cwd } = await boot(t)
  await ctx.loader.create({ name: '@deepseek-ai/dsh-ptc-runtime-node' })
  await ctx.loader.create({ name: '@deepseek-ai/dsh-code-runtime-worker-thread' })
  await tree.update('tools', { config: { mode: 'ptc' } })
  await ctx.loader.await()
  const args = { file_path: 'code.txt', content: 'code mode',
    then_run: { command: 'test "$(cat code.txt)" = "code mode"', description: 'Verify file from Code Mode' } }
  const denied = await execute('write_then_run', args)
  assert.equal(denied.isError, true)
  const result = await execute('run_code', { description: 'Write and verify through Code Mode', code: `const r = await tools.write_then_run(${JSON.stringify(args)}); console.log(r.commandStatus);` })
  assert.equal(result.isError, false, JSON.stringify(result))
  assert.match(JSON.stringify(result.content), /succeeded/)
  assert.equal(await readFile(join(cwd, 'code.txt'), 'utf8'), 'code mode')
  const before = requests.length
  const plain = await execute('run_code', { description: 'Read diagnostic exit status through Code Mode', code: `const r = await tools.bash(${JSON.stringify({ command: logCommand(), description: 'Generate code mode test logs' })}); console.log(r.exitCode);` })
  assert.equal(plain.isError, false, JSON.stringify(plain))
  assert.equal(requests.length, before)
})

test('default-off configuration removes both features through Loader reload', async t => {
  const { tree, ctx, execute } = await boot(t)
  await tree.update('sol-efficiency', { config: {} })
  assert.equal(ctx.tools.get('write_then_run'), undefined)
  const before = requests.length
  await execute('bash', { command: logCommand(), description: 'Verify disabled reducer has no calls' })
  assert.equal(requests.length, before)
})

test('missing native bash fails before mutation', async t => {
  const { tree, execute, cwd } = await boot(t)
  await tree.remove('tool-bash')
  const result = await execute('write_then_run', { file_path: 'no-bash.txt', content: 'must not exist',
    then_run: { command: 'exit 0', description: 'Check missing native bash handling' } })
  assert.equal(result.isError, true)
  assert.equal(result.error.info.code, 'SOL_MISSING_TOOL')
  await assert.rejects(readFile(join(cwd, 'no-bash.txt')))
})

test('storage failure is fail-open and happens before any reducer request', async t => {
  const { ctx, execute } = await boot(t)
  const before = requests.length
  ctx.spillStore.saveText = async () => { throw new Error('Fixture disk full') }
  const result = await execute('bash', { command: logCommand(), description: 'Exercise unavailable spill storage handling' })
  assert.equal(result.isError, false)
  assert.ok(result.content[0].text.includes('PASS verification'))
  assert.ok(!result.content[0].text.startsWith('dsh_sol_evidence_receipt_v1'))
  assert.equal(requests.length, before)
})

test('existing post-execute content replacement is preserved without a reducer call', async t => {
  const { ctx, execute } = await boot(t)
  ctx.on('tools/post-execute', async (_exec, _result, next) => {
    const decision = await next()
    return { ...decision, content: [{ type: 'text', text: 'Policy-owned projection' }] }
  })
  const before = requests.length
  const result = await execute('bash', { command: logCommand(), description: 'Preserve another policy result projection' })
  assert.equal(result.content[0].text, 'Policy-owned projection')
  assert.equal(requests.length, before)
})

for (const broken of [false, true]) test(`nested log projection ${broken ? 'failure retains the settled result' : 'changes only the durable preview'}`, async t => {
  const { ctx, agent, session, execute } = await boot(t)
  const seen = []
  ctx.on('tools/ptc-dispatch-log', async (dispatch, next) => {
    assert.equal(dispatch.agent, agent)
    assert.equal(dispatch.exec.agent, agent)
    seen.push(dispatch.name)
    if (broken) throw new Error('Broken optional log projection')
    return [{ type: 'text', text: `preview:${dispatch.name}` }]
  })
  const result = await execute('write_then_run', { file_path: 'preview.txt', content: 'content',
    then_run: { command: 'printf original-output', description: 'Verify nested log projection isolation' } })
  assert.equal(result.value.commandStatus, 'succeeded')
  assert.match(JSON.stringify(result.content), /original-output/)
  assert.deepEqual(seen, ['write', 'bash'])
  const ends = session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch')
  assert.equal(ends.length, 2)
  assert.match(JSON.stringify(ends[1].data.content), broken ? /original-output/ : /preview:bash/)
})

test('cancellation after a native write settles its log and skips bash without pretending the file was rolled back', async t => {
  const { ctx, cwd, session, execute } = await boot(t)
  const controller = new AbortController()
  ctx.on('tools/post-execute', async (exec, _result, next) => {
    const decision = await next()
    if (exec.name === 'write') controller.abort(new Error('Cancelled after mutation'))
    return decision
  })
  const result = await execute('write_then_run', { file_path: 'cancel-after-write.txt', content: 'applied',
    then_run: { command: 'touch must-not-run', description: 'Must not execute after cancellation' } }, { signal: controller.signal })
  assert.equal(result.isError, true)
  assert.equal(await readFile(join(cwd, 'cancel-after-write.txt'), 'utf8'), 'applied')
  await assert.rejects(readFile(join(cwd, 'must-not-run')))
  const starts = session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch-start')
  const ends = session.snapshotEvents().filter(event => event.type === 'tool/ptc-dispatch')
  assert.equal(starts.length, 1)
  assert.equal(ends.length, 1)
  assert.equal(ends[0].data.name, 'write')
  assert.equal(ends[0].data.subCallId, starts[0].data.subCallId)
  assert.equal(ends[0].data.isError, true)
})
