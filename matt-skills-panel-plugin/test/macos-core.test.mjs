import test from 'node:test'
import assert from 'node:assert/strict'
import { readCommand, detectWrite } from '../src/shared/refresh/write-detect.js'
import { classifyCreateWriteAttempt, decideCreateWriteRetry } from '../src/shared/refresh/create-write.js'
import { chainTicketAndEffortFromPath } from '../src/shared/refresh/chain.js'
import { shortestUniqueSuffix, displayFor, assemble } from '../src/shared/version-control/state.js'

test('Windows executable spellings are not promoted to POSIX issue writes', () => {
  for (const command of ['gh.exe issue close 42', 'gh.bat issue close 42', 'gh.ps1 issue close 42', '"C:\\tools\\gh.cmd" issue close 42', 'powershell -Command "gh issue close 42"']) {
    assert.deepEqual(readCommand(command), { tier: 'probe-now', ticket: null, reason: 'cmd.unknown' }, command)
  }
})

test('Mac POSIX commands retain exact write tickets and conservative refresh behavior', () => {
  assert.deepEqual(readCommand('/opt/homebrew/bin/gh issue close 42'), { tier: 'write-confirmed', ticket: '42', reason: 'cmd.cli-write' })
  assert.deepEqual(readCommand('glab issue view 42'), { tier: 'default-tick', ticket: null, reason: 'cmd.cli-read' })
  assert.deepEqual(readCommand('git push'), { tier: 'probe-now', ticket: null, reason: 'cmd.git-push' })
  assert.equal(readCommand('echo text > ticket.md').reason, 'cmd.file-write')
  assert.equal(readCommand('node script.mjs').reason, 'cmd.script')
  assert.equal(readCommand('curl https://example.invalid').reason, 'cmd.remote-client')
  for (const command of ['Get-Content ticket.md', 'Out-File ticket.md', 'Invoke-RestMethod url']) assert.equal(readCommand(command).reason, 'cmd.unknown')
  assert.equal(detectWrite({ shape: 'tools/result', tool: 'bash', command: 'gh issue close 42', succeeded: false }).tier, 'default-tick')
})

test('Windows-only CLI failures cannot justify a repeated issue write', () => {
  for (const stderr of ['glab is not recognized as an internal or external command', 'spawn C:\\tools\\glab.exe ENOENT', 'spawn glab.cmd ENOENT', 'spawn glab.bat EACCES']) {
    const result = classifyCreateWriteAttempt({ code: 1, stderr })
    assert.equal(result.verdict, 'maybe-written', stderr)
    assert.equal(decideCreateWriteRetry(result.verdict, 1).retry, false)
  }
})

test('Mac CLI no-start and ambiguous failures retain retry safety', () => {
  for (const response of [{ code: 127, stderr: 'glab: command not found' }, { code: 1, stderr: 'spawn /opt/homebrew/bin/glab ENOENT' }, { code: 1, stderr: 'command not found: glab' }]) {
    const result = classifyCreateWriteAttempt(response)
    assert.equal(result.verdict, 'never-sent')
    assert.equal(decideCreateWriteRetry(result.verdict, 1).retry, true)
    assert.equal(decideCreateWriteRetry(result.verdict, 2).retry, false)
  }
  assert.equal(classifyCreateWriteAttempt({ code: 0, stdout: '{"iid":42}' }).verdict, 'created')
  assert.equal(classifyCreateWriteAttempt({ code: 1, stderr: '404 not found' }).verdict, 'endpoint-absent')
  assert.equal(decideCreateWriteRetry(classifyCreateWriteAttempt({ code: 1, stderr: 'EOF after request' }).verdict, 1).retry, false)
})

test('Mac worktree paths preserve literal backslashes and case-sensitive suffixes', () => {
  assert.deepEqual(shortestUniqueSuffix(['/work/One', '/work/one']), [1, 1])
  assert.equal(displayFor('/work/a\\b', 1), 'a\\b')
  assert.equal(displayFor('\\\\server\\share\\repo', 1), '\\\\server\\share\\repo')
  const tree = (path, branch, head) => ({ path, branch, head, bare: false, locked: false, prunable: false })
  const result = assemble({ repoRoot: '/work/a\\b', bare: false, statusHead: 'main', statusDetached: false, statusOid: 'two', statusUpstream: null, statusAhead: 0, statusBehind: 0,
    statusEntries: [], worktrees: [tree('/work/a/b', 'other', 'one'), tree('/work/a\\b', 'main', 'two')], refs: [], commits: [], diffFiles: [], merging: false, rebasing: false, cherryPicking: false, reverting: false, tier: 'full', autocrlf: null, nowMs: 0, basisMs: null })
  assert.equal(result.ok, true)
  assert.equal(result.screen.identity.worktreePath, '/work/a\\b')
  assert.equal(result.screen.identity.worktreeDisplay, 'a\\b')
  assert.equal(result.screen.otherWorktrees[0].path, '/work/a/b')
})

test('chain paths do not treat literal backslashes as directory separators', () => {
  assert.deepEqual(chainTicketAndEffortFromPath('C:\\work\\.scratch\\alpha\\issues\\42-title.md'), { ticketKey: '', effortId: '' })
  assert.deepEqual(chainTicketAndEffortFromPath('/work/.scratch/alpha/issues/42-title.md'), { ticketKey: '42', effortId: 'alpha' })
  assert.deepEqual(chainTicketAndEffortFromPath('/work/.scratch/alpha/map.md'), { ticketKey: '', effortId: 'alpha' })
  assert.deepEqual(chainTicketAndEffortFromPath('/work/.scratch/alpha/issues/42-part\\name.md'), { ticketKey: '42', effortId: 'alpha' })
})
