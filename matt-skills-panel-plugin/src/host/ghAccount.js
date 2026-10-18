/**
 * ghAccount.js — 仓库账号声明（`.ghswitch`）的唯一宿主实现。
 *
 * 职责（#39 / RGA-T01）：
 *   - 从 cwd 向上找最近的 `.ghswitch`，校验登录名，确认 `gh-profiles/<login>` 账号目录存在；
 *   - 把结果供 deck 的 gh 出站 spawn 通过 env 使用；
 *   - 生成并安装 `BASH_ENV` shim，让模型 bash 里的 gh 跟随声明账号（见下方 shim 段）。
 *
 * 边界：只读声明文件与账号目录，不保存凭据、不写 git 配置；账号目录缺省只算「无声明」，静默回落。
 * 状态：不缓存声明结果，每次调用现读（仓库里换声明后下一次命令即生效）。
 */
import { promises as nodeFs } from 'node:fs'
import os from 'node:os'
import { isAbsolute, join, parse, resolve } from 'node:path'

/** GitHub 登录名：1–39 位，字母数字开头结尾，中间允许连字符。 */
const LOGIN_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/

/**
 * @param {object} [deps]
 * @param {object} [deps.fs] node:fs/promises 形状（测试注入用）
 * @param {object} [deps.processEnv] 进程环境对象（测试注入用）
 * @param {string} [deps.homeDir] 用户 HOME
 * @param {object} [deps.logCtx] 宿主日志上下文（可选；解析失败按静默处理）
 */
