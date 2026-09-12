// DSH browser module. React is supplied by the host's shared module loader.
window.__ModuleLoader__.load({ id: 'dsh-sol-efficiency', factory(require) {
  const { createElement: h, useState, useSyncExternalStore } = require('react')

  function Card({ scope }) {
    const state = useSyncExternalStore(listener => scope.subscribe(listener), () => scope.getSnapshot())
    const [saving, setSaving] = useState(false)
    const [error, setError] = useState('')
    const ready = state.status === 'ready' && state.writable && !saving
    const toggle = async (field, enabled) => {
      setSaving(true)
      setError('')
      try {
        await scope.set(field, { ...scope.getSnapshot().value[field], enabled })
        // DSH scopes recover on a rejected write rather than throwing; check the confirmed value.
        if (scope.getSnapshot().value?.[field]?.enabled !== enabled) throw new Error('设置未保存，请重试。')
      } catch (err) {
        setError(err instanceof Error ? err.message : '设置未保存，请重试。')
      } finally { setSaving(false) }
    }
    const checkbox = (field, title, description) => h('label', {
      key: field, style: { display: 'block', marginTop: 14, cursor: ready ? 'pointer' : 'default' },
    }, h('input', {
      type: 'checkbox', checked: state.value?.[field]?.enabled === true, disabled: !ready,
      onChange: event => { void toggle(field, event.target.checked) },
    }), ' ', title, h('div', { style: { margin: '4px 0 0 22px', fontSize: 12, opacity: 0.7 } }, description))
    return h('section', { 'aria-label': 'SoL Efficiency', style: {
      padding: 16, border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 12,
    } },
    h('h3', { style: { margin: 0 } }, 'SoL Efficiency'),
    h('p', { style: { fontSize: 12, opacity: 0.7 } }, '勾选启用，取消勾选关闭。自动保存，无需重启。'),
    checkbox('actionFusion', '动作融合（Action Fusion）', '合并编辑与验证，减少一次模型往返；继续使用原生工具权限。'),
    checkbox('evidenceReducer', '日志压缩（EPR）', '默认沿用当前会话模型。符合条件的完整诊断日志会发送给模型，可能产生额外费用；压缩失败保留原文。'),
    saving && h('p', { role: 'status' }, '正在保存…'),
    !state.writable && h('p', { role: 'status' }, '当前连接不可写，请从本机 DSH 设置操作。'),
    error && h('p', { role: 'alert' }, error))
  }

  const inject = ['slots', 'settingsScope']
  const apply = ctx => {
    const scope = ctx.settingsScope.bind({ namespace: 'sol-efficiency' })
    const render = () => h(Card, { scope })
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
      name: 'settings.plugin.item', key: 'sol-efficiency',
    }, render))
  }
  return { inject, apply }
} })
