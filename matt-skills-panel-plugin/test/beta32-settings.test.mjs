import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import ts from 'typescript'
import { transformSync } from 'esbuild'
import { parse as parseYaml } from 'yaml'
import { parseSettings, stringifySettings } from '../src/shared/config-store/src/settings.js'
import { keyOf } from '../src/shared/workspaceKey.js'
import { markdownModule } from '../src/tracker/rooms/markdown/index.js'

test('unopened macOS workspace settings stay sparse and keep distinct paths on disk', () => {
  const first = '/Users/Matt/Case\\Folder', second = '/Users/Matt/case/Folder'
  const parsed = parseSettings({ version: 1, workspaces: {
    [first]: { unopened: true, statusBar: 'show' },
    [second]: { unopened: true, deckTools: 'off' },
  } })
  assert.equal(parsed.ok, true, parsed.message)
  assert.deepEqual(parsed.value.workspaces[first], { unopened: true, statusBar: 'show' })
  assert.deepEqual(parsed.value.workspaces[second], { unopened: true, deckTools: 'off' })
  const saved = stringifySettings(parsed.value)
  assert.equal(saved.ok, true, saved.message)
  const roundTrip = parseSettings(parseYaml(saved.text))
  assert.equal(roundTrip.ok, true, roundTrip.message)
  assert.deepEqual(roundTrip.value.workspaces, parsed.value.workspaces)
})

test('the macOS Markdown issue action continues to open the issue file', () => {
  assert.equal(markdownModule.openIssue, 'file')
})

test('merging an unopened workspace does not overwrite a different macOS path', () => {
  const sources = ['../src/client/kernel/settings-view.ts', '../src/client/kernel/settings-view-write.ts']
  const wanted = new Set(['viewFlagNormOf', 'viewFlagEntryKeyOf', 'viewFlagMergeCarryOf', 'viewFlagMergeMoveJournal', 'viewFlagMergeDoc'])
  const declarations = []
  for (const path of sources) {
    const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true)
    function visit(node) {
      if (ts.isVariableDeclaration(node) && wanted.has(node.name.getText(source)) && node.initializer) {
        declarations.push(`const ${node.name.getText(source)} = ${node.initializer.getText(source)};`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  assert.equal(declarations.length, wanted.size)
  const root = '/Users/Matt/Case\\Folder', temporary = root + '/Sub', other = '/Users/Matt/case/Folder'
  const scope = { keyOf, viewFlagDocKeyOf: key => key === temporary ? root : '',
    VIEW_FLAG_SEED_NAMES: ['statusBar', 'deckTools', 'subwsMarkAutoShown'],
    viewFlagTextValuesOf: name => ({ statusBar: ['show', 'hide'], deckTools: ['on', 'off'] })[name] ?? [],
    viewFlagSeedValueOf: (_key, name) => ({ statusBar: 'hide', deckTools: 'on', subwsMarkAutoShown: false })[name],
    viewFlagSetInDoc: () => { throw new Error('must not merge into a different path') },
    viewFlagState: { journal: {}, mergeLog: {} }, dswsLogHash: key => key, Object, String, Number }
  const { code } = transformSync(`${declarations.join('\n')}\nglobalThis.merge = viewFlagMergeDoc;`, { loader: 'ts', target: 'es2020' })
  vm.runInNewContext(code, scope)
  const otherSettings = { statusBar: 'hide', deckTools: 'off' }
  const doc = { workspaces: { [other]: otherSettings, [temporary]: { unopened: true, statusBar: 'show' } } }
  assert.equal(scope.merge(doc, 'test'), 1)
  assert.equal(doc.workspaces[temporary], undefined)
  assert.equal(doc.workspaces[root].statusBar, 'show')
  assert.deepEqual(doc.workspaces[other], otherSettings)
})
