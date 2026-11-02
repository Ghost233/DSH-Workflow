import { lstat, mkdir, readFile, readlink, rename, symlink, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'

const missing = promise => promise.catch(error => { if (error.code !== 'ENOENT') throw error })
const packageName = /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9._-]+$/

/** Link already installed daily packages without replacing a Superagent user's files. */
export async function syncSuperagentPackages({ daily, profile, packages }) {
  const source = JSON.parse(await readFile(join(daily, 'package.json'), 'utf8'))
  const manifestPath = join(profile, 'package.json'), before = await readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(before), skipped = [], created = []
  const modules = join(profile, 'node_modules'), modulesInfo = await lstat(modules)
  if (!modulesInfo.isDirectory() || modulesInfo.isSymbolicLink()) throw new Error('Superagent 插件目录不安全。')
  manifest.dependencies ??= {}
  for (const name of new Set(packages)) {
    if (typeof name !== 'string' || !packageName.test(name)
      || ['dsh-superagent', '@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'].includes(name)) continue
    const target = join(daily, 'node_modules', name), link = join(profile, 'node_modules', name)
    try {
      const pkg = JSON.parse(await readFile(join(target, 'package.json'), 'utf8'))
      if (pkg.name !== name) throw new Error('包身份不匹配')
      const existing = await missing(lstat(link))
      if (existing && (!existing.isSymbolicLink() || resolve(dirname(link), await readlink(link)) !== resolve(target))) {
        throw new Error('已有其他插件文件，已保留原文件')
      }
      if (!existing) {
        if (dirname(link) !== modules) {
          const parent = dirname(link)
          await mkdir(parent, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error })
          const info = await lstat(parent)
          if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('已有的插件命名空间不是安全目录')
        }
        await symlink(target, link)
        created.push(link)
      }
      manifest.dependencies[name] ??= source.dependencies?.[name] ?? `file:${target}`
    } catch (error) { skipped.push({ package: name, reason: error.code === 'ENOENT' ? '日常 DSH 插件未安装' : error.message }) }
  }
  const text = JSON.stringify(manifest, null, 2) + '\n'
  if (JSON.stringify(manifest) === JSON.stringify(JSON.parse(before))) return { skipped }
  const temporary = `${manifestPath}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, text, { flag: 'wx', mode: 0o600 })
    if (await readFile(manifestPath, 'utf8') !== before) throw new Error('Superagent profile 在共享插件时被更改，已保留原配置。')
    await rename(temporary, manifestPath)
  } catch (error) {
    for (const link of created.reverse()) await missing(unlink(link))
    throw error
  } finally { await missing(unlink(temporary)) }
  return { skipped }
}
