/**
 * Dashboard 使用零依赖的静态页面，避免要求外部插件与 Harness 内部 React 包保持版本一致。
 * 数据只从同一 Harness Web Server 提供的只读 JSON 接口读取。
 */
export function renderDashboardPage() {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Owner Workflow Dashboard</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; background: #0b1020; color: #e8edf7; }
    * { box-sizing: border-box; }
    html, body { min-width: 1000px; min-height: 100%; }
    body { width: 100%; max-width: none; margin: 0; padding: 28px; background: radial-gradient(circle at top, #162447 0, #0b1020 42rem); min-height: 100vh; overflow-x: auto; }
    header { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0; letter-spacing: .02em; }
    .hint { color: #9babc6; margin: 6px 0 0; font-size: 14px; }
    .controls { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    button, select { color: inherit; background: #16213e; border: 1px solid #31466f; border-radius: 8px; padding: 9px 11px; font: inherit; }
    button { cursor: pointer; } button:hover { background: #20325b; }
    .state { display: inline-flex; border: 1px solid #31466f; border-radius: 999px; padding: 5px 10px; font-size: 12px; background: #121b31; }
    .summary, .events { background: rgba(18,27,49,.9); border: 1px solid #293c63; border-radius: 12px; padding: 18px; margin-bottom: 20px; }
    .summary h2, .events h2, .dag-title { margin: 0 0 12px; font-size: 16px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(145px, 1fr)); gap: 10px; }
    .metric { background: #0e172b; border: 1px solid #25395f; border-radius: 10px; padding: 12px; }
    .metric strong { display: block; font-size: 22px; margin-top: 3px; }.metric span { color: #9babc6; font-size: 12px; }
    .dag { display: grid; grid-template-columns: repeat(auto-fit, minmax(255px, 1fr)); gap: 12px; align-items: stretch; }
    .task { background: #101b32; border: 1px solid #2d426c; border-left: 4px solid #536dfe; border-radius: 10px; padding: 14px; min-height: 142px; }
    .task.running { border-left-color: #3ddc97; }.task.completed { border-left-color: #69db7c; }.task.stopped { border-left-color: #ff922b; }.task.pending { border-left-color: #8394b5; }
    .task-top { display: flex; justify-content: space-between; gap: 8px; align-items: start; }.task-id { color: #a9b7da; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; }.task-title { margin: 7px 0; font-weight: 650; line-height: 1.45; }
    .badge { display: inline-block; border-radius: 999px; padding: 3px 7px; background: #263a63; font-size: 11px; white-space: nowrap; }.badge.running { background: #1d6a52; }.badge.waiting_approval { background: #7a5a17; }.badge.orphaned, .badge.recovery_blocked { background: #7a2f2f; }.badge.completed { background: #31623e; }.badge.stopped { background: #7a4617; }.badge.pending { background: #3d4b66; }
    .meta, .dependency { font-size: 12px; color: #aebbd2; margin-top: 8px; word-break: break-word; }.dependency strong { color: #d2ddf2; }
    .action { display: grid; grid-template-columns: minmax(180px, .35fr) minmax(420px, 1.65fr); gap: 14px; align-items: start; margin: 16px 0; padding: 14px 16px; border: 1px solid #8b6824; border-left: 4px solid #f2b84b; border-radius: 10px; background: rgba(83,58,16,.34); }
    .action[hidden] { display: none; }.action-title { font-weight: 700; color: #ffd98a; }.action-detail { color: #e9d7b0; line-height: 1.55; }.action-session { margin-top: 6px; color: #bfae8c; font: 12px ui-monospace, SFMono-Regular, Menlo, monospace; word-break: break-all; }
    .empty { color: #9babc6; padding: 20px 0; }.error { color: #ffb4ab; }.event-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }.event { border-top: 1px solid #263859; padding-top: 9px; font-size: 13px; }.event:first-child { border-top: 0; padding-top: 0; }.event time { color: #9babc6; margin-right: 8px; }.event-type { color: #c6d4fa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media (min-width: 1900px) { .dag { grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); } }
  </style>
</head>
<body>
  <header>
    <div><h1>Owner Workflow Dashboard</h1><p class="hint">只读展示开发 DAG，以及无需修改仓库的后台 Operation。</p></div>
    <div class="controls"><select id="workspace" aria-label="选择工作区"></select><select id="surface" aria-label="选择视图"><option value="workflow">开发 Workflow</option><option value="operation">后台 Operation</option></select><select id="entity" aria-label="选择记录"></select><button id="refresh" type="button">刷新</button><span id="state" class="state">加载中</span></div>
  </header>
  <main>
    <section class="summary"><h2 id="workflow-title">尚未选择工作流</h2><p id="workflow-summary" class="hint">等待可读的 workflow 投影。</p><div id="workflow-action" class="action" hidden></div><div id="metrics" class="summary-grid"></div></section>
    <section><h2 id="detail-title" class="dag-title">任务 DAG</h2><div id="dag" class="dag"><p class="empty">尚无任务。</p></div></section>
    <section class="events"><h2>最近事件</h2><ul id="events" class="event-list"><li class="empty">尚无事件。</li></ul></section>
  </main>
  <script>
    (() => {
      const workspaceSelector = document.getElementById('workspace'); const surface = document.getElementById('surface'); const selector = document.getElementById('entity'); const state = document.getElementById('state'); const title = document.getElementById('workflow-title'); const summary = document.getElementById('workflow-summary'); const actionBox = document.getElementById('workflow-action'); const metrics = document.getElementById('metrics'); const detailTitle = document.getElementById('detail-title'); const dag = document.getElementById('dag'); const events = document.getElementById('events');
      const params = new URL(location.href).searchParams; let workspaceId = params.get('workspace_id') || ''; let view = params.get('view') === 'operation' ? 'operation' : 'workflow'; let selected = view === 'operation' ? params.get('operation_id') || '' : params.get('workflow_id') || ''; let loading = false; let reloadQueued = false; let stream = null; let streamKey = ''; let operationTimer = null; surface.value = view;
      const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[c]);
      const label = value => ({ starting: '启动中', running: '运行中', waiting_input: '等待信息', waiting_approval: '等待授权', orphaned: '代理已失联', recovery_blocked: '重复恢复已停止', approved: '已批准', planned: '等待计划处理', planning: '生成计划中', consulting_owners: 'Owner 会诊中', planning_owner_consultation: 'Owner 会诊中', planning_discussion_summarizing: '正在总结规划现场', awaiting_main_discussion: '等待主线程讨论', planning_discussion_failed: '规划总结待恢复', plan_reviewing: '计划审查中', plan_revision_in_progress: '计划修订中', planning_recovery_queued: '等待恢复规划', plan_revision_recovery_queued: '等待自动恢复计划修订', plan_revision_retry_pending: '计划修订超时，等待恢复', plan_revision_failed: '计划修订失败', plan_revision_required: '计划需要修订', plan_split_required: '等待递归拆分', plan_discovery_required: '等待只读调查', plan_review_failed: '计划审查未通过', planning_failed: '计划编排失败', plan_review_not_started: '等待启动 Reviewer', awaiting_plan_approval: '等待计划批准', awaiting_registry_approval: '等待 Registry 批准', registry_pending_plan: 'Registry 已批准，等待重规划', runner_queued: '等待 Runner 接管', runner_launching: 'Runner 接管中', owner_running: 'Owner 执行中', waiting_dependencies: '等待任务依赖', waiting_workflow_decision: '等待外部决定', execution_recovery_queued: '等待恢复执行现场', handoff_replanning: '正在重规划 Handoff', plan_revision_approval: '批准内部修复计划', implementation_review_required: '等待实现审查', implementation_repair_required: '生成实现修复子图', state_invariant_violation: '状态不变量异常', blocked: '已阻塞', failed: '失败', cancelled: '已取消', completed: '已完成', pending: '等待中', stopped: '等待决策', needs_revision: '需要修订', needs_split: '需要拆分', needs_decision: '需要裁决', needs_discovery: '需要只读调查', abstract: '待展开', leaf: '可执行叶子', expanded: '已展开', composite: '复合节点', decision: '决策节点', discovery: '调查节点', passed: '审查通过', local_subgraph_rewrite: '局部子图改写', diagnose: '只读诊断', owner_council: 'Owner 会诊', arbitrate: '独立仲裁', alternate_implementation: '替代实现', awaiting_approval: '等待批准', autonomous_incident: '自治现场已保留', obligation_reduced: '义务已减少', new_evidence: '获得新证据', none: '尚无语义进展' }[value] || value || '未知');
      const setState = (text, error) => { state.textContent = text; state.classList.toggle('error', Boolean(error)); };
      const metricHtml = entries => entries.map(([name, value]) => '<div class="metric"><span>' + esc(name) + '</span><strong>' + esc(value) + '</strong></div>').join('');
      const listHtml = (name, values) => '<article class="task"><div class="task-title">' + esc(name) + '</div>' + (values && values.length ? values.map(value => '<div class="dependency">' + esc(value) + '</div>').join('') : '<div class="empty">暂无</div>') + '</article>';
      const renderEvents = values => { events.innerHTML = values && values.length ? values.slice().reverse().map(event => '<li class="event"><time>' + esc(event.time ? new Date(event.time).toLocaleString() : '') + '</time><span class="event-type">' + esc(event.type) + '</span>' + (event.summary ? '<div>' + esc(event.summary) + '</div>' : '') + '</li>').join('') : '<li class="empty">尚无可显示的事件。</li>'; };
      const renderAction = action => { if (!action || action.required !== true) { actionBox.hidden = true; actionBox.innerHTML = ''; return; } actionBox.hidden = false; actionBox.innerHTML = '<div class="action-title">' + esc(action.title) + '</div><div class="action-detail">' + esc(action.detail) + (action.mainSessionId ? '<div class="action-session">主会话：' + esc(action.mainSessionId) + '</div>' : '') + '</div>'; };
      async function json(path) { const response = await fetch(path, { cache: 'no-store' }); if (!response.ok) throw new Error('数据暂时不可用'); return response.json(); }
      function renderWorkflow(snapshot) {
        const phase = snapshot.phase || snapshot.status; title.textContent = 'Workflow：' + snapshot.workflowId + '（' + label(phase) + '）'; summary.textContent = snapshot.summary || '该 workflow 尚未提供摘要。'; detailTitle.textContent = '任务 DAG'; renderAction(snapshot.action);
        const count = key => snapshot.tasks.filter(task => task.status === key).length; const execution = snapshot.execution || {};
        metrics.innerHTML = metricHtml([['当前阶段', label(phase)], ['审查结论', snapshot.review ? label(snapshot.review.status) : '尚无'], ['收敛策略', snapshot.convergence ? label(snapshot.convergence.nextStrategy) : '尚无'], ['语义进展', snapshot.convergence ? label(snapshot.convergence.progress) : '尚无'], ['未满足义务', snapshot.convergence ? snapshot.convergence.openObligationCount : 0], ['一次性待决策', snapshot.decisionBundle ? snapshot.decisionBundle.questionCount : 0], ['全部任务', execution.totalTasks ?? snapshot.tasks.length], ['未执行', execution.pendingTasks ?? count('pending')], ['执行中', execution.runningTasks ?? count('running')], ['等待依赖', execution.waitingDependencyTasks ?? 0], ['已完成', execution.completedTasks ?? count('completed')]]);
        dag.innerHTML = snapshot.tasks.length ? snapshot.tasks.map(task => { const visualStatus = task.ownerStatus || task.status || 'pending'; const ownerRuntime = [task.phase ? '阶段：' + label(task.phase) : '', task.autonomousRecovery ? '自治恢复：' + label(task.autonomousRecovery.strategy) + '（' + task.autonomousRecovery.failureClass + '）' : '', task.ownerSessionId ? '会话：' + task.ownerSessionId : '', task.lastHeartbeatAt ? '心跳：' + new Date(task.lastHeartbeatAt).toLocaleString() : '', Number.isInteger(task.recoveryCount) ? '恢复：' + task.recoveryCount + ' 次' : '', task.pendingApprovalId ? '授权：' + task.pendingApprovalId : ''].filter(Boolean).join('<br>'); const decomposition = task.decomposition ? ['类型：' + label(task.decomposition.kind), '拆分：' + label(task.decomposition.status), task.decomposition.outcome ? '结果：' + task.decomposition.outcome : '', task.decomposition.ownerCandidates && task.decomposition.ownerCandidates.length ? '会诊 Owner：' + task.decomposition.ownerCandidates.join('、') : '', task.decomposition.unknowns && task.decomposition.unknowns.length ? '未知项：' + task.decomposition.unknowns.join('；') : ''].filter(Boolean).join('<br>') : ''; return '<article class="task ' + esc(task.status || 'pending') + '"><div class="task-top"><span class="task-id">' + esc(task.id) + '</span><span class="badge ' + esc(visualStatus) + '">' + esc(label(visualStatus)) + '</span></div><div class="task-title">' + esc(task.title || '未命名任务') + '</div><div class="meta">Owner：' + esc(task.ownerId || '未指定') + ' · 角色：' + esc(task.role || '未指定') + (task.parentTaskId ? '<br>父节点：' + esc(task.parentTaskId) : '') + (task.children && task.children.length ? '<br>子节点：' + esc(task.children.join('、')) : '') + (decomposition ? '<br>' + decomposition.split('<br>').map(esc).join('<br>') : '') + (ownerRuntime ? '<br>' + ownerRuntime.split('<br>').map(esc).join('<br>') : '') + '</div><div class="dependency"><strong>依赖：</strong>' + esc(task.dependsOn && task.dependsOn.length ? task.dependsOn.join(' → ') : '无，可开始') + (task.reason ? '<br><strong>原因：</strong>' + esc(task.reason) : '') + '</div></article>'; }).join('') : '<p class="empty">该 workflow 尚未生成任务 DAG。</p>';
        renderEvents(snapshot.events);
      }
      function renderOperation(snapshot) {
        title.textContent = 'Operation：' + snapshot.operationId + '（' + label(snapshot.status) + '）'; summary.textContent = snapshot.goal || '该 Operation 尚未提供目标。'; detailTitle.textContent = 'Operation 结果'; renderAction(undefined);
        metrics.innerHTML = metricHtml([['状态', label(snapshot.status)], ['能力数量', snapshot.capabilities.length], ['事件数量', snapshot.events.length], ['等待主代理', snapshot.pending ? '是' : '否']]);
        const cards = [];
        if (snapshot.pending) cards.push(listHtml('等待主代理处理', [snapshot.pending.question, snapshot.pending.action, snapshot.pending.risk].filter(Boolean)));
        if (snapshot.result) { cards.push(listHtml('结论', [snapshot.result.summary].filter(Boolean))); cards.push(listHtml('发现', snapshot.result.findings)); cards.push(listHtml('证据', snapshot.result.evidence)); cards.push(listHtml('后续动作', snapshot.result.nextActions)); }
        dag.innerHTML = cards.length ? cards.join('') : '<p class="empty">Operator 正在执行，尚无最终结果。</p>';
        renderEvents(snapshot.events);
      }
      function renderEmpty() {
        const operation = view === 'operation'; title.textContent = operation ? '尚无 Operation' : '尚无工作流'; summary.textContent = operation ? '主代理在收到需要实际执行但不修改仓库的需求后，会自动启动后台 Operator。' : '请先在 Owner Workflow 模式中创建并规划 workflow。'; detailTitle.textContent = operation ? 'Operation 结果' : '任务 DAG'; renderAction(undefined); metrics.innerHTML = ''; dag.innerHTML = '<p class="empty">暂无可读记录。</p>'; events.innerHTML = '<li class="empty">尚无事件。</li>'; setState(operation ? '等待 Operation' : '等待 workflow');
      }
      function stopRealtime() { if (stream) stream.close(); stream = null; streamKey = ''; if (operationTimer) clearInterval(operationTimer); operationTimer = null; }
      function requestLoad() { if (loading) { reloadQueued = true; return; } void load(); }
      function syncRealtime() {
        const nextKey = workspaceId && selected ? view + ':' + workspaceId + ':' + selected : '';
        if (nextKey === streamKey) return;
        stopRealtime(); streamKey = nextKey;
        if (!nextKey) return;
        if (view === 'operation') { operationTimer = setInterval(requestLoad, 3000); setState('每 3 秒同步'); return; }
        const query = 'workspace_id=' + encodeURIComponent(workspaceId) + '&workflow_id=' + encodeURIComponent(selected);
        stream = new EventSource('/owner-workflow/api/snapshot/events?' + query);
        stream.onopen = () => setState('实时已连接');
        stream.onmessage = () => requestLoad();
        stream.onerror = () => setState('实时连接中断，自动重连', true);
      }
      async function load() {
        if (loading) { reloadQueued = true; return; } loading = true; setState('刷新中');
        try {
          const workspaceCatalog = await json('/owner-workflow/api/workspaces'); const workspaces = workspaceCatalog.workspaces || []; if (!workspaceId || !workspaces.some(item => item.workspaceId === workspaceId)) workspaceId = workspaces[0] ? workspaces[0].workspaceId : ''; workspaceSelector.innerHTML = workspaces.length ? workspaces.map(item => '<option value="' + esc(item.workspaceId) + '">' + esc(item.name) + '</option>').join('') : '<option value="">暂无工作区</option>'; workspaceSelector.value = workspaceId;
          if (!workspaceId) { renderEmpty(); setState('等待工作区'); syncRealtime(); return; }
          const operation = view === 'operation'; const workspaceQuery = 'workspace_id=' + encodeURIComponent(workspaceId); const catalog = await json((operation ? '/owner-workflow/api/operations?' : '/owner-workflow/api/workflows?') + workspaceQuery); const records = operation ? catalog.operations || [] : catalog.workflows || []; const id = item => operation ? item.operationId : item.workflowId;
          if (!selected || !records.some(item => id(item) === selected)) selected = records[0] ? id(records[0]) : '';
          selector.innerHTML = records.length ? records.map(item => '<option value="' + esc(id(item)) + '">' + esc(id(item) + ' · ' + label(item.phase || item.status)) + '</option>').join('') : '<option value="">' + (operation ? '暂无 Operation' : '暂无 workflow') + '</option>'; selector.value = selected;
          if (!selected) { renderEmpty(); syncRealtime(); return; }
          const snapshot = await json(operation ? '/owner-workflow/api/operation?operation_id=' + encodeURIComponent(selected) + '&' + workspaceQuery : '/owner-workflow/api/snapshot?workflow_id=' + encodeURIComponent(selected) + '&' + workspaceQuery);
          if (operation) renderOperation(snapshot); else renderWorkflow(snapshot);
          history.replaceState(null, '', '/owner-workflow?workspace_id=' + encodeURIComponent(workspaceId) + '&view=' + view + '&' + (operation ? 'operation_id=' : 'workflow_id=') + encodeURIComponent(selected)); syncRealtime(); setState(view === 'workflow' ? '实时同步中' : '已同步');
        } catch (error) { setState('读取失败', true); dag.innerHTML = '<p class="empty error">无法读取 Dashboard 数据，请稍后刷新。</p>'; } finally { loading = false; if (reloadQueued) { reloadQueued = false; queueMicrotask(requestLoad); } }
      }
      workspaceSelector.addEventListener('change', () => { stopRealtime(); workspaceId = workspaceSelector.value; selected = ''; requestLoad(); }); surface.addEventListener('change', () => { stopRealtime(); view = surface.value; selected = ''; requestLoad(); }); selector.addEventListener('change', () => { stopRealtime(); selected = selector.value; requestLoad(); }); document.getElementById('refresh').addEventListener('click', requestLoad); window.addEventListener('beforeunload', stopRealtime); requestLoad();
    })();
  </script>
</body>
</html>`
}
