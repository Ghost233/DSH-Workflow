import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const sha = bytes => createHash('sha256').update(bytes).digest('hex')

/** Bundle the upstream-tested official CLI; installation never downloads it. */
export async function bundleLarkCli({ resourcesRoot, download } = {}) {
  const pin = JSON.parse(await readFile(join(resourcesRoot, 'workflow/vendor/lark-cli.upstream.json'), 'utf8'))
  if (pin.repository !== 'https://github.com/larksuite/cli' || !/^\d+\.\d+\.\d+$/.test(pin.version)
    || pin.archive !== `lark-cli-${pin.version}-darwin-arm64.tar.gz`
    || !/^[a-f0-9]{64}$/.test(pin.archiveSha256) || !/^[a-f0-9]{64}$/.test(pin.binarySha256)) throw new Error('无效的飞书 CLI 固定来源。')
  const temporary = await mkdtemp(join(tmpdir(), 'dsh-lark-cli-')), archive = join(temporary, pin.archive)
  let failure
  try {
    const url = `${pin.repository}/releases/download/v${pin.version}/${pin.archive}`
    if (download) await download(url, archive)
    else await exec('/usr/bin/curl', ['-fsSL', '--connect-timeout', '20', '--retry', '2', '-o', archive, url], { timeout: 120_000 })
    if (sha(await readFile(archive)) !== pin.archiveSha256) throw new Error('飞书 CLI 下载内容的 SHA256 不匹配。')
    const entries = (await exec('/usr/bin/tar', ['-tzf', archive])).stdout.trim().split('\n')
    if (['lark-cli', 'LICENSE'].some(required => entries.filter(name => name === required).length !== 1)
      || entries.some(name => !['lark-cli', 'LICENSE', 'README.md', 'CHANGELOG.md'].includes(name))) {
      throw new Error('飞书 CLI 压缩包内容不符合固定格式。')
    }
    await exec('/usr/bin/tar', ['-xzf', archive, '-C', temporary, 'lark-cli', 'LICENSE'])
    const source = join(temporary, 'lark-cli'), info = await lstat(source)
    if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || sha(await readFile(source)) !== pin.binarySha256) {
      throw new Error('飞书 CLI 可执行文件校验失败。')
    }
    const license = join(temporary, 'LICENSE'), licenseInfo = await lstat(license)
    if (!licenseInfo.isFile() || licenseInfo.isSymbolicLink() || licenseInfo.nlink !== 1) throw new Error('飞书 CLI 许可证文件无效。')
    await mkdir(join(resourcesRoot, 'licenses'), { recursive: true })
    await copyFile(license, join(resourcesRoot, 'licenses/lark-cli-LICENSE.txt'), constants.COPYFILE_EXCL)
    const destination = join(resourcesRoot, 'bin/lark-cli')
    await copyFile(source, destination, constants.COPYFILE_EXCL)
    await chmod(destination, 0o755)
    return { version: pin.version, archiveSha256: pin.archiveSha256, binarySha256: pin.binarySha256 }
  } catch (error) { failure = error; throw error }
  finally {
    try { await rm(temporary, { recursive: true, force: true }) }
    catch (error) { if (!failure) throw error; console.error(`飞书 CLI 临时目录清理失败：${temporary}`) }
  }
}
