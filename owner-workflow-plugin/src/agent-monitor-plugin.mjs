import { mkdir, appendFile, readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { createRequire } from 'node:module'
import z from '@deepseek-ai/schemastery'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import { LocalCredentialProvider, parseCredentialsDocument, resolveSpec } from '@deepseek-ai/dsh-credentials-local'
import { createAgentMonitor } from './agent-monitor.mjs'
import createAgentMonitorRemoteDescriptor from './agent-monitor-remote.cjs'

// Native loaders may expose separate ESM and CommonJS instances of the same SDK package.
const CommonJsLocalCredentialProvider = createRequire(import.meta.url)('@deepseek-ai/dsh-credentials-local').LocalCredentialProvider

export const name = 'dsh-workflow-agent-monitor'
export const inject = ['agents']
export const Config = z.object({
  directory: z.string(),
  checkIntervalMs: z.number().step(1).min(1).default(60_000).description('无输出检查间隔（毫秒）').volatile(),
  noOutputThreshold: z.number().step(1).min(1).default(5).description('连续无输出告警次数').volatile(),
  jevModelName: z.string().default('').description('JEV 调用模型名').volatile(),
  semanticWaitMs: z.number().step(1).min(1).default(180_000).description('语义检测起始等待（毫秒）').volatile(),
  semanticThreshold: z.number().step(1).min(1).default(5).description('连续明确语义异常告警次数').volatile(),
  debugEvidence: z.boolean().default(false).description('记录调试会话片段').volatile(),
})

function desktopNotice(alert) {
  if (process.platform !== 'darwin') return Promise.resolve()
  const requestId = alert.attemptId ?? `${alert.turn}:${alert.step}`
  const message = `${alert.role === 'child' ? '子代理' : '主代理'} ${alert.agentId}；请求 ${requestId}；类别 ${alert.kind}；观察时间 ${new Date(alert.at).toISOString()}；${alert.reason}`
  return new Promise((resolve, reject) => {
    // Notification text is an argument, never interpolated into AppleScript.
    execFile('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title "DSH 代理监控"',
      '-e', 'end run', '--', message], { timeout: 5000 }, error => error ? reject(error) : resolve())
  })
}

