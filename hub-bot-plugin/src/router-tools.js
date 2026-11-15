/**
 * The L1 router tool plugin — loaded as a STATIC row inside the hub-bot-router preset's plugins list
 * (cordis.patch.yml), because the stage-1 review proved a custom preset's tool surface is a mounted subtree
 * (dsh-agent-preset-registry mountPreset) that runtime decoration from the root plugin cannot reach. Registering
 * from inside the subtree is exactly how the preset's other tool rows (tool-fs etc.) land their tools.
 *
 * Two contributions, both scoped to the preset:
 *   - the five L1 tools of the spec (list_owners / create_owner / route_to_owner / query_tasks / reply_source),
 *     executing against the process-wide hub singleton (src/hub.js — same package, same module instance);
 *   - the router persona, registered under the name dsh-system-prompt reserves for preset shadowing
 *     ("deployment:persona-prefix"), replacing the deployment persona for agents of this preset.
 */
import { getHub } from './hub.js'
import { routerPersona, PERSONA_PREFIX_SECTION, PERSONA_PREFIX_ORDER } from './persona.js'

export const name = 'hub-bot-router-tools'
// tools/systemPrompt are the services the tools and persona use. sessionController/sessionPersistence are
// LOAD-BEARING without being called: a mounted preset subtree is a separate module realm whose service-name
// resolution follows the isolate chain of its injected services (empirically established in the task-2 live
// review: with only tools+systemPrompt injected, neither ctx.reflect.get('hubBot') nor a globalThis singleton
// resolved; extending inject with two root-composition services made 'hubBot' — provided by the root plugin at
// ctx.root — resolvable). Removing them silently leaves the row pending with no tools registered.
export const inject = ['tools', 'systemPrompt', 'sessionController', 'sessionPersistence']

/**
 * The installed hub, or a model-readable failure when the root plugin is absent from the composition. The hub
 * crosses realms as the 'hubBot' service (the root plugin provides it; this subtree sees it like a Host service);
 * the globalThis channel remains as a fallback for same-realm embedders.
 */
function hub(ctx) {
  const found = ctx.reflect.get('hubBot', false) ?? getHub()
  if (!found) throw new Error('hub-bot root plugin is not running in this profile — the router tools need its store and Sessions port')
  return found
}

/** Registers one tool with a JSON-schema parameters object and a plain-text render. */
function register(ctx, tool) {
  ctx.tools.register(tool)
}