export function createGhAccount(deps) {
  const d = deps || {}
  const fs = d.fs || nodeFs
  const processEnv = d.processEnv || (typeof process !== 'undefined' ? process.env : {})
  const homeDir = d.homeDir || (typeof os.homedir === 'function' ? os.homedir() : '')

  /** 账号目录的父目录：`${XDG_CONFIG_HOME:-$HOME/.config}`；相对 XDG 按未设置处理，避免与 JS/bash 的 cwd 分叉。 */
  function configBase() {
    let xdg = ''
    try { xdg = processEnv && processEnv.XDG_CONFIG_HOME } catch (e) { xdg = '' }
    return (typeof xdg === 'string' && isAbsolute(xdg)) ? xdg : join(homeDir, '.config')
  }

  async function isDirectory(p) {
    try { return (await fs.stat(p)).isDirectory() } catch (e) { return false }
  }

  /** null = 这一层没有声明；字符串 = 有声明（可能是空/非法，读失败也按空声明处理）。 */
  async function readDeclaration(dir) {
    const file = join(dir, '.ghswitch')
    try { await fs.lstat(file) } catch (e) { return null }
    try {
      const text = await fs.readFile(file, 'utf8')
      return String(text).split(/\r?\n/)[0].trim()
    } catch (e) {
      return ''
    }
  }

  /**
   * 从 cwd 向上解析账号目录。
   * 停止边界：遇到声明（最近声明说了算，非法/目录缺失都就此回落）、自带 `.git` 的目录、HOME、`/`。
   * @param {string} [cwd]
   * @returns {Promise<string|undefined>}
   */
  async function resolveGhConfigDir(cwd) {
    if (!homeDir) return undefined
    let dir
    try { dir = resolve(cwd || (typeof process !== 'undefined' ? process.cwd() : '')) } catch (e) { return undefined }
    if (!dir) return undefined
    const home = resolve(homeDir)
    const root = parse(dir).root
    for (;;) {
      const login = await readDeclaration(dir)
      if (login !== null) {
        if (!LOGIN_RE.test(login)) return undefined
        const accountDir = join(configBase(), 'gh-profiles', login)
        return (await isDirectory(accountDir)) ? accountDir : undefined
      }
      try { await fs.lstat(join(dir, '.git')) ; return undefined } catch (e) { /* 没有 .git，继续上溯 */ }
      if (dir === home || dir === root) return undefined
      const parent = resolve(dir, '..')
      if (parent === dir) return undefined
      dir = parent
    }
  }

  /**
   * 给 spawn 用的 env：只在其一解析成功时返回 GH_CONFIG_DIR，否则 null（不覆盖继承环境）。
   * @param {string} [cwd]
   * @returns {Promise<{GH_CONFIG_DIR: string}|null>}
   */
  async function envFor(cwd) {
    const dir = await resolveGhConfigDir(cwd)
    return dir ? { GH_CONFIG_DIR: dir } : null
  }

  // ============ BASH_ENV shim：模型 bash 的账号注入面 ============
  // 脚本装在 ~/.dsh/mattskillsdeck/（与 choiceStore 同一宿主缓存根），由宿主进程设置 BASH_ENV 指向它。
  // 用户原来的 BASH_ENV 被写进 shim 顶部按原顺序 source，卸载时还原；脚本永远零输出、不覆盖已有 GH_CONFIG_DIR。
  let installed = null

  /** 单引号安全地嵌入 shell 脚本。 */
  function shellQuote(value) {
    return "'" + String(value).replace(/'/g, "'\\''") + "'"
  }

  function renderShim(previousBashEnv) {
    const lines = [
      '# dsh-workflow-matt-panel · 按仓库 .ghswitch 注入 GH_CONFIG_DIR（无声明时零动作）',
      '# 只导出 GH_CONFIG_DIR；不写文件、不输出、任何一步失败都静默。',
    ]
    if (previousBashEnv) {
      const q = shellQuote(previousBashEnv)
      lines.push(`if [ -n ${q} ] && [ -r ${q} ]; then . ${q}; fi`)
    }
    lines.push(
      '_gh_home="${HOME:-}"',
      '_gh_dir="${PWD:-$_gh_home}"',
      '_gh_base="${XDG_CONFIG_HOME:-$_gh_home/.config}"',
      'case "$_gh_base" in /*) ;; *) _gh_base="$_gh_home/.config" ;; esac',
      'while [ -n "$_gh_dir" ]; do',
      '  if [ -e "$_gh_dir/.ghswitch" ] || [ -L "$_gh_dir/.ghswitch" ]; then',
      '    _gh_login=$(sed -n \'1{s/^[[:space:]]*//;s/[[:space:]]*$//;p;}\' "$_gh_dir/.ghswitch" 2>/dev/null) || _gh_login=""',
      '    case "$_gh_login" in',
      '      \'\'|*[!A-Za-z0-9-]*|-*|*-) ;;',
      '      *) if [ "${#_gh_login}" -le 39 ] && [ -d "$_gh_base/gh-profiles/$_gh_login" ]; then export GH_CONFIG_DIR="$_gh_base/gh-profiles/$_gh_login"; fi ;;',
      '    esac',
      '    break',
      '  fi',
      '  if [ -e "$_gh_dir/.git" ] || [ -L "$_gh_dir/.git" ]; then break; fi',
      '  if [ "$_gh_dir" = "$_gh_home" ]; then break; fi',
      '  if [ "$_gh_dir" = "/" ]; then break; fi',
      '  _gh_dir="${_gh_dir%/*}"',
      '  if [ -z "$_gh_dir" ]; then _gh_dir="/"; fi',
      'done',
      'unset _gh_home _gh_dir _gh_base _gh_login',
    )
    return lines.join('\n') + '\n'
  }

  /**
   * 生成/覆盖 shim 并把本进程的 BASH_ENV 指向它。
   * 返回幂等的 dispose：只在 BASH_ENV 仍指向本 shim 时还原为安装前的值（原来没有则删除）。
   */
  async function installBashEnvShim() {
    if (installed) return installed.dispose
    if (!homeDir) throw new Error('HOME unavailable: cannot install GH account BASH_ENV shim')
    const dir = join(homeDir, '.dsh', 'mattskillsdeck')
    const shimPath = join(dir, 'gh-account-env.sh')
    let previous
    try { previous = processEnv.BASH_ENV } catch (e) { previous = undefined }
    let previousShlvl
    try { previousShlvl = processEnv.SHLVL } catch (e) { previousShlvl = undefined }
    const chained = (typeof previous === 'string' && previous && previous !== shimPath) ? previous : ''
    await fs.mkdir(dir, { recursive: true })
    await fs.writeFile(shimPath, renderShim(chained), { mode: 0o600 })

    const state = { shimPath, previous, previousShlvl, changedShlvl: false, dispose: null }
    const dispose = function () {
      if (state.disposed) return
      state.disposed = true
      if (installed === state) installed = null
      // macOS 自带 bash 3.2 在父进程环境没有 SHLVL（GUI 启动的宿主常见）时不读 BASH_ENV（实测），
      // 安装时补一个 SHLVL=1 让 shim 真的被 source；卸载只在值仍是我们写的 1 时还原。
      if (state.changedShlvl) {
        let shlvl
        try { shlvl = processEnv.SHLVL } catch (e) { shlvl = undefined }
        if (shlvl === '1') {
          if (previousShlvl === undefined) {
            try { delete processEnv.SHLVL } catch (e) { processEnv.SHLVL = undefined }
          } else {
            processEnv.SHLVL = previousShlvl
          }
        }
      }
      let current
      try { current = processEnv.BASH_ENV } catch (e) { current = undefined }
      if (current !== shimPath) return
      if (previous === undefined) {
        try { delete processEnv.BASH_ENV } catch (e) { processEnv.BASH_ENV = undefined }
      } else {
        processEnv.BASH_ENV = previous
      }
    }
    state.dispose = dispose
    processEnv.BASH_ENV = shimPath
    if (previousShlvl === undefined || previousShlvl === '' || previousShlvl === '0') {
      processEnv.SHLVL = '1'
      state.changedShlvl = true
    }
    installed = state
    return dispose
  }

  return { resolveGhConfigDir, envFor, installBashEnvShim }
}