const page = String.raw`<!doctype html><html lang="zh"><meta charset="utf-8"><title>DSH 代理监控</title>
<style>body{font:16px system-ui;max-width:1100px;margin:32px auto;padding:0 20px}pre{white-space:pre-wrap;background:#f3f4f6;padding:16px;border-radius:8px}small{color:#555}label{display:block;margin:12px 0}input{padding:6px;margin-left:8px}button{padding:8px 18px}.unavailable{color:#b91c1c}</style>
<h1>DSH 代理监控</h1><p>仅检测、通知和记录原因。</p>
<form id="settings"><fieldset id="controls" disabled><legend>监控设置</legend>
<label>检查间隔（毫秒）<input name="checkIntervalMs" type="number" min="1" step="1" required></label>
<label>连续无输出告警次数<input name="noOutputThreshold" type="number" min="1" step="1" required></label>
<label>JEV 调用模型名<input name="jevModelName" list="models"><datalist id="models"></datalist></label>
<label>语义检测起始等待（毫秒）<input name="semanticWaitMs" type="number" min="1" step="1" required></label>
<label>连续明确语义异常告警次数<input name="semanticThreshold" type="number" min="1" step="1" required></label>
<label><input name="debugEvidence" type="checkbox">记录调试会话片段</label>
<button type="submit">保存设置</button></fieldset><p id="saved" role="status"></p></form>
<p id="mode"></p><h2>最近告警</h2><pre id="alerts"></pre><h2>代理状态</h2><pre id="agents"></pre><small id="error"></small>
<script>
const form=document.querySelector('#settings');let revision,dirty=false;
form.addEventListener('input',()=>{dirty=true});
async function refresh(){try{const r=await fetch('/agent-monitor/api/status',{cache:'no-store'});if(!r.ok)throw Error('HTTP '+r.status);const s=await r.json();
const c=s.configuration;document.querySelector('#controls').disabled=!c;
if(c&&!dirty){revision=c.revision;for(const[name,value]of Object.entries(c.value)){const input=form.elements.namedItem(name);if(input)input.type==='checkbox'?input.checked=value:input.value=value}}
const mode=document.querySelector('#mode');mode.textContent=s.engineAvailability.reason+'；无输出与异常结束检测继续工作';mode.classList.toggle('unavailable',!s.engineAvailability.available);
document.querySelector('#models').replaceChildren(...s.availableModels.map(name=>{const option=document.createElement('option');option.value=name;return option}));
document.querySelector('#alerts').textContent=s.alerts.slice().reverse().map(a=>new Date(a.at).toLocaleString()+' '+a.role+' '+a.agentId+' 请求：'+(a.attemptId??a.turn+':'+a.step)+' ['+a.kind+'] '+a.reason+' '+JSON.stringify(a.evidence)+(a.recoveredAt?'\n恢复：'+new Date(a.recoveredAt).toLocaleString():'')).join('\n\n')||'暂无告警';
document.querySelector('#agents').textContent=JSON.stringify(s.agents,null,2);document.querySelector('#error').textContent=c?'':'标准 Settings 暂不可用，监控仍在运行'}catch(e){document.querySelector('#error').textContent='监控状态读取失败：'+e.message}}
form.addEventListener('submit',async e=>{e.preventDefault();try{const body={expectedRevision:revision,jevModelName:form.elements.jevModelName.value,debugEvidence:form.elements.debugEvidence.checked};for(const name of['checkIntervalMs','noOutputThreshold','semanticWaitMs','semanticThreshold'])body[name]=Number(form.elements.namedItem(name).value);const r=await fetch('/agent-monitor/api/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const result=await r.json();if(!r.ok)throw Error(result.error);dirty=false;document.querySelector('#saved').textContent='设置已保存';await refresh()}catch(error){document.querySelector('#saved').textContent='保存失败：'+error.message}});
refresh();setInterval(refresh,3000)
</script></html>`