export function apply(ctx) {
  // Resolve the hub once at apply time: fail fast (and loudly in the loader log) when the root plugin is absent.
  const api = hub(ctx)
  ctx.systemPrompt.section({ name: PERSONA_PREFIX_SECTION, order: PERSONA_PREFIX_ORDER, text: routerPersona({ homeRepo: api.config.homeRepo }) })

  register(ctx, {
    name: 'list_owners',
    description: '列出负责人注册表：每个负责人的 id、形态（repo/dir/scratch）、cwd、会话与创建状态。路由前先调它。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { owners: { type: 'array' } }, required: ['owners'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.owners.length === 0
        ? '（注册表为空）'
        : value.owners.map(o => o.id + ' | ' + o.kind + (o.workspace ? ' ' + o.workspace : '') + ' | cwd=' + o.cwd + ' | ' + o.status + (o.sessionId ? ' | session=' + o.sessionId : '')).join('\n') }],
    },
    execute: async () => ({ owners: api.registry.list() }),
  })

  register(ctx, {
    name: 'create_owner',
    description: '创建动态负责人：repo（需 workspace+cwd）、dir（需 cwd，目录即身份，不猜）、scratch（自动分配临时目录）。已存在的身份返回原行。',
    parameters: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['repo', 'dir', 'scratch'], description: '负责人类型' },
        workspace: { type: 'string', description: 'repo 类必填：仓库名' },
        cwd: { type: 'string', description: 'repo/dir 类必填：绝对路径' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { owner: { type: 'object' } }, required: ['owner'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.owner.id + '（' + value.owner.kind + '，' + value.owner.status + '）cwd=' + value.owner.cwd }],
    },
    execute: async args => ({ owner: api.registry.create({ kind: args.kind, cwd: args.cwd, workspace: args.workspace }) }),
  })

  register(ctx, {
    name: 'route_to_owner',
    description: '把一条消息路由给指定负责人：负责人会话不存在则懒创建（cwd=注册表目录），消息含授权记录注入其会话。任务先存为待触发、由可靠投递转进行中；瞬时失败自动 2 秒退避重试，无需重复调用。同一 triggerRef 重复路由只建一个任务。带 ticketId 时是追问：等验收/等回复/等确认/被卡住/失败的票被释放回进行中并注入追问，不新建票（追问不重新绑定触发与授权）；ticketId + resolution:"accept" 是用户验收、票转完成；resolution:"cancel" 取消一个等确认的票；二者都不注入。',
    parameters: {
      type: 'object',
      properties: {
        ownerId: { type: 'string', description: 'list_owners 返回的负责人 id' },
        message: { type: 'string', description: '要注入的消息原文（追问时即追问内容）' },
        triggerRef: { type: 'string', description: '可选：来源消息 id（幂等键），同一来源重复注入不重复建任务' },
        ticketId: { type: 'string', description: '可选：追问/验收的目标任务票（query_tasks 取得）' },
        resolution: { type: 'string', enum: ['accept', 'cancel'], description: '可选：accept = 用户验收通过（票须在等您验收）；cancel = 用户取消（票须在等您确认）' },
      },
      required: ['ownerId', 'message'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { ownerId: { type: 'string' }, sessionId: { type: 'string' }, ticketId: { type: 'string' } }, required: ['ownerId'], additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: value.accepted
        ? '已验收：任务 ' + value.ticketId + ' 完成'
        : value.cancelled
          ? '已取消：任务 ' + value.ticketId + ' 完成'
          : value.deduped
            ? '已去重：任务 ' + value.ticketId
            : value.resumed
              ? '已恢复任务 ' + value.ticketId + ' 并注入追问（会话 ' + value.sessionId + (value.rebuilt ? '，已重建' : '') + '）'
              : value.stage === 'idle'
                ? '已存任务 ' + value.ticketId + '（待触发：注入暂未送达，自动重试中，勿重复调用）'
                : '已路由到 ' + value.ownerId + '（会话 ' + value.sessionId + (value.createdSession ? '，新建' : '') + (value.rebuilt ? '，已重建' : '') + '；任务 ' + value.ticketId + '）' }],
    },
    execute: async args => await api.router.routeToOwner({ ownerId: args.ownerId, message: args.message, triggerRef: args.triggerRef, ticketId: args.ticketId, resolution: args.resolution }),
  })

  register(ctx, {
    name: 'query_tasks',
    description: '查询任务存储：可按负责人 id 与阶段（stage）过滤，最新在前。',
    parameters: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: '可选：负责人 id' },
        stage: { type: 'string', description: '可选：阶段，如 working / person/review' },
      },
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { tasks: { type: 'array' } }, required: ['tasks'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: value.tasks.length === 0
        ? '（无匹配任务）'
        : value.tasks.map(t => t.id + ' | ' + t.owner + ' | ' + (t.stageText ?? t.stage) + '(' + t.stage + ')' + ' | ' + t.mechanism + ' | ' + t.createdAt).join('\n') }],
    },
    execute: async args => ({ tasks: api.router.queryTasks({ owner: args.owner, stage: args.stage }) }),
  })

  register(ctx, {
    name: 'reply_source',
    description: '经 Outbox 记录给触发来源的答复（先存后做；超过 100 词由代码截断并提示；外部投递通道随后续工单接入）。',
    parameters: {
      type: 'object',
      properties: {
        text: { type: 'string', description: '答复正文' },
        to: { type: 'string', description: '可选：来源地址，缺省为当前 DSH 会话' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { outboxId: { type: 'string' }, state: { type: 'string' } }, required: ['outboxId', 'state'], additionalProperties: false },
      render: (_args, value) => [{ type: 'text', text: '已记录答复 ' + value.outboxId + '（' + value.state + '）' }],
    },
    execute: async args => await api.router.replySource({ text: args.text, to: args.to }),
  })
}
