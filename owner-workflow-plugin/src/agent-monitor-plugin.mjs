import { mkdir, appendFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import z from '@deepseek-ai/schemastery'
import { createAgentMonitor } from './agent-monitor.mjs'

export const name = 'dsh-workflow-agent-monitor'
export const inject = ['agents']
export const Config = z.object({
  directory: z.string(),
  checkIntervalMs: z.number().step(1).min(1).default(60_000).description('无输出检查间隔（毫秒）').volatile(),
  noOutputThreshold: z.number().step(1).min(1).default(5).description('连续无输出告警次数').volatile(),
})

function desktopNotice(alert) {
  if (process.platform !== 'darwin') return Promise.resolve()
  const message = `${alert.role === 'child' ? '子代理' : '主代理'} ${alert.agentId}: ${alert.reason}`
  return new Promise((resolve, reject) => {
    // Notification text is an argument, never interpolated into AppleScript.
    execFile('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title "DSH 代理监控"',
      '-e', 'end run', '--', message], { timeout: 5000 }, error => error ? reject(error) : resolve())
  })
}

const page = String.raw`<!doctype html><html lang="zh"><meta charset="utf-8"><title>DSH 代理监控</title>
<style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 20px}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px;border-radius:8px}small{color:#555}label{display:block;margin:12px 0}input{padding:6px;margin-left:8px}button{padding:8px 18px}</style>
<h1>DSH 代理监控</h1><p>仅检测、通知和记录原因。</p>
<form id="settings"><fieldset id="controls" disabled><legend>监控设置</legend>
<label>检查间隔（毫秒）<input name="checkIntervalMs" type="number" min="1" step="1" required></label>
<label>连续无输出告警次数<input name="noOutputThreshold" type="number" min="1" step="1" required></label>
<button type="submit">保存设置</button></fieldset><p id="saved" role="status"></p></form>
<p id="mode"></p><h2>最近告警</h2><pre id="alerts"></pre><h2>代理状态</h2><pre id="agents"></pre><small id="error"></small>
<script>
const form=document.querySelector('#settings');let revision,dirty=false;
form.addEventListener('input',()=>{dirty=true});
async function refresh(){try{const r=await fetch('/agent-monitor/api/status',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const s=await r.json();
const c=s.configuration;document.querySelector('#controls').disabled=!c;
if(c&&!dirty){revision=c.revision;form.elements.checkIntervalMs.value=c.value.checkIntervalMs;form.elements.noOutputThreshold.value=c.value.noOutputThreshold}
document.querySelector('#mode').textContent='无输出检测已启用';
document.querySelector('#alerts').textContent=s.alerts.slice().reverse().map(a=>new Date(a.at).toLocaleString()+' '+a.role+' '+a.agentId+' ['+a.kind+'] '+a.reason+' '+JSON.stringify(a.evidence)+(a.recoveredAt?'\n恢复：'+new Date(a.recoveredAt).toLocaleString():'')).join('\n\n')||'暂无告警';
document.querySelector('#agents').textContent=JSON.stringify(s.agents,null,2);document.querySelector('#error').textContent=c?'':'标准 Settings 暂不可用，监控仍在运行'}catch(e){document.querySelector('#error').textContent='监控状态读取失败：'+e.message}}
form.addEventListener('submit',async e=>{e.preventDefault();try{const r=await fetch('/agent-monitor/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({checkIntervalMs:Number(form.elements.checkIntervalMs.value),noOutputThreshold:Number(form.elements.noOutputThreshold.value),expectedRevision:revision})});const result=await r.json();if(!r.ok)throw Error(result.error);dirty=false;document.querySelector('#saved').textContent='设置已保存';await refresh()}catch(error){document.querySelector('#saved').textContent='保存失败：'+error.message}});
refresh();setInterval(refresh,3000)
</script></html>`

