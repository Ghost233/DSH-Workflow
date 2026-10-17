import { symlink, mkdir, writeFile, chmod } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { copyProjectIntegration } from '../../project-resources.mjs'
import { bundleServiceEnvironment } from '../../service-environment.mjs'

const [artifact, destination, scenario] = process.argv.slice(2)
if (!artifact || !destination) throw new Error('Pass frozen packaged resources and an owned staging directory')
await mkdir(destination, { recursive: true })
const projectRoot = resolve(import.meta.dirname, '../../..')
await copyProjectIntegration(projectRoot, join(destination, 'workflow'))
await bundleServiceEnvironment(projectRoot, destination)
for (const name of ['node', 'node_modules', 'desktop']) await symlink(join(resolve(artifact), name), join(destination, name))
// Exclude unrelated network endpoints only in this isolated acceptance profile.
const home = resolve(destination, '../home')
await mkdir(join(home, 'profiles/desktop'), { recursive: true })
const patches = [
  { id: 'workflow-mcp-codegraph', disabled: true },
  { id: 'web-runtime', config: { openBrowser: false, printUrl: false } },
  { id: 'hmr', disabled: true }, { id: 'session-telemetry-otel', disabled: true },
  { id: 'session-title-llm', disabled: true }, { id: 'desktop-product-telemetry', disabled: true },
  { id: 'product-analytics', disabled: true },
  { id: 'session-persistence-jsonl', config: { root: resolve(destination, '../sessions') } },
]

if (scenario === '--login-shell') {
  const osHome = resolve(destination, '../os-home')
  const tools = join(osHome, 'owned-tools')
  await mkdir(tools, { recursive: true })
  const setup = 'export PATH="$HOME/owned-tools:$PATH"\nexport S01_EXISTING_TOOLCHAIN=from-login-shell\n'
  for (const file of ['.zprofile', '.bash_profile', '.profile']) await writeFile(join(osHome, file), setup)
  const server = join(tools, 'server.mjs')
  await writeFile(server, `import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
createInterface({ input: process.stdin }).on('line', line => {
  const input = JSON.parse(line);
  if (input.id === undefined) return;
  let result = {};
  if (input.method === 'initialize') result = { protocolVersion: input.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 's01-existing-tool', version: '1.0.0' } };
  if (input.method === 'tools/list') {
    if (process.env.S01_EXISTING_TOOLCHAIN !== 'from-login-shell') process.exit(3);
    writeFileSync(${JSON.stringify(resolve(destination, '../existing-toolchain-observed'))}, 'real Host MCP process inherited login-shell PATH and variables');
    result = { tools: [] };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: input.id, result }) + '\\n');
});
`)
  const command = join(tools, 's01-existing-tool')
  await writeFile(command, '#!/bin/sh\nexec ' + JSON.stringify(join(resolve(artifact), 'node')) + ' ' + JSON.stringify(server) + '\n')
  await chmod(command, 0o700)
  patches.push({ insert: [{ id: 's01-existing-tool', name: '@deepseek-ai/dsh-mcp-client', config: {
    serverName: 's01-existing-tool', transport: 'stdio', command: 's01-existing-tool', args: [], failOnStartupError: true,
  } }] })
}
await writeFile(join(home, 'profiles/desktop/cordis.patch.yml'), JSON.stringify(patches))
