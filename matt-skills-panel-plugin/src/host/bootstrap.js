// src/host/bootstrap.js —— 启动技底与技能名单（H1 #445 从 host/index.js 31–215/235–249 搬出，纯结构、行为零变化）
// 以后谁改它：改启动装配、兜底技能 provider 或技能名单惰性加载的人。预估约 250 行，超 350 打回。
// 接线：由 index.js 动态 import 动态加载，依赖全显式传入（仅 ctx）；本文件不引用其他新文件。
export function createBootstrap() {
    // 此本地面板版只展示任务；中文技能由项目的文件提供器加载。
    // 技能名单（#280 单一真源：与 check-catalog + client SKILLS 同步；拼写以真实目录为准，B 语义由 skills.get 覆盖）
    // 真源 = shared/matt-skills.js（MATT_SKILL_PROBE_NAMES）。本字段由 getMattSkillProbeNames() 惰性加载。
    let SKILL_PROBE_NAMES = null
    async function getMattSkillProbeNames() {
      if (SKILL_PROBE_NAMES) return SKILL_PROBE_NAMES
      try {
        const m = await import('../shared/matt-skills.js')
        SKILL_PROBE_NAMES = (m && (m.MATT_SKILL_PROBE_NAMES || m.default?.MATT_SKILL_PROBE_NAMES)) || null
        if (!SKILL_PROBE_NAMES) throw new Error('shared/matt-skills.js 未导出 MATT_SKILL_PROBE_NAMES')
      } catch (e) {
        // 兜底：内联一份与真源一致的常量（仅在 shared 文件丢失时使用；CI/构建必须保证真源在场）
        SKILL_PROBE_NAMES = ['ask-matt','code-review','codebase-design','diagnosing-bugs','domain-modeling','grill-with-docs','implement','implement-spec','improve-codebase-architecture','prototype','research','resolving-merge-conflicts','setup-matt-pocock-skills','tdd','to-spec','to-tickets','triage','wayfinder','wizard','grill-me','grilling','handoff','teach','to-questionnaire','wait-what','writing-for-agents']
      }
      return SKILL_PROBE_NAMES
    }
  return { getMattSkillProbeNames }
}
