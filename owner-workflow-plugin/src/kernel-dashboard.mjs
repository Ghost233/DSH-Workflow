import { basename } from 'node:path'
import { lstat, realpath } from 'node:fs/promises'
import { WorkflowStore } from './workflow-store.mjs'
import { kernelDigest, view } from './workflow-engine.mjs'

/** Read-only public surface. Never initializes, repairs, registers or drives a catalog. */
export class KernelDashboard {
  constructor(catalogRoot, { health = () => ({ status: 'offline' }) } = {}) {
    this.catalogRoot = catalogRoot; this.health = health
    this.cache = null; this.pending = null
  }
  async snapshot() {
    const root = await realpath(this.catalogRoot)
    const store = new WorkflowStore(root)
    const file = await lstat(store.path, { bigint: true })
    if (!file.isFile() || file.nlink > 1n) throw new Error('Unsafe control file')
    const identity = `${root}:${file.dev}:${file.ino}:${file.size}:${file.mtimeNs}:${file.ctimeNs}`
    let data = this.cache?.identity === identity ? this.cache.data : null
    if (!data) {
      if (this.pending?.identity === identity) data = await this.pending.promise
      else {
        const pending = { identity, promise: store.read().then(state => {
          const workflows = Object.values(state.workflows).filter(workflow => workflow.kind !== 'operation')
            .map(workflow => view(state, workflow.id))
          const workspaces = [...new Set(workflows.map(workflow => workflow.root))].map(root => ({
            workspaceId: kernelDigest(root), workspaceName: basename(root), root,
            workflows: workflows.filter(workflow => workflow.root === root),
          }))
          return { revision: state.revision, workspaces }
        }) }
        this.pending = pending
        try { data = await pending.promise; if (this.pending === pending) this.cache = { identity, data } }
        finally { if (this.pending === pending) this.pending = null }
      }
    }
    return { contract: 'DSH_KERNEL_STATUS_V1', ...data, runner: structuredClone(this.health()) }
  }
}

export function createKernelDashboardHandler(catalogRoot, { health, intervalMs = 1000 } = {}) {
  const dashboard = new KernelDashboard(catalogRoot, { health })
  const streams = new Set()
  const send = (response, status, value) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    response.end(JSON.stringify(value))
  }
  const select = (snapshot, url) => {
    const workspaceId = url.searchParams.get('workspace_id')
    const workspaces = workspaceId ? snapshot.workspaces.filter(item => item.workspaceId === workspaceId) : snapshot.workspaces
    if (workspaceId && !workspaces.length) throw Object.assign(new Error('Unknown workspace'), { status: 404 })
    const all = workspaces.flatMap(item => item.workflows)
    if (url.pathname.endsWith('/workspaces')) return { workspaces: snapshot.workspaces.map(({ workflows, ...workspace }) => workspace) }
    if (url.pathname.endsWith('/workflows')) return { workflows: all }
    if (url.pathname.includes('/snapshot')) {
      const id = url.searchParams.get('workflow_id')
      if (!id) throw Object.assign(new Error('A workflow identity is required'), { status: 400 })
      const workflow = all.find(item => item.workflowId === id)
      if (!workflow) throw Object.assign(new Error('Unknown workflow'), { status: 404 })
      return { ...workflow, runner: snapshot.runner }
    }
    return snapshot
  }
  const routes = new Set(['waits', 'waits/events', 'workspaces', 'workflows', 'snapshot', 'snapshot/events'])
  const handler = async (request, response) => {
    if (request.method !== 'GET') return send(response, 405, { error: 'Dashboard is read-only' })
    let url
    try { url = new URL(request.url, 'http://127.0.0.1') } catch { return send(response, 400, { error: 'Invalid request' }) }
    if (['/owner-workflow', '/owner-workflow/'].includes(url.pathname)) {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; connect-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'self'",
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' })
      return response.end(renderKernelDashboardPage())
    }
    if (!routes.has(url.pathname.replace('/owner-workflow/api/', ''))) return send(response, 404, { error: 'Unknown dashboard route' })
    let initial
    try { initial = select(await dashboard.snapshot(), url) }
    catch (error) { return send(response, error.status ?? 503, { error: error.status ? error.message : 'Kernel state unavailable; no state was initialized or reset' }) }
    if (!url.pathname.endsWith('/events')) return send(response, 200, initial)
    response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' })
    let closed = false, timer, prior
    const close = () => { if (closed) return; closed = true; clearTimeout(timer); streams.delete(close); response.end() }
    const publish = value => {
      const serialized = JSON.stringify(value)
      if (serialized !== prior) {
        // A slow browser must not create an unbounded output queue.
        if (response.writableLength > 1_048_576) return close()
        response.write(`event: ${url.pathname.includes('/snapshot/') ? 'snapshot' : 'waits'}\ndata: ${serialized}\n\n`)
        prior = serialized
      }
    }
    const tick = async () => {
      try { const value = select(await dashboard.snapshot(), url); if (!closed) publish(value) }
      catch { if (!closed) { response.write('event: unavailable\ndata: {"error":"Kernel state unavailable"}\n\n'); close() } }
      if (!closed) { timer = setTimeout(tick, intervalMs); timer.unref?.() }
    }
    streams.add(close); response.once('close', close)
    publish(initial); if (!closed) { timer = setTimeout(tick, intervalMs); timer.unref?.() }
  }
  handler.close = () => { for (const close of [...streams]) close() }
  return handler
}