export async function apply(ctx, config = {}, deps = {}) {
  const value = (key, fallback) => config[key]?.get?.() ?? config[key] ?? fallback
  const directory = config.directory ?? join(process.env.DSH_HOME ?? join(process.env.HOME, '.dsh'), 'storages', 'dsh-agent-monitor')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const journalPath = join(directory, 'alerts.jsonl'), notify = deps.notify ?? desktopNotice
  let writes = Promise.resolve(), notices = Promise.resolve()
  const monitor = createAgentMonitor(config, { now: deps.now, onRecord: record => {
    writes = writes.then(() => appendFile(journalPath, JSON.stringify(record) + '\n', { mode: 0o600 }))
      .catch(() => { ctx.logger.warn('Agent monitor log write failed') })
  }, onAlert: alert => {
    ctx.logger.warn(`[agent-monitor] ${alert.agentId} ${alert.kind}: ${alert.reason}`)
    notices = notices.then(() => notify(alert)).catch(() => { ctx.logger.warn('Agent monitor notification submission failed') })
  } })
  const service = { ...monitor,
    flush: async () => { await Promise.resolve(); await Promise.all([writes, notices]) },
    journal: async () => {
      await service.flush()
      try { return (await readFile(journalPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line)) }
      catch (error) { if (error.code === 'ENOENT') return []; throw error }
    },
  }
  ctx.provide('agentMonitor', service)
  ctx.inject(['settings'], child => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
  const configuration = () => {
    const settings = ctx.get('settings'), editor = ctx.get('configEditor')
    const entry = editor?.entries().find(row => row.fiber?.uid === ctx.fiber.uid)
    return entry && settings?.describe({ redactSecrets: true }).find(row => row.ns === entry.options.id)
  }
  const observe = (type, payload) => {
    try { monitor.observe(type, payload) } catch { ctx.logger.warn('Agent monitor could not observe an event') }
  }
  ctx.on('agent/request', async (payload, next) => {
    observe('agent/request', payload)
    const result = await next()
    observe('agent/request-config', { ...payload, ...result })
    return result
  })
  for (const type of ['agent/assistant-stream', 'agent/status', 'agent/error', 'agent/disposed']) {
    ctx.on(type, payload => observe(type, payload))
  }
  let timer
  const schedule = () => {
    clearInterval(timer)
    timer = setInterval(() => { void monitor.tick().catch(() => ctx.logger.warn('Agent monitor check failed')) }, value('checkIntervalMs', 60_000))
    timer.unref()
  }
  schedule()
  ctx.on('loader/volatile-update', schedule)
  ctx.effect(() => () => { clearInterval(timer); monitor.close(); return Promise.all([writes, notices]) }, 'Agent monitor observation')
  const web = ctx.get('webServer')
  if (web) {
    const dispose = web.register({ kind: 'prefix', path: '/agent-monitor', handler: async (req, res) => {
      const path = req.url?.split('?')[0]
      const json = (status, value) => {
        res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
        res.end(JSON.stringify(value))
      }
      if (req.method === 'POST' && path === '/agent-monitor/api/settings') {
        try {
          let body = ''
          for await (const chunk of req) { body += chunk; if (body.length > 16_384) throw new Error('Settings request too large') }
          const input = JSON.parse(body), descriptor = configuration()
          if (!descriptor) { json(503, { error: '标准 Settings 暂不可用' }); return }
          const { checkIntervalMs, noOutputThreshold, expectedRevision } = input
          if (![checkIntervalMs, noOutputThreshold].every(value => Number.isSafeInteger(value) && value > 0)) {
            json(400, { error: '检查间隔和连续次数必须为正整数' }); return
          }
          await ctx.get('settings').update(descriptor.ns, { checkIntervalMs, noOutputThreshold }, expectedRevision)
          json(200, { configuration: configuration() })
        } catch (error) { json(400, { error: error.message }) }
        return
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
      if (path === '/agent-monitor/api/status') { json(200, { ...monitor.snapshot(), directory, configuration: configuration() }); return }
      if (path === '/agent-monitor/api/journal') { json(200, await service.journal()); return }
      if (path !== '/agent-monitor' && path !== '/agent-monitor/') { res.writeHead(404); res.end(); return }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
      res.end(page)
    } })
    ctx.effect(() => dispose, 'Agent monitor status page')
  }
  ctx.logger.info(`Agent monitor: observation only; logs ${directory}`)
}

export default { name, inject, Config, apply }
