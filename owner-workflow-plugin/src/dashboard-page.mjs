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
    body { max-width: 1500px; margin: 0 auto; padding: 28px; background: radial-gradient(circle at top, #162447 0, #0b1020 42rem); min-height: 100vh; }
    header { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0; letter-spacing: .02em; }
    .hint { color: #9babc6; margin: 6px 0 0; font-size: 14px; }
    .controls { display: flex; gap: 8px; align-items: center; }
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
    .badge { display: inline-block; border-radius: 999px; padding: 3px 7px; background: #263a63; font-size: 11px; white-space: nowrap; }.badge.running { background: #1d6a52; }.badge.completed { background: #31623e; }.badge.stopped { background: #7a4617; }.badge.pending { background: #3d4b66; }
    .meta, .dependency { font-size: 12px; color: #aebbd2; margin-top: 8px; word-break: break-word; }.dependency strong { color: #d2ddf2; }
    .empty { color: #9babc6; padding: 20px 0; }.error { color: #ffb4ab; }.event-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 8px; }.event { border-top: 1px solid #263859; padding-top: 9px; font-size: 13px; }.event:first-child { border-top: 0; padding-top: 0; }.event time { color: #9babc6; margin-right: 8px; }.event-type { color: #c6d4fa; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media (max-width: 640px) { body { padding: 16px; } .controls { width: 100%; } select { min-width: 0; flex: 1; } }
  </style>
</head>
<body>
  <header>
    <div><h1>Owner Workflow Dashboard</h1><p class="hint">只读展示开发 DAG，以及无需修改仓库的后台 Operation。</p></div>
    <div class="controls"><select id="workspace" aria-label="选择工作区"></select><select id="surface" aria-label="选择视图"><option value="workflow">开发 Workflow</option><option value="operation">后台 Operation</option></select><select id="entity" aria-label="选择记录"></select><button id="refresh" type="button">刷新</button><span id="state" class="state">加载中</span></div>
  </header>
  <main>
    <section class="summary"><h2 id="workflow-title">尚未选择工作流</h2><p id="workflow-summary" class="hint">等待可读的 workflow 投影。</p><div id="metrics" class="summary-grid"></div></section>
    <section><h2 id="detail-title" class="dag-title">任务 DAG</h2><div id="dag" class="dag"><p class="empty">尚无任务。</p></div></section>
    <section class="events"><h2>最近事件</h2><ul id="events" class="event-list"><li class="empty">尚无事件。</li></ul></section>
  </main>
  <script>
    (() => {
      const workspaceSelector = document.getElementById('workspace'); const surface = document.getElementById('surface'); const selector = document.getElementById('entity'); const state = document.getElementById('state'); const title = document.getElementById('workflow-title'); const summary = document.getElementById('workflow-summary'); const metrics = document.getElementById('metrics'); const detailTitle = document.getElementById('detail-title'); const dag = document.getElementById('dag'); const events = document.getElementById('events');
      const params = new URL(location.href).searchParams; let workspaceId = params.get('workspace_id') || ''; let view = params.get('view') === 'operation' ? 'operation' : 'workflow'; let selected = view === 'operation' ? params.get('operation_id') || '' : params.get('workflow_id') || ''; let loading = false; surface.value = view;
      const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;' })[c]);
      const label = value => ({ starting: '启动中', running: '运行中', waiting_input: '等待信息', waiting_approval: '等待授权', approved: '已批准', planned: '待批准', blocked: '已阻塞', failed: '失败', cancelled: '已取消', completed: '已完成', pending: '等待中', stopped: '等待决策' }[value] || value || '未知');
      const setState = (text, error) => { state.textContent = text; state.classList.toggle('error', Boolean(error)); };
      const metricHtml = entries => entries.map(([name, value]) => '<div class="metric"><span>' + esc(name) + '</span><strong>' + esc(value) + '</strong></div>').join('');
      const listHtml = (name, values) => '<article class="task"><div class="task-title">' + esc(name) + '</div>' + (values && values.length ? values.map(value => '<div class="dependency">' + esc(value) + '</div>').join('') : '<div class="empty">暂无</div>') + '</article>';
      const renderEvents = values => { events.innerHTML = values && values.length ? values.slice().reverse().map(event => '<li class="event"><time>' + esc(event.time ? new Date(event.time).toLocaleString() : '') + '</time><span class="event-type">' + esc(event.type) + '</span>' + (event.summary ? '<div>' + esc(event.summary) + '</div>' : '') + '</li>').join('') : '<li class="empty">尚无可显示的事件。</li>'; };
      async function json(path) { const response = await fetch(path, { cache: 'no-store' }); if (!response.ok) throw new Error('数据暂时不可用'); return response.json(); }
      function renderWorkflow(snapshot) {
        title.textContent = 'Workflow：' + snapshot.workflowId + '（' + label(snapshot.status) + '）'; summary.textContent = snapshot.summary || '该 workflow 尚未提供摘要。'; detailTitle.textContent = '任务 DAG';
        const count = key => snapshot.tasks.filter(task => task.status === key).length; const execution = snapshot.execution || {};
        metrics.innerHTML = metricHtml([['全部任务', execution.totalTasks ?? snapshot.tasks.length], ['未执行', execution.pendingTasks ?? count('pending')], ['执行中', execution.runningTasks ?? count('running')], ['等待依赖', execution.waitingDependencyTasks ?? 0], ['已完成', execution.completedTasks ?? count('completed')]]);
        dag.innerHTML = snapshot.tasks.length ? snapshot.tasks.map(task => '<article class="task ' + esc(task.status || 'pending') + '"><div class="task-top"><span class="task-id">' + esc(task.id) + '</span><span class="badge ' + esc(task.status || 'pending') + '">' + esc(label(task.status)) + '</span></div><div class="task-title">' + esc(task.title || '未命名任务') + '</div><div class="meta">Owner：' + esc(task.ownerId || '未指定') + ' · 角色：' + esc(task.role || '未指定') + '</div><div class="dependency"><strong>依赖：</strong>' + esc(task.dependsOn && task.dependsOn.length ? task.dependsOn.join(' → ') : '无，可开始') + (task.reason ? '<br><strong>原因：</strong>' + esc(task.reason) : '') + '</div></article>').join('') : '<p class="empty">该 workflow 尚未生成任务 DAG。</p>';
        renderEvents(snapshot.events);
      }
      function renderOperation(snapshot) {
        title.textContent = 'Operation：' + snapshot.operationId + '（' + label(snapshot.status) + '）'; summary.textContent = snapshot.goal || '该 Operation 尚未提供目标。'; detailTitle.textContent = 'Operation 结果';
        metrics.innerHTML = metricHtml([['状态', label(snapshot.status)], ['能力数量', snapshot.capabilities.length], ['事件数量', snapshot.events.length], ['等待主代理', snapshot.pending ? '是' : '否']]);
        const cards = [];
        if (snapshot.pending) cards.push(listHtml('等待主代理处理', [snapshot.pending.question, snapshot.pending.action, snapshot.pending.risk].filter(Boolean)));
        if (snapshot.result) { cards.push(listHtml('结论', [snapshot.result.summary].filter(Boolean))); cards.push(listHtml('发现', snapshot.result.findings)); cards.push(listHtml('证据', snapshot.result.evidence)); cards.push(listHtml('后续动作', snapshot.result.nextActions)); }
        dag.innerHTML = cards.length ? cards.join('') : '<p class="empty">Operator 正在执行，尚无最终结果。</p>';
        renderEvents(snapshot.events);
      }
      function renderEmpty() {
        const operation = view === 'operation'; title.textContent = operation ? '尚无 Operation' : '尚无工作流'; summary.textContent = operation ? '主代理在收到需要实际执行但不修改仓库的需求后，会自动启动后台 Operator。' : '请先在 Owner Workflow 模式中创建并规划 workflow。'; detailTitle.textContent = operation ? 'Operation 结果' : '任务 DAG'; metrics.innerHTML = ''; dag.innerHTML = '<p class="empty">暂无可读记录。</p>'; events.innerHTML = '<li class="empty">尚无事件。</li>'; setState(operation ? '等待 Operation' : '等待 workflow');
      }
      async function load() {
        if (loading) return; loading = true; setState('刷新中');
        try {
          const workspaceCatalog = await json('/owner-workflow/api/workspaces'); const workspaces = workspaceCatalog.workspaces || []; if (!workspaceId || !workspaces.some(item => item.workspaceId === workspaceId)) workspaceId = workspaces[0] ? workspaces[0].workspaceId : ''; workspaceSelector.innerHTML = workspaces.length ? workspaces.map(item => '<option value="' + esc(item.workspaceId) + '">' + esc(item.name) + '</option>').join('') : '<option value="">暂无工作区</option>'; workspaceSelector.value = workspaceId;
          if (!workspaceId) { renderEmpty(); setState('等待工作区'); return; }
          const operation = view === 'operation'; const workspaceQuery = 'workspace_id=' + encodeURIComponent(workspaceId); const catalog = await json((operation ? '/owner-workflow/api/operations?' : '/owner-workflow/api/workflows?') + workspaceQuery); const records = operation ? catalog.operations || [] : catalog.workflows || []; const id = item => operation ? item.operationId : item.workflowId;
          if (!selected || !records.some(item => id(item) === selected)) selected = records[0] ? id(records[0]) : '';
          selector.innerHTML = records.length ? records.map(item => '<option value="' + esc(id(item)) + '">' + esc(id(item) + ' · ' + label(item.status)) + '</option>').join('') : '<option value="">' + (operation ? '暂无 Operation' : '暂无 workflow') + '</option>'; selector.value = selected;
          if (!selected) { renderEmpty(); return; }
          const snapshot = await json(operation ? '/owner-workflow/api/operation?operation_id=' + encodeURIComponent(selected) + '&' + workspaceQuery : '/owner-workflow/api/snapshot?workflow_id=' + encodeURIComponent(selected) + '&' + workspaceQuery);
          if (operation) renderOperation(snapshot); else renderWorkflow(snapshot);
          history.replaceState(null, '', '/owner-workflow?workspace_id=' + encodeURIComponent(workspaceId) + '&view=' + view + '&' + (operation ? 'operation_id=' : 'workflow_id=') + encodeURIComponent(selected)); setState('已同步');
        } catch (error) { setState('读取失败', true); dag.innerHTML = '<p class="empty error">无法读取 Dashboard 数据，请稍后刷新。</p>'; } finally { loading = false; }
      }
      workspaceSelector.addEventListener('change', () => { workspaceId = workspaceSelector.value; selected = ''; void load(); }); surface.addEventListener('change', () => { view = surface.value; selected = ''; void load(); }); selector.addEventListener('change', () => { selected = selector.value; void load(); }); document.getElementById('refresh').addEventListener('click', () => void load()); void load(); setInterval(() => void load(), 3000);
    })();
  </script>
</body>
</html>`
}
