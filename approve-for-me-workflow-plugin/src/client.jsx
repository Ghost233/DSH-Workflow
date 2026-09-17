import React, { useSyncExternalStore } from 'react'
import { SettingsController } from './settings-controller.mjs'

function Card({ controller }) {
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const { draft, host } = state
  const disabled = host.status !== 'ready' || !host.writable || state.saving
  const routes = state.groups.flatMap(group => group.models.map(model => ({
    value: JSON.stringify([group.id, model.id]), label: `${group.name} / ${model.name}`,
  })))
  const route = draft?.provider || draft?.model ? JSON.stringify([draft.provider, draft.model]) : ''
  const missing = route && !routes.some(item => item.value === route)
  const errorText = [
    ...state.errors?.shellRules.map(error => `Shell 第 ${error.line} 行：${error.code}`) ?? [],
    ...state.errors?.pwshRules.map(error => `PowerShell 第 ${error.line} 行：${error.code}`) ?? [],
    state.errors?.provider || state.errors?.model ? '请选择可用的复核模型，或沿用请求模型。' : '',
  ].filter(Boolean).join('；')
  return <section aria-label="Approve for Me" style={{ padding: 16, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12 }}>
    <h3 style={{ margin: 0 }}>Approve for Me</h3>
    <p style={{ fontSize: 12, opacity: 0.7 }}>仅在会话权限选为 Approve for me 时生效。固定高风险命令仍需人工确认；放行仅限本次调用。</p>
    {!draft ? <p role="status">审批设置暂不可用。</p> : <>
      <fieldset disabled={disabled} style={{ display: 'grid', gap: 12, border: 0, padding: 0 }}>
        <label>审批方式 <select aria-label="审批方式" value={draft.mode} onChange={event => controller.edit('mode', event.target.value)}>
          <option value="rules-and-llm">规则匹配后由模型复核</option><option value="rules-only">仅使用规则</option>
        </select></label>
        <label>Shell 命令前缀<textarea aria-label="Shell 命令前缀" rows={4} style={{ display: 'block', width: '100%' }} value={draft.shellRulesText} onChange={event => controller.edit('shellRulesText', event.target.value)} /></label>
        <label>PowerShell 命令前缀<textarea aria-label="PowerShell 命令前缀" rows={3} style={{ display: 'block', width: '100%' }} value={draft.pwshRulesText} onChange={event => controller.edit('pwshRulesText', event.target.value)} /></label>
        <small>每行一个字面命令前缀；空行和以 # 开头的行会忽略。</small>
        <label>复核模型 <select aria-label="复核模型" disabled={draft.mode !== 'rules-and-llm'} value={route} onChange={event => {
          const [provider, model] = event.target.value ? JSON.parse(event.target.value) : ['', '']
          controller.edit('provider', provider); controller.edit('model', model)
        }}><option value="">沿用请求模型</option>
          {missing && <option value={route}>{draft.provider} / {draft.model}（当前不可用，保留设置）</option>}
          {routes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select></label>
        {(state.catalogStatus === 'error' || state.partial) && <p role="status">模型目录暂不完整，已有模型设置会保留。</p>}
        <button type="button" onClick={() => void controller.loadCatalog()}>刷新模型目录</button>
        <label>复核补充说明<textarea aria-label="复核补充说明" rows={3} style={{ display: 'block', width: '100%' }} value={draft.reviewerInstructions} onChange={event => controller.edit('reviewerInstructions', event.target.value)} /></label>
      </fieldset>
      {state.conflicted && <p role="alert">其他位置已更新设置。草稿已保留，请载入最新设置后重新编辑。</p>}
      {errorText && <p role="alert">{errorText}</p>}
      {state.error && <p role="alert">{state.error}</p>}
      {state.saving && <p role="status">正在保存审批设置…</p>}
      {!host.writable && <p role="status">当前连接不可写，请从本机 DSH 设置操作。</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button type="button" disabled={disabled || !state.dirty || !state.valid || state.conflicted} onClick={() => void controller.save()}>保存审批设置</button>
        <button type="button" disabled={state.saving || !state.dirty} onClick={() => controller.discard()}>载入最新设置</button>
        <button type="button" disabled={disabled || state.conflicted} onClick={() => void controller.save(true)}>恢复默认设置</button>
      </div>
    </>}
  </section>
}

export const inject = ['slots', 'settingsScope', 'remote', 'remote.session']
export function apply(ctx) {
  const controller = new SettingsController(ctx.settingsScope.bind({ namespace: 'approve-for-me' }), ctx.remote.session)
  ctx.effect(() => () => controller.dispose(), 'approval settings lifecycle')
  ctx.on('connection/reset', () => void controller.loadCatalog())
  for (const event of ['llm/adapters-updated', 'settings/document-updated', 'credentials/reference-updated']) {
    ctx.remote.$on(event, () => void controller.loadCatalog())
  }
  void controller.loadCatalog()
  ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
    name: 'settings.plugin.item', key: 'approve-for-me',
  }, () => <Card controller={controller} />))
}
