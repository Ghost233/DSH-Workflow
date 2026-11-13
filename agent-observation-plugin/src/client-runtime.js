const { createElement: h, useEffect, useRef, useState } = require('react')
const createDeliveryRemoteDescriptor = require('./delivery-remote.cjs')

function DeliverySettings({ read }) {
  const [state, setState] = useState({ loading: true })
  const refresh = useRef(() => {})
  useEffect(() => {
    let active = true, generation = 0
    refresh.current = async () => {
      const current = ++generation
      setState({ loading: true })
      try {
        const result = await read()
        if (active && current === generation) setState(result.ok ? { report: result.value } : { error: true })
      } catch { if (active && current === generation) setState({ error: true }) }
    }
    void refresh.current()
    return () => { active = false; refresh.current = () => {} }
  }, [read])
  const status = { fixed: '符合仓库固定值', drift: '版本偏差', unknown: '未能核验', untracked: '仓库未固定' }
  return h('section', { className: 'dsh-workflow-delivery-settings', 'aria-label': '组件版本与来源' },
    h('h2', null, '组件版本与来源'),
    h('p', null, '组件随本仓库正式 DMG 统一交付。此页只读；未启用条目的版本仅表示当前 Host 的解析结果。'),
    h('button', { type: 'button', disabled: state.loading, onClick: () => { void refresh.current() } }, '刷新组件清单'),
    state.loading ? h('p', { role: 'status' }, '正在读取组件清单…') : state.error ? h('p', { role: 'alert' }, '组件清单暂不可用，请检查服务连接后刷新。') :
      h('div', { style: { overflowX: 'auto' } }, h('table', null,
        h('thead', null, h('tr', null, ...['插件', '实际版本', '仓库固定值', '解析来源', '状态', '启用 / 生命周期'].map(label => h('th', { key: label }, label)))),
        h('tbody', null, ...state.report.rows.map(row => h('tr', { key: row.entryId },
          h('td', null, row.scope ? `${row.scope} · ${row.moduleName}` : row.moduleName), h('td', null, row.current ?? '未知'), h('td', null, row.expected ?? '未固定'),
          h('td', null, row.source), h('td', { title: row.error }, status[row.status] ?? '未能核验'),
          h('td', null, `${row.enabled === 'conditional' ? '条件启用' : row.enabled ? '启用' : '停用'} / ${row.fiberPhase ?? '未加载'}`),
        ))))),
  )
}

exports.inject = ['slots']
exports.apply = function apply(ctx) {
  const style = document.createElement('style')
  style.textContent = ".dsh-workflow-delivery-settings{max-width:720px;padding:16px;color:var(--dsw-alias-label-primary)}.dsh-workflow-delivery-settings button{padding:8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;cursor:pointer;color:inherit;background:var(--dsw-alias-bg-layer-2)}.dsh-workflow-delivery-settings button:disabled{opacity:.55;cursor:default}.dsh-workflow-delivery-settings p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}"
  document.head.appendChild(style)
  ctx.effect(() => () => style.remove())
  ctx.inject(['remote', 'typert'], child => {
    child.effect(() => child.remote.$mount({ package: 'dsh-workflow', descriptors: [createDeliveryRemoteDescriptor()] }), 'Project Remote descriptor')
    child.inject(['remote.workflowDelivery'], remote => {
      remote.slots.inject('settings.plugins.tab', () => remote.slots.register({
        name: 'settings.plugins.tab', id: 'workflow-delivery', label: '组件版本与来源', order: 10,
        inject: () => ({ read: () => remote.remote.workflowDelivery.list() }),
      }, DeliverySettings))
    })
  })
}