export function renderKernelDashboardPage() {
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Owner Workflow</title>
<style>body{font:15px system-ui;margin:32px auto;padding:0 20px;max-width:1100px;color:#17202a;background:#f6f7f9}article{background:white;border:1px solid #d5dbe1;border-radius:10px;padding:20px;margin:20px 0}table{width:100%;border-collapse:collapse}td,th{text-align:left;padding:8px;border-bottom:1px solid #ddd}pre{white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#a32424}h2{font-size:19px}small{color:#536174}</style>
<h1>Owner Workflow</h1><p id="connection">正在读取工作流状态…</p><main id="content"></main>
<script>
const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node};
const date=value=>value?new Date(value).toLocaleString():'无';
const stream=new EventSource('/owner-workflow/api/waits/events');
stream.addEventListener('waits',event=>{try{const data=JSON.parse(event.data);if(data.contract!=='DSH_KERNEL_STATUS_V1')throw Error('状态合同不匹配');
const status=document.getElementById('connection');status.textContent='Runner：'+data.runner.status+' · 上次检查：'+date(data.runner.lastCheckAt)+(data.runner.lastError?' · '+data.runner.lastError:'');status.className=data.runner.status==='running'?'':'error';
const content=document.getElementById('content');content.replaceChildren();
for(const workspace of data.workspaces){content.append(el('h2',workspace.workspaceName));for(const workflow of workspace.workflows){const card=el('article');card.append(el('h2',workflow.goal),el('p',workflow.status+' · '+workflow.counts.completedTasks+'/'+workflow.counts.totalTasks+' 个任务完成'),el('small',workflow.workflowId));
card.append(el('p','恢复额度：'+(workflow.recovery.used??'待对账')+'/'+workflow.recovery.limit+' · 下次检查：'+date(workflow.nextWakeAt)));
for(const item of workflow.attention){const p=el('p',item.reason+' · 负责推进：'+item.responsibleParty+' · 继续条件：'+item.resumeCondition);p.className='error';card.append(p);if(item.detail)card.append(el('pre',typeof item.detail==='string'?item.detail:JSON.stringify(item.detail,null,2)))}
const table=el('table'),head=el('tr');for(const text of ['任务','Owner','阶段','等待原因'])head.append(el('th',text));table.append(head);for(const task of workflow.tasks){const row=el('tr');for(const text of [task.title||task.taskId,task.ownerId,task.phase,task.waiting?.reason||''])row.append(el('td',text));table.append(row)}card.append(table);
if(workflow.delivery)card.append(el('h3','交付证据'),el('pre',JSON.stringify(workflow.delivery,null,2)));content.append(card)}}
if(!data.workspaces.length)content.append(el('p','当前内核没有工作流记录。'));
}catch(error){document.getElementById('connection').textContent=error.message}});
const unavailable=()=>{const status=document.getElementById('connection');status.className='error';status.textContent='连接或状态读取失败；下方保留的是上次快照，不能据此认定仍在运行。'};
stream.onerror=unavailable;stream.addEventListener('unavailable',unavailable);window.addEventListener('pagehide',()=>stream.close());
</script></html>`
}
