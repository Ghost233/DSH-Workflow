// 此文件由 scripts/build-client.mjs 生成，请修改 src/client-runtime.js 后重新构建。
(() => {
  const factory = (require) => {
    const module = { exports: {} }
    const exports = module.exports
      const React = require('react')
      const {
        createElement: h,
        useEffect,
        useMemo,
        useRef,
        useState,
        useSyncExternalStore,
      } = React

      const WAIT_ENDPOINT = '/owner-workflow/api/waits'
      const POLL_INTERVAL_MS = 1000
      const CLIENT_APPLIED_MARKER = '__DSH_OWNER_WORKFLOW_WAIT_SLOTS_APPLIED__'
      const EMPTY_WAITS = Object.freeze([])
      const ALLOWED_STATES = new Set([
        'waiting_operator',
        'waiting_user_input',
        'waiting_user_approval',
        'waiting_runner',
        'running_owner',
        'waiting_dependencies',
        'waiting_workflow_decision',
        'runner_offline',
        'runner_error',
      ])

      let waitSnapshot = Object.freeze({
        phase: 'idle',
        waits: EMPTY_WAITS,
        staleWaits: EMPTY_WAITS,
        error: null,
        updatedAt: 0,
      })
      let refreshPromise
      let refreshController
      let pollTimer
      const waitListeners = new Set()

      function text(value, max = 1000) {
        return typeof value === 'string' ? value.trim().slice(0, max) : ''
      }

      function normalizeWait(value, disposition = 'active') {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
        const state = text(value.state, 100)
        const id = text(value.id, 300)
        const sessionId = text(value.sessionId, 300)
        if (id === '' || sessionId === '' || !ALLOWED_STATES.has(state)) return undefined
        return Object.freeze({
          id,
          source: text(value.source, 100),
          operationId: text(value.operationId, 300),
          workflowId: text(value.workflowId, 300),
          sessionId,
          workspaceId: text(value.workspaceId, 100),
          workspaceName: text(value.workspaceName, 300),
          title: text(value.title, 200) || '后台 Operation',
          goal: text(value.goal),
          state,
          waitingFor: text(value.waitingFor, 200),
          statusText: text(value.statusText, 300),
          detail: text(value.detail),
          action: text(value.action),
          risk: text(value.risk),
          runnerStatus: text(value.runnerStatus, 100),
          totalTasks: Number.isSafeInteger(value.totalTasks) ? value.totalTasks : 0,
          pendingTasks: Number.isSafeInteger(value.pendingTasks) ? value.pendingTasks : 0,
          runningTasks: Number.isSafeInteger(value.runningTasks) ? value.runningTasks : 0,
          queuedTasks: Number.isSafeInteger(value.queuedTasks) ? value.queuedTasks : 0,
          waitingDependencyTasks: Number.isSafeInteger(value.waitingDependencyTasks) ? value.waitingDependencyTasks : 0,
          waitingDecisionTasks: Number.isSafeInteger(value.waitingDecisionTasks) ? value.waitingDecisionTasks : 0,
          completedTasks: Number.isSafeInteger(value.completedTasks) ? value.completedTasks : 0,
          disposition,
          staleCode: text(value.staleCode, 100),
          staleReason: text(value.staleReason),
          supersededBy: text(value.supersededBy, 300),
          startedAt: text(value.startedAt, 100),
          updatedAt: text(value.updatedAt, 100),
        })
      }

      function publishWaitSnapshot(next) {
        waitSnapshot = Object.freeze(next)
        for (const listener of waitListeners) listener()
      }

      async function refreshWaits() {
        if (refreshPromise !== undefined) return refreshPromise
        refreshController = new AbortController()
        refreshPromise = (async () => {
          try {
            const response = await fetch(WAIT_ENDPOINT, {
              method: 'GET',
              cache: 'no-store',
              credentials: 'same-origin',
              headers: { Accept: 'application/json' },
              signal: refreshController.signal,
            })
            if (!response.ok) throw new Error(`等待列表接口返回 ${response.status}`)
            const body = await response.json()
            const compatibleV1 = body?.contract === 'DSH_WAIT_LIST_V1' && Array.isArray(body.waits)
            const currentV2 = ['DSH_WAIT_LIST_V2', 'DSH_WAIT_LIST_V3'].includes(body?.contract)
              && Array.isArray(body.waits)
              && Array.isArray(body.staleWaits)
            if (!compatibleV1 && !currentV2) {
              throw new Error('等待列表接口契约无效')
            }
            const waits = body.waits.map(value => normalizeWait(value, 'active')).filter(item => item !== undefined)
            const staleWaits = compatibleV1
              ? []
              : body.staleWaits.map(value => normalizeWait(value, 'stale')).filter(item => item !== undefined)
            publishWaitSnapshot({
              phase: 'ready',
              waits: Object.freeze(waits),
              staleWaits: Object.freeze(staleWaits),
              error: null,
              updatedAt: Date.now(),
            })
          } catch (error) {
            if (error?.name === 'AbortError') return
            publishWaitSnapshot({
              phase: 'error',
              waits: waitSnapshot.waits,
              staleWaits: waitSnapshot.staleWaits,
              error: error instanceof Error ? error.message : String(error),
              updatedAt: waitSnapshot.updatedAt,
            })
          } finally {
            refreshPromise = undefined
            refreshController = undefined
          }
        })()
        return refreshPromise
      }

      function subscribeWaits(listener) {
        waitListeners.add(listener)
        if (waitListeners.size === 1) {
          void refreshWaits()
          pollTimer = setInterval(() => { void refreshWaits() }, POLL_INTERVAL_MS)
        }
        return () => {
          waitListeners.delete(listener)
          if (waitListeners.size !== 0) return
          if (pollTimer !== undefined) clearInterval(pollTimer)
          pollTimer = undefined
          refreshController?.abort()
        }
      }

      function useWaitSnapshot() {
        return useSyncExternalStore(subscribeWaits, () => waitSnapshot, () => waitSnapshot)
      }

      function useDismissOnOutsidePointer(rootRef, open, setOpen) {
        useEffect(() => {
          if (!open) return undefined
          const dismiss = event => {
            if (!rootRef.current?.contains(event.target)) setOpen(false)
          }
          document.addEventListener('pointerdown', dismiss)
          return () => document.removeEventListener('pointerdown', dismiss)
        }, [open, rootRef, setOpen])
      }

      function useNow(open) {
        const [now, setNow] = useState(() => Date.now())
        useEffect(() => {
          if (!open) return undefined
          setNow(Date.now())
          const timer = setInterval(() => setNow(Date.now()), 1000)
          return () => clearInterval(timer)
        }, [open])
        return now
      }

      function elapsedText(startedAt, now) {
        const start = Date.parse(startedAt)
        if (!Number.isFinite(start)) return '未知'
        const total = Math.max(0, Math.floor((now - start) / 1000))
        const seconds = total % 60
        const minutes = Math.floor(total / 60) % 60
        const hours = Math.floor(total / 3600)
        if (hours > 0) return `${hours} 小时 ${minutes} 分`
        if (minutes > 0) return `${minutes} 分 ${seconds} 秒`
        return `${seconds} 秒`
      }

      function waitStatus(state) {
        if (state === 'waiting_user_input') return { label: '等待信息', tone: 'input' }
        if (state === 'waiting_user_approval') return { label: '等待授权', tone: 'approval' }
        if (state === 'waiting_workflow_decision') return { label: '等待决定', tone: 'input' }
        if (state === 'runner_offline') return { label: 'Runner 离线', tone: 'error' }
        if (state === 'runner_error') return { label: '执行异常', tone: 'error' }
        if (state === 'waiting_runner') return { label: '等待接管', tone: 'runner' }
        if (state === 'waiting_dependencies') return { label: '等待依赖', tone: 'dependency' }
        if (state === 'running_owner') return { label: 'Owner 执行中', tone: 'running' }
        return { label: '运行中', tone: 'running' }
      }

      function waitIdentifier(item) {
        return item.workflowId || item.operationId
      }

      function workflowTotals(waits) {
        return waits.reduce((total, item) => ({
          workflows: total.workflows + (item.source === 'workflow' ? 1 : 0),
          pending: total.pending + (item.source === 'workflow' ? item.pendingTasks : 0),
          running: total.running + (item.source === 'workflow' ? item.runningTasks : 0),
        }), { workflows: 0, pending: 0, running: 0 })
      }

      function waitSummary(waits, staleCount = 0) {
        const workflow = workflowTotals(waits)
        const operationCount = waits.filter(item => item.source === 'operation').length
        const parts = []
        if (workflow.workflows > 0) parts.push(`未执行 ${workflow.pending}`, `执行中 ${workflow.running}`)
        if (operationCount > 0) parts.push(`Operation ${operationCount}`)
        if (staleCount > 0) parts.push(`遗留 ${staleCount}`)
        return parts.length > 0 ? parts.join(' · ') : '当前没有等待事项'
      }

      function WaitDetails({ item }) {
        const identifier = waitIdentifier(item)
        return h('details', { className: 'dsh-owner-wait-details' },
          h('summary', null, '查看详情'),
          h('div', { className: 'dsh-owner-wait-detail-body' },
            h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '等待对象：'), item.waitingFor || '未知'),
            h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '运行状态：'), item.statusText || '等待中'),
            item.action === '' ? null : h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '待定动作：'), item.action),
            item.risk === '' ? null : h('div', { className: 'dsh-owner-wait-line dsh-owner-wait-risk' }, h('b', null, '风险：'), item.risk),
            item.source !== 'workflow' ? null : h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '任务统计：'), `未执行 ${item.pendingTasks} · 执行中 ${item.runningTasks} · 等待依赖 ${item.waitingDependencyTasks} · 已完成 ${item.completedTasks}`),
            h('div', { className: 'dsh-owner-wait-id', title: identifier }, identifier),
          ),
        )
      }

      function WaitItem({ item, now }) {
        const status = waitStatus(item.state)
        return h('li', { className: `dsh-owner-wait-item dsh-owner-wait-item-${status.tone}` },
          h('div', { className: 'dsh-owner-wait-card-head' },
            h('span', { className: `dsh-owner-wait-status dsh-owner-wait-status-${status.tone}` }, status.label),
            h('span', { className: 'dsh-owner-wait-elapsed' }, `已等待 ${elapsedText(item.startedAt, now)}`),
          ),
          h('div', { className: 'dsh-owner-wait-goal' }, item.goal || (item.source === 'workflow' ? 'Owner Workflow' : '后台 Operation')),
          item.detail === '' ? null : h('div', { className: 'dsh-owner-wait-current' }, item.detail),
          h(WaitDetails, { item }),
          h('div', { className: 'dsh-owner-wait-note' },
            item.source === 'workflow'
              ? item.state === 'runner_offline' || item.state === 'runner_error' || item.state === 'waiting_workflow_decision'
                ? '请在主对话处理该执行状态；现场和任务记录已保留。'
                : 'Runner 会继续驱动 Harness 内的 Owner 子代理，不会额外调用模型。'
              : item.state === 'waiting_operator'
                ? '后台完成后会自动回到主对话。'
                : '请在主对话处理；结果会继续转给后台 Operation。',
          ),
        )
      }

      function StaleWaitItem({ item, now }) {
        return h('li', { className: 'dsh-owner-wait-item dsh-owner-wait-item-stale' },
          h('div', { className: 'dsh-owner-wait-card-head' },
            h('span', { className: 'dsh-owner-wait-status dsh-owner-wait-status-stale' }, '已失效'),
            h('span', { className: 'dsh-owner-wait-elapsed' }, `创建于 ${elapsedText(item.startedAt, now)}前`),
          ),
          h('div', { className: 'dsh-owner-wait-goal' }, item.goal || '后台 Operation'),
          h('div', { className: 'dsh-owner-wait-stale-reason' }, item.staleReason || '这条记录已不能继续处理。'),
          h('details', { className: 'dsh-owner-wait-details' },
            h('summary', null, '查看记录'),
            h('div', { className: 'dsh-owner-wait-detail-body' },
              item.detail === '' ? null : h('div', { className: 'dsh-owner-wait-line' }, h('b', null, '原等待信息：'), item.detail),
              h('div', { className: 'dsh-owner-wait-id', title: item.operationId }, item.operationId),
            ),
          ),
        )
      }

      function WaitList({ waits, now, label, stale = false }) {
        if (waits.length === 0) {
          return h('div', { className: 'dsh-owner-wait-empty' }, '当前没有主动等待事项。')
        }
        return h('ul', { className: 'dsh-owner-wait-list', 'aria-label': label },
          waits.map(item => stale
            ? h(StaleWaitItem, { key: item.id, item, now })
            : h(WaitItem, { key: item.id, item, now })),
        )
      }

      function WaitSection({ title, waits, now, label }) {
        if (waits.length === 0) return null
        return h('section', { className: 'dsh-owner-wait-section' },
          h('div', { className: 'dsh-owner-wait-section-title' },
            h('span', null, title),
            h('span', { className: 'dsh-owner-wait-section-count' }, waits.length),
          ),
          h(WaitList, { waits, now, label }),
        )
      }

      function StaleWaitSection({ waits, now, label, children }) {
        if (waits.length === 0) return null
        return h('details', { className: 'dsh-owner-wait-stale-section' },
          h('summary', null,
            h('span', null, '遗留记录'),
            h('span', { className: 'dsh-owner-wait-stale-count' }, waits.length),
          ),
          children ?? h(WaitList, { waits, now, label, stale: true }),
        )
      }

      function HeaderWaitAction({ sessionId }) {
        const snapshot = useWaitSnapshot()
        const waits = useMemo(
          () => snapshot.waits.filter(item => item.sessionId === sessionId),
          [snapshot.waits, sessionId],
        )
        const staleWaits = useMemo(
          () => snapshot.staleWaits.filter(item => item.sessionId === sessionId),
          [snapshot.staleWaits, sessionId],
        )
        const [open, setOpen] = useState(false)
        const rootRef = useRef(null)
        const now = useNow(open)
        useDismissOnOutsidePointer(rootRef, open, setOpen)

        const total = waits.length + staleWaits.length
        const summary = waitSummary(waits, staleWaits.length)
        useEffect(() => {
          if (total === 0 && open) setOpen(false)
        }, [total, open])

        if (total === 0) return null
        return h('div', { ref: rootRef, className: 'dsh-owner-wait-root' },
          h('button', {
            type: 'button',
            className: waits.length > 0 ? 'dsh-owner-wait-trigger' : 'dsh-owner-wait-trigger dsh-owner-wait-trigger-stale',
            'aria-expanded': open,
            'aria-label': `查看 ${waits.length} 个主动等待和 ${staleWaits.length} 个遗留事项`,
            onClick: () => setOpen(value => !value),
          },
          h('span', { className: waits.length > 0 ? 'dsh-owner-wait-dot' : 'dsh-owner-wait-dot dsh-owner-wait-dot-stale', 'aria-hidden': 'true' }),
          waits.length > 0 ? summary : `遗留 ${staleWaits.length}`,
          h('span', { className: open ? 'dsh-owner-wait-chevron dsh-owner-wait-chevron-open' : 'dsh-owner-wait-chevron' }, '⌄')),
          open
            ? h('div', { className: 'dsh-owner-wait-menu dsh-owner-wait-menu-header' },
                h('div', { className: 'dsh-owner-wait-menu-title' },
                  h('span', null, '当前会话等待中心'),
                  h('span', { className: 'dsh-owner-wait-menu-summary' }, summary),
                ),
                waits.length === 0
                  ? h('div', { className: 'dsh-owner-wait-empty dsh-owner-wait-empty-active' }, '当前会话没有正在等待的后台 Operation。')
                  : h(WaitSection, { title: '需要处理', waits, now, label: '当前会话主动等待列表' }),
                h(StaleWaitSection, { waits: staleWaits, now, label: '当前会话遗留等待列表' }),
              )
            : null,
        )
      }

      function groupWaits(waits, sessions) {
        const groups = new Map()
        for (const item of waits) {
          let group = groups.get(item.sessionId)
          if (group === undefined) {
            const session = sessions.byId[item.sessionId]
            group = {
              sessionId: item.sessionId,
              title: session?.displayTitle || `会话 ${item.sessionId}`,
              workspaceName: item.workspaceName,
              waits: [],
            }
            groups.set(item.sessionId, group)
          }
          group.waits.push(item)
        }
        return [...groups.values()]
      }

      function SidebarWaitAction({ wide, useSessions }) {
        const snapshot = useWaitSnapshot()
        const sessions = useSessions(value => value)
        const groups = useMemo(() => groupWaits(snapshot.waits, sessions), [snapshot.waits, sessions])
        const staleGroups = useMemo(() => groupWaits(snapshot.staleWaits, sessions), [snapshot.staleWaits, sessions])
        const [open, setOpen] = useState(false)
        const rootRef = useRef(null)
        const now = useNow(open)
        useDismissOnOutsidePointer(rootRef, open, setOpen)

        const staleCount = snapshot.staleWaits.length
        const summary = waitSummary(snapshot.waits, staleCount)
        const staleContent = staleGroups.map(group => h('section', {
          key: group.sessionId,
          className: 'dsh-owner-wait-group dsh-owner-wait-group-stale',
        },
        h('div', { className: 'dsh-owner-wait-group-title', title: group.sessionId }, group.title),
        group.workspaceName === '' ? null : h('div', { className: 'dsh-owner-wait-workspace' }, group.workspaceName),
        h(WaitList, { waits: group.waits, now, label: `${group.title} 的遗留等待列表`, stale: true })))

        return h('div', { ref: rootRef, className: 'dsh-owner-wait-sidebar-root' },
          h('button', {
            type: 'button',
            className: wide ? 'dsh-owner-wait-sidebar-trigger dsh-owner-wait-sidebar-wide' : 'dsh-owner-wait-sidebar-trigger',
            'aria-expanded': open,
            'aria-label': `等待中心，${snapshot.waits.length} 个待处理，${staleCount} 个遗留`,
            title: wide ? undefined : summary,
            onClick: () => setOpen(value => !value),
          },
          h('span', { className: 'dsh-owner-wait-sidebar-icon', 'aria-hidden': 'true' }, '⏳'),
          wide ? h('span', { className: 'dsh-owner-wait-sidebar-label' }, '主动等待') : null,
          snapshot.waits.length > 0 ? h('span', { className: 'dsh-owner-wait-badge' }, snapshot.waits.length) : null,
          staleCount > 0 ? h('span', { className: 'dsh-owner-wait-stale-badge', title: `${staleCount} 个遗留记录` }, staleCount) : null,
          snapshot.phase === 'error' ? h('span', { className: 'dsh-owner-wait-error-mark', title: snapshot.error || '等待列表暂不可用' }, '!') : null),
          open
            ? h('div', { className: 'dsh-owner-wait-menu dsh-owner-wait-menu-sidebar' },
                h('div', { className: 'dsh-owner-wait-menu-title' },
                  h('div', null,
                    h('div', null, '等待中心'),
                    h('div', { className: 'dsh-owner-wait-menu-summary' }, summary),
                  ),
                  h('button', { type: 'button', className: 'dsh-owner-wait-refresh', onClick: () => { void refreshWaits() } }, '刷新'),
                ),
                snapshot.phase === 'error'
                  ? h('div', { className: 'dsh-owner-wait-warning' }, `列表暂时无法刷新：${snapshot.error}`)
                  : null,
                groups.length === 0
                  ? h('div', { className: 'dsh-owner-wait-empty dsh-owner-wait-empty-active' }, '当前没有正在等待的后台 Operation。')
                  : groups.map(group => h('section', { key: group.sessionId, className: 'dsh-owner-wait-group' },
                      h('div', { className: 'dsh-owner-wait-group-title', title: group.sessionId }, group.title),
                      group.workspaceName === '' ? null : h('div', { className: 'dsh-owner-wait-workspace' }, group.workspaceName),
                      h(WaitList, { waits: group.waits, now, label: `${group.title} 的主动等待列表` }),
                    )),
                h(StaleWaitSection, {
                  waits: snapshot.staleWaits,
                  now,
                  label: '全部会话遗留等待列表',
                }, staleContent),
              )
            : null,
        )
      }

      function installStyles() {
        if (document.querySelector('style[data-owner-workflow-waits]') !== null) return
        const style = document.createElement('style')
        style.dataset.ownerWorkflowWaits = 'true'
        style.textContent = `
      .dsh-owner-wait-root,.dsh-owner-wait-sidebar-root{position:relative}
      .dsh-owner-wait-trigger{min-height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;border-radius:7px;align-items:center;gap:6px;padding:3px 7px;font-size:12px;display:inline-flex}
      .dsh-owner-wait-trigger:hover,.dsh-owner-wait-trigger:focus-visible{background:var(--dsw-alias-fill-l2)}
      .dsh-owner-wait-trigger-stale{color:var(--dsw-alias-label-tertiary,#777)}
      .dsh-owner-wait-dot{width:7px;height:7px;background:#e9a23b;border-radius:50%;box-shadow:0 0 0 3px color-mix(in srgb,#e9a23b 18%,transparent)}
      .dsh-owner-wait-dot-stale{background:#8b8f98;box-shadow:none}
      .dsh-owner-wait-chevron{font-size:14px;transition:transform .12s}.dsh-owner-wait-chevron-open{transform:rotate(180deg)}
      .dsh-owner-wait-menu{z-index:220;box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-specific-menu,#fff);border:1px solid var(--dsw-alias-border-l2,#ddd);border-radius:13px;box-shadow:var(--dsw-shadow-lv3,0 12px 36px #0003);padding:8px;position:absolute;overflow:auto;overscroll-behavior:contain}
      .dsh-owner-wait-menu-header{width:430px;max-width:min(460px,calc(100vw - 32px));max-height:min(560px,calc(100vh - 130px));top:calc(100% + 6px);left:0}
      .dsh-owner-wait-menu-sidebar{width:460px;max-width:min(480px,calc(100vw - 80px));max-height:min(680px,calc(100vh - 32px));bottom:0;left:calc(100% + 8px)}
      .dsh-owner-wait-menu-title{min-height:38px;font-size:13px;font-weight:650;display:flex;align-items:center;justify-content:space-between;gap:12px;background:var(--dsw-specific-menu,#fff);padding:3px 7px 9px;position:sticky;top:-8px;z-index:2}
      .dsh-owner-wait-menu-summary{color:var(--dsw-alias-label-tertiary,#777);font-size:10px;font-weight:400;white-space:nowrap;margin-top:2px}
      .dsh-owner-wait-section{margin-top:3px}.dsh-owner-wait-section-title{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;padding:3px 4px 7px;text-transform:none}.dsh-owner-wait-section-count{min-width:16px;height:16px;color:#fff;background:#d98d27;border-radius:8px;font-size:10px;line-height:16px;text-align:center}
      .dsh-owner-wait-list{display:flex;flex-direction:column;gap:7px;margin:0;padding:0;list-style:none}
      .dsh-owner-wait-item{background:var(--dsw-alias-fill-l1,#f6f6f6);border:1px solid var(--dsw-alias-border-l1,#eee);border-left:3px solid #d98d27;border-radius:10px;padding:10px 11px}
      .dsh-owner-wait-item-running{border-left-color:#4c8bf5}.dsh-owner-wait-item-runner{border-left-color:#d98d27}.dsh-owner-wait-item-dependency{border-left-color:#7d8796}.dsh-owner-wait-item-error{border-left-color:#c75450}.dsh-owner-wait-item-input{border-left-color:#8d6bd1}.dsh-owner-wait-item-stale{border-left-color:#8b8f98;opacity:.86}
      .dsh-owner-wait-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px}
      .dsh-owner-wait-status{height:19px;border-radius:10px;font-size:10px;font-weight:650;line-height:19px;padding:0 7px}.dsh-owner-wait-status-running{color:#3270cc;background:color-mix(in srgb,#4c8bf5 14%,transparent)}.dsh-owner-wait-status-runner{color:#ad6715;background:color-mix(in srgb,#e9a23b 16%,transparent)}.dsh-owner-wait-status-dependency{color:#657080;background:color-mix(in srgb,#7d8796 15%,transparent)}.dsh-owner-wait-status-error{color:#a5423f;background:color-mix(in srgb,#c75450 15%,transparent)}.dsh-owner-wait-status-input{color:#7451bd;background:color-mix(in srgb,#8d6bd1 14%,transparent)}.dsh-owner-wait-status-approval{color:#ad6715;background:color-mix(in srgb,#e9a23b 16%,transparent)}.dsh-owner-wait-status-stale{color:var(--dsw-alias-label-tertiary,#777);background:var(--dsw-alias-fill-l2,#ececec)}
      .dsh-owner-wait-elapsed{color:var(--dsw-alias-label-tertiary,#777);font-size:10px;white-space:nowrap}
      .dsh-owner-wait-goal{font-size:12px;font-weight:600;line-height:18px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}
      .dsh-owner-wait-current,.dsh-owner-wait-stale-reason{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;background:var(--dsw-alias-fill-l2,#ececec);border-radius:7px;margin-top:7px;padding:7px 8px;overflow-wrap:anywhere}.dsh-owner-wait-stale-reason{color:var(--dsw-alias-label-tertiary,#777)}
      .dsh-owner-wait-details{margin-top:7px}.dsh-owner-wait-details>summary{width:max-content;color:var(--dsw-alias-label-tertiary,#777);cursor:pointer;font-size:11px;list-style:none}.dsh-owner-wait-details>summary::-webkit-details-marker{display:none}.dsh-owner-wait-details>summary:after{content:'›';display:inline-block;margin-left:4px;transition:transform .12s}.dsh-owner-wait-details[open]>summary:after{transform:rotate(90deg)}
      .dsh-owner-wait-detail-body{border-top:1px solid var(--dsw-alias-border-l1,#eee);margin-top:7px;padding-top:7px}.dsh-owner-wait-line{font-size:11px;line-height:17px;overflow-wrap:anywhere}.dsh-owner-wait-line b{font-weight:600}.dsh-owner-wait-risk{color:#b95c35}.dsh-owner-wait-id{color:var(--dsw-alias-label-tertiary,#777);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin-top:5px}
      .dsh-owner-wait-note{color:var(--dsw-alias-label-tertiary,#777);border-top:1px solid var(--dsw-alias-border-l1,#eee);font-size:10px;line-height:15px;margin-top:8px;padding-top:7px}
      .dsh-owner-wait-empty,.dsh-owner-wait-warning{color:var(--dsw-alias-label-tertiary,#777);font-size:12px;line-height:18px;padding:11px}.dsh-owner-wait-empty-active{background:var(--dsw-alias-fill-l1,#f6f6f6);border-radius:9px;margin-bottom:7px}.dsh-owner-wait-warning{color:#b95c35;background:#b95c3510;border-radius:8px;margin-bottom:7px}
      .dsh-owner-wait-stale-section{border-top:1px solid var(--dsw-alias-border-l1,#eee);margin-top:9px;padding-top:7px}.dsh-owner-wait-stale-section>summary{color:var(--dsw-alias-label-tertiary,#777);cursor:pointer;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px;padding:4px;list-style:none}.dsh-owner-wait-stale-section>summary::-webkit-details-marker{display:none}.dsh-owner-wait-stale-section>summary:before{content:'›';font-size:14px;transition:transform .12s}.dsh-owner-wait-stale-section[open]>summary:before{transform:rotate(90deg)}.dsh-owner-wait-stale-section[open]>summary{margin-bottom:6px}.dsh-owner-wait-stale-count{min-width:16px;height:16px;background:var(--dsw-alias-fill-l2,#ececec);border-radius:8px;font-size:10px;line-height:16px;text-align:center}
      .dsh-owner-wait-sidebar-root{width:100%}.dsh-owner-wait-sidebar-trigger{box-sizing:border-box;width:40px;height:36px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;border-radius:8px;display:flex;align-items:center;justify-content:center;gap:7px;margin:auto;position:relative}.dsh-owner-wait-sidebar-trigger:hover,.dsh-owner-wait-sidebar-trigger:focus-visible{background:var(--dsw-alias-fill-l2)}.dsh-owner-wait-sidebar-wide{width:100%;justify-content:flex-start;padding:0 10px}.dsh-owner-wait-sidebar-icon{font-size:15px;line-height:1}.dsh-owner-wait-sidebar-label{font-size:13px;flex:1;text-align:left}.dsh-owner-wait-badge{min-width:17px;height:17px;color:#fff;background:#d98d27;border-radius:9px;font-size:10px;line-height:17px;text-align:center;padding:0 4px}.dsh-owner-wait-stale-badge{min-width:17px;height:17px;color:var(--dsw-alias-label-tertiary,#777);background:var(--dsw-alias-fill-l2,#ececec);border-radius:9px;font-size:10px;line-height:17px;text-align:center;padding:0 4px}.dsh-owner-wait-error-mark{width:15px;height:15px;color:#fff;background:#c75450;border-radius:50%;font-size:10px;line-height:15px;text-align:center}.dsh-owner-wait-refresh{color:var(--dsw-alias-label-secondary);cursor:pointer;background:transparent;border:0;border-radius:5px;padding:4px 7px;font-size:11px}.dsh-owner-wait-refresh:hover{background:var(--dsw-alias-fill-l2)}
      .dsh-owner-wait-group{border-top:1px solid var(--dsw-alias-border-l1,#eee);padding-top:8px;margin-top:7px}.dsh-owner-wait-group:first-of-type{border-top:0;margin-top:0}.dsh-owner-wait-group-stale:first-child{border-top:0}.dsh-owner-wait-group-title{font-size:12px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;padding:0 4px}.dsh-owner-wait-workspace{color:var(--dsw-alias-label-tertiary,#777);font-size:10px;padding:2px 4px 6px}
      @media (max-width:720px){.dsh-owner-wait-menu-header{right:0;left:auto}.dsh-owner-wait-menu-sidebar{width:min(430px,calc(100vw - 24px));max-width:none;bottom:42px;left:8px;position:fixed}}
        `.trim()
        document.head.appendChild(style)
      }

      exports.inject = ['slots']

      exports.apply = function apply(ctx) {
        // 正式包名与本地开发别名意外同时进入启动图时，只允许第一份客户端占用 Slot。
        if (window[CLIENT_APPLIED_MARKER] === true) return
        installStyles()
        ctx.slots.inject(
          'conversation.session.header.actions',
          () => ctx.slots.register({
            name: 'conversation.session.header.actions',
            id: 'owner-workflow-waits',
            order: 30,
            label: '主动等待',
          }, HeaderWaitAction),
        )
        ctx.slots.inject(
          'sidebar.footer.action',
          () => ctx.slots.register({
            name: 'sidebar.footer.action',
            id: 'owner-workflow-waits',
            order: 10,
            label: '主动等待',
          }, SidebarWaitAction),
        )
        window[CLIENT_APPLIED_MARKER] = true
      }

      exports.default = { inject: exports.inject, apply: exports.apply }

    return module.exports
  }
  for (const id of ['dsh-owner-workflow', 'dsh-owner-workflow-local-ui']) {
    window.__ModuleLoader__.load({ id, factory })
  }
})()
