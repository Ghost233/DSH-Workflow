#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const pluginDirectory = dirname(scriptDirectory)
const sourcePath = join(pluginDirectory, 'src', 'client-runtime.js')
const outputPath = join(pluginDirectory, 'client.js')
const source = await readFile(sourcePath, 'utf8')
const remoteSource = await readFile(join(pluginDirectory, 'src', 'jev-center-remote.cjs'), 'utf8')
const monitorRemoteSource = await readFile(join(pluginDirectory, 'src', 'agent-monitor-remote.cjs'), 'utf8')
const remotePrelude = `const jevRemote = { exports: {} }\n;(function(module) {\n${remoteSource}\n})(jevRemote)\nconst monitorRemote = { exports: {} }\n;(function(module) {\n${monitorRemoteSource}\n})(monitorRemote)\nconst hostRequire = require\nrequire = name => name === './jev-center-remote.cjs' ? jevRemote.exports : name === './agent-monitor-remote.cjs' ? monitorRemote.exports : hostRequire(name)\n`
const indentedSource = (remotePrelude + source).split('\n').map(line => line === '' ? '' : `      ${line}`).join('\n')

const output = `// 此文件由 scripts/build-client.mjs 生成，请修改 src/client-runtime.js 后重新构建。\n` +
`(() => {\n` +
`  const factory = (require) => {\n` +
`    const module = { exports: {} }\n` +
`    const exports = module.exports\n` +
`${indentedSource}\n` +
`    return module.exports\n` +
`  }\n` +
`  window.__ModuleLoader__.load({ id: 'dsh-workflow', factory })\n` +
`})()\n`

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '')
  if (current !== output) {
    throw new Error('client.js 不是最新产物；请执行 npm run build:client')
  }
} else {
  await writeFile(outputPath, output, 'utf8')
}
