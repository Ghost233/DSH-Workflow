// src/host/ghAccountWiring.js —— 按仓库 Git/GitHub 账号的宿主接线（#39 审查修复）
//
// 为什么单开：src/host/index.js 贴着 350 行上限（零增长基线，见 refresh/wiring.js:6 与 build.mjs G4），
// 所以 #39 的装配只留一行接线。本文件由 index.js 动态 import（D7 禁止入口静态 import 新文件），只做装配，
// 不判断业务：解析规则、账号目录校验与 shim 文本全在 ./ghAccount.js。
//
// 装起来的两件：
//   - BASH_ENV shim：config.ghAccount !== false 时经 ctx.effect 安装；安装失败只 warn，绝不拖垮插件启动；
//   - 出站 env 读取口：accountEnvFor(cwd) 自身 fail-safe —— 未就绪、加载失败、解析异常一律 null，调用点只调一次。
export function createGhAccountWiring(deps) {
  const d = deps || {}
  const ctx = d.ctx
  const config = (d.config && typeof d.config === 'object') ? d.config : {}
  const warn = function (what, e) {
    try { console.warn('[dsh-workflow-matt-panel] ' + what + ': ' + String((e && e.message) || e)) } catch (eW) {}
  }
  const ready = import('./ghAccount.js').then(function (mod) {
    return mod.createGhAccount({ processEnv: process.env })
  }).catch(function (e) {
    warn('ghAccount load failed', e)
    return null
  })
  // 规格 §deck 2：ghAccount:false 只跳过 BASH_ENV 安装；git 面与 deck 出站继续按声明走。
  if (config.ghAccount !== false) {
    try {
      ctx.effect(function () {
        return ready.then(function (account) {
          if (!account) return function () {}
          return account.installBashEnvShim().catch(function (e) {
            warn('GH account BASH_ENV shim install failed', e)
            return function () {}
          })
        })
      })
    } catch (e) {
      warn('GH account BASH_ENV effect failed', e)
    }
  }
  // 加载失败由 ready 的 catch 收敛；解析失败由 ghAccount.accountEnvFor 自己收敛，这里只转发一次调用。
  async function accountEnvFor(cwd) {
    const account = await ready
    return account ? await account.accountEnvFor(cwd) : null
  }
  return { accountEnvFor }
}