export async function apply(ctx, config = {}, deps = {}) {
  const value = (key, fallback) => config[key]?.get?.() ?? config[key] ?? fallback
  const directory = config.directory ?? join(process.env.DSH_HOME ?? join(process.env.HOME, '.dsh'), 'storages', 'dsh-agent-monitor')
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const journalPath = join(directory, 'alerts.jsonl'), notify = deps.notify ?? desktopNotice
  const credentialCatalog = () => {
    const secrets = Object.entries(process.env).filter(([name, value]) => value && /(?:API_KEY|ACCESS_TOKEN|AUTH_TOKEN|SECRET_KEY|PASSWORD)$/i.test(name)).map(([, value]) => value)
    try {
      const provider = ctx.get('credentials')
      if (!(provider instanceof LocalCredentialProvider || provider instanceof CommonJsLocalCredentialProvider)
        || !provider.config) throw new Error('Credential catalog unavailable')
      const filename = resolveSpec(provider.config).filename
      const document = parseCredentialsDocument(readFileSync(filename, 'utf8'), filename)
      const collect = value => {
        if (typeof value === 'string' && value.length) secrets.push(value)
        else if (value && typeof value === 'object') for (const child of Object.values(value)) collect(child)
      }
      for (const secret of document.refs.values()) collect(secret)
      for (const stored of document.records.values()) {
        if (stored.kind === 'grant') collect(stored.payload)
        else { collect(stored.key); collect(stored.env) }
      }
      const refs = new Set([...document.refs.keys(), ...(ctx.get('jevCenter')?.describe() ?? []).map(engine => engine.credentialRef)])
      for (const ref of refs) collect(process.env[ref])
      return { secrets, refs, provider, available: true }
    } catch { return { secrets, available: false } }
  }
  const sanitize = (record, catalog) => {
    const { secrets, available } = catalog
    if (record.debugEvidence && !available) record = { ...record, debugEvidence: undefined, debugOmitted: '无法完成凭据脱敏' }
    for (const snippet of Object.values(record.debugEvidence ?? {})) {
      if (typeof snippet !== 'string') continue
      for (const match of snippet.matchAll(/\bBearer\s+([^\s"'\r\n]+)/gi)) secrets.push(match[1])
    }
    const scrub = (value, materials = secrets, key, nativeFailure = false) => {
      if (typeof value === 'string') {
        if (key === 'code') {
          value = scrub(value, Object.values(process.env).filter(Boolean))
          if (!available && nativeFailure) return 'UNKNOWN'
        }
        for (const secret of materials) value = value.split(secret).join('[REDACTED]')
        return value.replace(/(?:proxy-authorization|authorization)["']?\s*[:=][^\r\n]*/gi, '[REDACTED]')
          .replace(/(?:api[_-]?key|access[_-]?token|secret|password)["']?\s*[:=]\s*["']?[^\s"',;\r\n]+/gi, '[REDACTED]')
          .replace(/\bBearer\s+[^\s"'\r\n]+/gi, '[REDACTED]')
      }
      if (Array.isArray(value)) return value.map(child => scrub(child, materials, undefined, nativeFailure))
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) =>
        [key, scrub(child, materials, key, nativeFailure || value.kind === 'model-error' && key === 'evidence')]))
      return value
    }
    const sanitized = scrub(record)
    // Standard credentials can resolve any env-only ref; conservatively protect fragments, not request metadata.
    if (sanitized.debugEvidence) sanitized.debugEvidence = scrub(sanitized.debugEvidence, Object.values(process.env).filter(Boolean))
    return sanitized
  }
  const sanitizeRecord = async record => {
    const catalog = credentialCatalog()
    if (catalog.available) {
      try {
        for (const ref of catalog.refs) {
          const credential = await catalog.provider.resolve(ref)
          if (credential?.value) catalog.secrets.push(credential.value)
        }
      } catch { catalog.available = false }
    }
    return sanitize(record, catalog)
  }
  let writes = Promise.resolve(), notices = Promise.resolve()
  const judge = async (evidence, signal) => {
    const modelName = value('jevModelName', ''), center = ctx.get('jevCenter')
    if (!modelName || !center) return { ok: false, modelName, status: 'unknown', error: {
      code: modelName ? 'CENTER_MISSING' : 'MODEL_NOT_SELECTED', message: modelName ? 'JEV 中心不可用' : '未选择 JEV 调用模型名' } }
    const result = await center.evaluate(modelName, { state: { task: evidence.task, reasoning: evidence.reasoning }, questions: {
      progress: { type: 'choice', instructions: 'Classify whether the ongoing reasoning is making meaningful progress toward the task.',
        criteria: { anomaly: 'Repeating the same ideas or failed approach without new analysis.',
          normal: 'Investigating new evidence, hypotheses or narrowing the solution; difficult but progressing work.',
          unknown: 'Insufficient or conflicting evidence to judge progress.' } },
    } }, { signal })
    if (!result.ok) return { ...result, modelName, status: 'unknown' }
    const answer = result.answers.progress, probabilities = answer.probabilities
    const maximum = Math.max(...Object.values(probabilities)), winners = Object.keys(probabilities).filter(key => probabilities[key] === maximum)
    const status = winners.length === 1 && winners[0] === answer.choice ? winners[0] : 'unknown'
    const selection = winners.length !== 1 ? 'tie' : winners[0] !== answer.choice ? 'choice-mismatch' : 'unique-argmax'
    return { ok: true, status, model: result.model, modelName, elapsedMs: result.elapsedMs,
      probabilities, confidence: answer.confidence, selection, declaredChoice: answer.choice, argmax: winners.length === 1 ? winners[0] : undefined,
      ...status === 'unknown' ? { error: { code: 'JUDGMENT_UNKNOWN', message: selection === 'tie' ? 'JEV 判断概率并列'
        : selection === 'choice-mismatch' ? 'JEV 判断选项与概率不一致' : 'JEV 判断信息不足' } } : {} }
  }
  const monitor = createAgentMonitor(config, { now: deps.now, judge, onRecord: record => {
    writes = writes.then(async () => appendFile(journalPath, JSON.stringify(await sanitizeRecord(record)) + '\n', { mode: 0o600 }))
      .catch(() => { ctx.logger.warn('Agent monitor log write failed') })
  }, onAlert: alert => {
    notices = notices.then(async () => {
      const sanitized = await sanitizeRecord(alert)
      ctx.logger.warn(`[agent-monitor] ${sanitized.agentId} ${sanitized.kind}: ${sanitized.reason}`)
      await notify(sanitized)
    }).catch(() => { ctx.logger.warn('Agent monitor notification submission failed') })
  } })
  function availability(state) {
    const modelName = value('jevModelName', ''), center = ctx.get('jevCenter')
    const unavailable = (code, reason) => ({ available: false, color: 'red', code, reason, modelName })
    if (!modelName) return unavailable('MODEL_NOT_SELECTED', '未选择 JEV 调用模型名')
    if (!center) return unavailable('CENTER_MISSING', 'JEV 中心不可用')
    const matches = center.describe().filter(engine => engine.modelName === modelName)
    const engine = matches.find(engine => engine.enabled) ?? matches[0]
    if (!engine) return unavailable('ENGINE_MISSING', 'JEV 引擎缺失')
    if (!engine.enabled) return unavailable('ENGINE_DISABLED', 'JEV 引擎已停用')
    const latest = state.agents.map(row => row.lastJudgment).filter(judgment => judgment?.modelName === modelName)
      .sort((a, b) => b.at - a.at)[0]
    if (latest?.error) return unavailable(latest.error.code, latest.error.message)
    return { available: true, color: 'green', code: 'READY', reason: 'JEV 引擎已配置', modelName }
  }
  const service = { ...monitor,
    snapshot: () => {
      const state = monitor.snapshot(), engineAvailability = availability(state)
      return sanitize({ ...state, semanticAvailable: engineAvailability.available, engineAvailability,
        availableModels: (ctx.get('jevCenter')?.describe() ?? []).filter(engine => engine.enabled).map(engine => engine.modelName) }, credentialCatalog())
    },
    flush: async () => { await Promise.resolve(); await Promise.all([writes, notices]) },
    journal: async () => {
      await service.flush()
      try { return await Promise.all((await readFile(journalPath, 'utf8')).trim().split('\n').filter(Boolean).map(line => sanitizeRecord(JSON.parse(line)))) }
      catch (error) { if (error.code === 'ENOENT') return []; throw error }
    },
  }
  service.typertRemote = bindTypertRemote(service, 'agentMonitor')
  ctx.provide('agentMonitor', service)
  ctx.inject(['typert'], child => {
    child.effect(() => child.typert.register({ package: 'dsh-owner-workflow', face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] }, invocations: [createAgentMonitorRemoteDescriptor()] }))
  })
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
  for (const type of ['agent/assistant-stream', 'agent/status', 'agent/error', 'agent/disposed', 'agent/inbox/claimed']) {
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
          const fields = ['checkIntervalMs', 'noOutputThreshold', 'semanticWaitMs', 'semanticThreshold', 'jevModelName', 'debugEvidence']
          const patch = Object.fromEntries(fields.filter(key => Object.hasOwn(input, key)).map(key => [key, input[key]]))
          if (Object.entries(patch).some(([key, value]) => key === 'jevModelName' ? typeof value !== 'string'
            : key === 'debugEvidence' ? typeof value !== 'boolean' : !Number.isSafeInteger(value) || value <= 0)) {
            json(400, { error: '时间和次数须为正整数，模型名须为文字，调试开关须为布尔值' }); return
          }
          await ctx.get('settings').update(descriptor.ns, patch, input.expectedRevision)
          json(200, { configuration: configuration() })
        } catch { json(400, { error: '监控设置保存失败，请检查配置并刷新重试' }) }
        return
      }
      if (req.method !== 'GET') { res.writeHead(405); res.end(); return }
      if (path === '/agent-monitor/api/status') { json(200, { ...service.snapshot(), directory, configuration: configuration() }); return }
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
