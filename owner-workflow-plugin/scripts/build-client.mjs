#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const pluginDirectory = dirname(scriptDirectory)
const sourcePath = join(pluginDirectory, 'src', 'client-runtime.js')
const outputPath = join(pluginDirectory, 'client.js')
const source = await readFile(sourcePath, 'utf8')
const indentedSource = source.split('\n').map(line => `      ${line}`).join('\n')

// 本地开发使用别名包，正式安装使用标准包名；同一产物同时登记两个模块编号。
const output = `// 此文件由 scripts/build-client.mjs 生成，请修改 src/client-runtime.js 后重新构建。\n` +
`(() => {\n` +
`  const factory = (require) => {\n` +
`    const module = { exports: {} }\n` +
`    const exports = module.exports\n` +
`${indentedSource}\n` +
`    return module.exports\n` +
`  }\n` +
`  for (const id of ['dsh-owner-workflow', 'dsh-owner-workflow-local-ui']) {\n` +
`    window.__ModuleLoader__.load({ id, factory })\n` +
`  }\n` +
`})()\n`

if (process.argv.includes('--check')) {
  const current = await readFile(outputPath, 'utf8').catch(() => '')
  if (current !== output) {
    throw new Error('client.js 不是最新产物；请执行 npm run build:client')
  }
} else {
  await writeFile(outputPath, output, 'utf8')
}
