// src/host/bootstrap.js —— 启动技底与技能名单（H1 #445 从 host/index.js 31–215/235–249 搬出，纯结构、行为零变化）
// 以后谁改它：改启动装配、兜底技能 provider 或技能名单惰性加载的人。预估约 250 行，超 350 打回。
// 接线：由 index.js 动态 import 动态加载，依赖全显式传入（仅 ctx）；本文件不引用其他新文件。
export function createBootstrap(_deps?: unknown) {
    // 此本地面板版只展示任务；中文技能由项目的文件提供器加载。
    // 技能名单（#280 单一真源：与 check-catalog + client SKILLS 同步；拼写以真实目录为准，B 语义由 skills.get 覆盖）
    // 真源 = shared/matt-skills.js（MATT_SKILL_PROBE_NAMES）。本字段由 getMattSkillProbeNames() 惰性加载。
    let SKILL_PROBE_NAMES: string[] | null = null
    async function getMattSkillProbeNames() {
      if (SKILL_PROBE_NAMES) return SKILL_PROBE_NAMES
      try {
        const m = await import('../shared/matt-skills.js')
        SKILL_PROBE_NAMES = m.MATT_SKILL_PROBE_NAMES || null
        if (!SKILL_PROBE_NAMES) throw new Error('shared/matt-skills.js 未导出 MATT_SKILL_PROBE_NAMES')
      } catch (e) {
        // 兜底：内联一份与真源一致的常量（仅在 shared 文件丢失时使用；CI/构建必须保证真源在场）
        SKILL_PROBE_NAMES = ['ask-matt','code-review','codebase-design','diagnosing-bugs','domain-modeling','grill-with-docs','implement','implement-spec','improve-codebase-architecture','prototype','research','resolving-merge-conflicts','setup-matt-pocock-skills','tdd','to-spec','to-tickets','triage','wayfinder','wizard','grill-me','grilling','handoff','teach','to-questionnaire','wait-what','writing-for-agents']
      }
      return SKILL_PROBE_NAMES
    }
    // #968 链条要的三项技能名（真源 = 链目录视图 GENERIC_CHECK_ITEMS 里挂技能探针的那几项；
    // 平时探测只问这三项，全量只在人亲手重查时问。目录增减技能项，这里跟着变，不手写第二份名单。）
    let CHAIN_SKILL_NAMES: string[] | null = null
    async function getChainSkillNames() {
      if (CHAIN_SKILL_NAMES) return CHAIN_SKILL_NAMES
      try {
        const m = await import('../shared/tracker/check-catalog-views.js')
        const items = (m && m.GENERIC_CHECK_ITEMS) || []
        CHAIN_SKILL_NAMES = items.filter(function (it: any) { return it && it.check && typeof it.check.skill === 'string' }).map(function (it: any) { return it.check.skill })
        if (!CHAIN_SKILL_NAMES.length) throw new Error('链目录里没有技能检查项')
      } catch (e) {
        // 兜底：与链目录一致的三项（仅在目录文件丢失时使用；目录在场时以上面读到的为准）
        CHAIN_SKILL_NAMES = ['wayfinder', 'setup-matt-pocock-skills', 'ask-matt']
      }
      return CHAIN_SKILL_NAMES
    }
  return { getMattSkillProbeNames, getChainSkillNames }
}
