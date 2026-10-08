const React = require('react')
const createJevCenterRemoteDescriptor = require('./jev-center-remote.cjs')
const createAgentMonitorRemoteDescriptor = require('./agent-monitor-remote.cjs')
const { createElement: h, useEffect, useRef, useState, useSyncExternalStore } = React

function NativeJevSettings({ scope, kind, view, saveCredential, testConnection, monitor }) {
  const snapshot = useSyncExternalStore(listener => scope.subscribe(listener), () => scope.getSnapshot(), () => scope.getSnapshot())
  const [draft, setDraft] = useState(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [key, setKey] = useState('')
  const [selected, setSelected] = useState(0)
  const [monitorState, setMonitorState] = useState({ loading: true, value: null })
  const refreshMonitor = useRef(() => {})
  const isCenter = kind === 'center'
  const engines = snapshot.value?.engines ?? []
  const isNew = selected < 0 || !engines[selected]
  const value = draft ?? (isCenter ? engines[selected] ?? {
    url: 'https://api.typesafe.ai', upstreamModel: 'jev-latest', modelName: '', credentialRef: 'TYPESAFE_API_KEY', enabled: true, timeoutMs: 5000,
  } : snapshot.value) ?? {}
  const fields = isCenter ? [
    ['url', '服务 URL', 'text'], ['upstreamModel', '上游模型名', 'text'],
    ['modelName', '调用模型名（留空沿用上游模型名）', 'text'], ['credentialRef', '凭据引用', 'text'],
    ['timeoutMs', '请求超时（毫秒）', 'number'], ['enabled', '启用', 'checkbox'],
  ] : [['checkIntervalMs', '检查间隔（毫秒）', 'number'], ['noOutputThreshold', '连续无输出告警次数', 'number'],
    ['jevModelName', 'JEV 调用模型名', 'select'], ['semanticWaitMs', '语义检测起始等待（毫秒）', 'number'],
    ['semanticThreshold', '连续明确语义异常告警次数', 'number'], ['debugEvidence', '记录调试会话片段', 'checkbox']]
  useEffect(() => {
    if (isCenter || view === 'summary') return
    let active = true, generation = 0
    const refresh = async () => {
      const current = ++generation
      try {
        const response = await monitor.read()
        if (active && current === generation) setMonitorState({ loading: false, value: response.ok ? response.value : null })
      } catch { if (active && current === generation) setMonitorState({ loading: false, value: null }) }
    }
    const stop = monitor.subscribe(() => { setMonitorState({ loading: false, value: null }); void refresh() })
    refreshMonitor.current = refresh
    void refresh()
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => { active = false; clearInterval(timer); stop(); refreshMonitor.current = () => {} }
  }, [isCenter, view, monitor, snapshot.revision])
  const models = monitorState.value?.availableModels ?? []
  const modelChoices = value.jevModelName && !models.includes(value.jevModelName) ? [...models, value.jevModelName] : models
  const save = async event => {
    event.preventDefault()
    const converted = { ...value }
    for (const [name, , type] of fields) {
      if (type !== 'number') continue
      converted[name] = Number(value[name])
      if (!Number.isSafeInteger(converted[name]) || converted[name] <= 0) { setMessage('请输入正整数'); return }
    }
    const nextEngines = isNew ? [...engines, converted] : engines.map((engine, index) => index === selected ? converted : engine)
    if (isCenter) {
      try { createJevCenterRemoteDescriptor.assertUniqueModelNames(nextEngines) }
      catch { setMessage('已启用的调用模型名重复，请改名后保存'); return }
    }
    const ops = isCenter ? [{ op: 'set', path: ['engines'], value: nextEngines }]
      : fields.filter(([name]) => converted[name] !== snapshot.value?.[name]).map(([name]) => ({ op: 'set', path: [name], value: converted[name] }))
    setBusy(true)
    setMessage('正在保存…')
    try {
      if (await scope.mutate(ops, snapshot.revision)) {
        if (isCenter && isNew) setSelected(nextEngines.length - 1)
        setDraft(null); setMessage('配置已保存')
      }
      else setMessage('保存失败，配置未被接受')
    } catch { setMessage('保存失败，请检查配置与连接') }
    finally { setBusy(false) }
  }
  const selectEngine = index => { setSelected(index); setDraft(null); setKey(''); setMessage('') }
  const deleteEngine = async () => {
    const remaining = engines.filter((_, index) => index !== selected)
    setBusy(true)
    try {
      if (await scope.mutate([{ op: 'set', path: ['engines'], value: remaining }], snapshot.revision)) {
        selectEngine(Math.max(0, Math.min(selected, remaining.length - 1)))
        setMessage('配置已删除，凭据已保留')
      } else setMessage('删除失败，配置未被接受')
    } catch { setMessage('删除失败，请检查连接') }
    finally { setBusy(false) }
  }
  const storeCredential = async event => {
    event.preventDefault()
    setBusy(true)
    try {
      const result = await saveCredential(value.credentialRef, key)
      if (result.ok) { setKey(''); setMessage('凭据已保存') }
      else setMessage('凭据保存失败，请检查凭据引用与权限')
    } catch { setMessage('凭据保存失败，请检查连接') }
    finally { setBusy(false) }
  }
  const checkConnection = async () => {
    const engine = engines[selected]
    if (!engine) { setMessage('请先保存引擎配置'); return }
    setBusy(true)
    setMessage('正在测试连接…')
    try {
      const response = await testConnection(engine.modelName || engine.upstreamModel)
      if (!response.ok) setMessage('连接测试失败，请检查连接与配置')
      else if (!response.value.ok) setMessage(response.value.error?.message ?? 'JEV 无法完成判断')
      else setMessage(`连接成功\n模型：${response.value.model}\n耗时：${response.value.elapsedMs} 毫秒`)
    } catch { setMessage('连接测试失败，请检查连接与配置') }
    finally { setBusy(false) }
  }
  if (view === 'summary') return isCenter ? '统一管理 JEV 判断配置与凭据。' : '仅检测、通知并记录代理无输出。'
  return h('section', { className: 'dsh-jev-native-settings' },
    h('h2', null, isCenter ? 'JEV 中心' : '代理监控'),
    snapshot.writable ? null : h('p', { role: 'note' }, '当前连接不允许修改设置。'),
    isCenter ? h('div', null,
      h('label', null, 'JEV 引擎配置列表', h('select', { value: isNew ? 'new' : String(selected), disabled: !snapshot.writable || busy,
        onChange: event => selectEngine(event.target.value === 'new' ? -1 : Number(event.target.value)) },
        ...engines.map((engine, index) => h('option', { key: index, value: String(index) },
          `${index + 1}. ${engine.modelName || engine.upstreamModel}${engine.enabled ? '' : '（停用）'}`)),
        isNew ? h('option', { value: 'new' }, '新配置（未保存）') : null)),
      h('button', { type: 'button', disabled: !snapshot.writable || busy, onClick: () => selectEngine(-1) }, '新增配置'),
      h('button', { type: 'button', disabled: !snapshot.writable || busy || isNew, onClick: deleteEngine }, '删除配置'),
    ) : null,
    h('form', { 'aria-label': isCenter ? 'JEV 引擎配置' : '代理监控设置', onSubmit: save },
      ...fields.map(([name, label, type]) => h('label', { key: name }, label, type === 'select' ? h('select', {
        name, value: value[name] ?? '', disabled: !snapshot.writable || busy,
        onChange: event => setDraft({ ...value, [name]: event.target.value }),
      }, h('option', { value: '' }, '未选择模型'), ...modelChoices.map(modelName => h('option', { key: modelName, value: modelName },
        modelName + (models.includes(modelName) ? '' : '（不可用）')))) : h('input', {
        name, type, disabled: !snapshot.writable || busy, required: type !== 'checkbox' && name !== 'modelName',
        ...(type === 'number' ? { min: 1, step: 1 } : {}),
        ...(type === 'checkbox' ? { checked: Boolean(value[name]) } : { value: value[name] ?? '' }),
        onChange: event => setDraft({ ...value, [name]: type === 'checkbox' ? event.target.checked : event.target.value }),
      }))),
      h('button', { type: 'submit', disabled: !snapshot.writable || busy }, '保存配置'),
    ),
    isCenter ? h('form', { 'aria-label': 'JEV 凭据', onSubmit: storeCredential },
      h('label', null, '密钥', h('input', { type: 'password', autoComplete: 'new-password', value: key, required: true,
        disabled: !snapshot.writable || busy, onChange: event => setKey(event.target.value) })),
      h('button', { type: 'submit', disabled: !snapshot.writable || busy }, '保存到 DSH 凭据管理'),
    ) : null,
    isCenter ? h('button', { type: 'button', disabled: !snapshot.writable || busy, onClick: checkConnection }, '测试连接') : null,
    h('p', { role: 'status' }, message),
    !isCenter ? h('section', { 'aria-label': '代理监控状态' },
      h('button', { type: 'button', onClick: () => { void refreshMonitor.current() } }, '刷新监控状态'),
      monitorState.loading ? h('p', null, '正在读取代理监控状态…') : !monitorState.value ? h('p', { role: 'alert',
        className: 'dsh-monitor-engine-unavailable' }, '代理监控状态暂不可用，请检查监控服务与连接。') :
        h('p', { role: monitorState.value.engineAvailability?.available ? undefined : 'alert',
          className: monitorState.value.engineAvailability?.available ? undefined : 'dsh-monitor-engine-unavailable' },
        monitorState.value.engineAvailability?.available ? 'JEV 引擎可用' :
          'JEV 引擎不可用：' + (monitorState.value.engineAvailability?.reason ?? '判断状态未知')),
      h('h3', null, '监控告警'),
      h('div', { role: 'log', 'aria-label': '监控告警', 'aria-live': 'off' },
        ...(monitorState.value?.alerts ?? []).slice().reverse().map((alert, index) => h('article', { key: index },
          h('strong', null, `${alert.role === 'child' ? '子代理' : '主代理'} ${alert.agentId} [${alert.kind}]`),
          h('p', null, `请求：${alert.attemptId ?? `${alert.turn ?? '?'}:${alert.step ?? '?'}`} · ${new Date(alert.at).toLocaleString()}`),
          h('p', null, alert.reason),
          alert.recoveredAt ? h('p', null, `恢复：${new Date(alert.recoveredAt).toLocaleString()}`) : null,
        )),
        monitorState.value?.alerts?.length ? null : h('p', null, '暂无告警'),
      ),
    ) : null,
  )
}

function registerNativeJevSettings(ctx) {
  let credentialAction, connectionAction, monitorAction
  const monitorListeners = new Set()
  const monitor = { read: () => monitorAction?.() ?? Promise.resolve({ ok: false }),
    subscribe: listener => { monitorListeners.add(listener); return () => monitorListeners.delete(listener) } }
  ctx.inject(['remote', 'typert'], child => {
    child.effect(() => child.remote.$mount({ package: 'dsh-workflow', descriptors: [createJevCenterRemoteDescriptor(), createAgentMonitorRemoteDescriptor()] }), 'JEV and monitor Remote descriptors')
    child.inject(['remote.jevCenter'], remote => {
      connectionAction = modelName => remote.remote.jevCenter.testConnection(modelName)
      remote.effect(() => () => { connectionAction = undefined }, 'JEV connection-test caller lifetime')
    })
    child.inject(['remote.agentMonitor'], remote => {
      monitorAction = () => remote.remote.agentMonitor.snapshot()
      for (const listener of monitorListeners) listener()
      remote.effect(() => () => {
        monitorAction = undefined
        for (const listener of monitorListeners) listener()
      }, 'Agent monitor read-only caller lifetime')
    })
  })
  ctx.inject(['remote', 'remote.credentials'], child => {
    credentialAction = (ref, key) => child.remote.credentials.set(ref, key)
    child.effect(() => () => { credentialAction = undefined }, 'JEV credential editor lifetime')
  })
  ctx.inject(['configForms'], child => {
    for (const [ns, id, label, kind, order] of [
      ['workflow-jev-center', 'workflow-jev-center', 'JEV 中心', 'center', 80],
      ['workflow-agent-monitor', 'workflow-agent-monitor', '代理监控', 'monitor', 81],
    ]) {
      child.effect(() => child.configForms.whileServed([ns], () => {
        const disposers = ['settings.section', 'plugins.item'].map(name => child.slots.inject(name, () => child.slots.register({
          name, id, label, order, inject: () => ({ scope: child.configForms.get(ns), kind, monitor,
            saveCredential: (ref, key) => credentialAction?.(ref, key) ?? Promise.resolve({ ok: false }),
            testConnection: modelName => connectionAction?.(modelName) ?? Promise.resolve({ ok: false }),
          }),
        }, NativeJevSettings)))
        return () => { for (const dispose of disposers) dispose() }
      }), `${id}: native configuration page`)
    }
  })
}


exports.inject = ['slots']
exports.apply = function apply(ctx) {
  const style = document.createElement('style')
  style.textContent = ".dsh-jev-native-settings{max-width:720px;padding:16px;color:var(--dsw-alias-label-primary)}.dsh-jev-native-settings form{display:flex;flex-direction:column;gap:14px;margin-bottom:20px}.dsh-jev-native-settings label{display:flex;flex-direction:column;gap:6px;font-size:13px}.dsh-jev-native-settings input{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:inherit;background:var(--dsw-alias-bg-layer-2)}.dsh-jev-native-settings input[type=checkbox]{width:18px;height:18px}.dsh-jev-native-settings button{align-self:flex-start;padding:8px 14px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;cursor:pointer;color:inherit;background:var(--dsw-alias-bg-layer-2)}.dsh-jev-native-settings button:disabled,.dsh-jev-native-settings input:disabled{opacity:.55;cursor:default}.dsh-jev-native-settings p{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}\n.dsh-jev-native-settings select{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:inherit;background:var(--dsw-alias-bg-layer-2)}.dsh-monitor-engine-unavailable{color:var(--dsw-alias-state-error-primary)}.dsh-jev-native-settings article{border-top:1px solid var(--dsw-alias-border-l2);padding:12px 0}"
  document.head.appendChild(style)
  ctx.effect(() => () => style.remove())
  registerNativeJevSettings(ctx)
}
exports.default = { inject: exports.inject, apply: exports.apply }
