import z from '@deepseek-ai/schemastery'
import { bindTypertRemote } from '@deepseek-ai/dsh-typert-protocol'
import createJevCenterRemoteDescriptor from './jev-center-remote.cjs'

const connectionQuestion = { state: 'The light is on.', questions: { connectivity: { type: 'noul', instructions: 'Is the light on?' } } }
const probability = value => Number.isFinite(value) && value >= 0 && value <= 1

function distribution(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || !keys.every(key => Object.hasOwn(value, key) && probability(value[key]))
    || Math.abs(Object.values(value).reduce((sum, probability) => sum + probability, 0) - 1) > 0.0001) throw new Error('Invalid probabilities')
  return Object.fromEntries(keys.map(key => [key, value[key]]))
}

function parseJudgment(body, questions) {
  if (typeof body?.model !== 'string' || !body.model || !body.answers || !body.usage
    || ![body.usage.input_tokens, body.usage.output_tokens].every(value => Number.isSafeInteger(value) && value >= 0)) throw new Error('Invalid response')
  const answers = []
  for (const [id, question] of Object.entries(questions)) {
    const answer = body.answers[id]
    if (answer?.type !== question.type) throw new Error('Invalid answer type')
    let parsed
    if (question.type === 'noul') {
      if (!probability(answer.noul)) throw new Error('Invalid Noul')
      parsed = { type: 'noul', noul: answer.noul }
    } else if (question.type === 'choice') {
      const keys = Object.keys(question.criteria)
      if (!keys.includes(answer.choice) || !probability(answer.confidence)) throw new Error('Invalid Choice')
      parsed = { type: 'choice', choice: answer.choice, probabilities: distribution(answer.probabilities, keys), confidence: answer.confidence }
    } else if (question.type === 'score') {
      const keys = question.criteria.map((_, index) => String(index))
      if (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > keys.length - 1 || !probability(answer.confidence)
        || !answer.legend || Object.keys(answer.legend).length !== keys.length || !keys.every(key => typeof answer.legend[key] === 'string')) throw new Error('Invalid Score')
      parsed = { type: 'score', score: answer.score, legend: Object.fromEntries(keys.map(key => [key, answer.legend[key]])), probabilities: distribution(answer.probabilities, keys), confidence: answer.confidence }
    } else { throw new Error('Unknown question type') }
    answers.push([id, parsed])
  }
  return { model: body.model, answers: Object.fromEntries(answers), usage: { input_tokens: body.usage.input_tokens, output_tokens: body.usage.output_tokens } }
}

const page = `<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>JEV 中心</title>
<style>body{font:16px system-ui;max-width:760px;margin:32px auto;padding:0 20px}label{display:block;margin:14px 0}input:not([type=checkbox]),select{display:block;width:100%;padding:8px;box-sizing:border-box}button{padding:8px 16px;margin:4px}pre{white-space:pre-wrap}small{color:#555}</style>
<h1>JEV 中心</h1><p>在 DSH 标准设置和凭据管理中保存引擎，按调用模型名请求判断。</p>
<label>JEV 引擎配置列表<select id="engines"></select></label><button id="add" type="button">新增配置</button><button id="delete" type="button">删除配置</button>
<form id="config"><label>服务 URL<input name="url" required></label><label>上游模型名<input name="upstreamModel" required></label><label>调用模型名<input name="modelName" placeholder="留空沿用上游模型名"></label><label>凭据引用<input name="credentialRef" required></label><label>请求超时（毫秒）<input name="timeoutMs" type="number" min="1" required></label><label><input name="enabled" type="checkbox">启用</label><button>保存配置</button></form>
<form id="credential"><label>密钥<input name="key" type="password" autocomplete="new-password" required></label><button>保存到 DSH 凭据管理</button><small id="credential-status"></small></form>
<button id="test" type="button">测试连接</button><pre id="result" role="status"></pre>
<script>
const form=document.querySelector('#config'),keyForm=document.querySelector('#credential'),result=document.querySelector('#result'),selector=document.querySelector('#engines');let revision,engines=[],credentials=[],selected=0;
async function request(path,method,body){const response=await fetch('/jev-center/api/'+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();if(!response.ok)throw Error(value.error?.message||'操作失败');return value}
function show(value){result.textContent=typeof value==='string'?value:JSON.stringify(value,null,2)}
function fill(){const engine=engines[selected]||{url:'https://api.typesafe.ai',upstreamModel:'jev-latest',modelName:'',credentialRef:'TYPESAFE_API_KEY',timeoutMs:5000,enabled:true};for(const [name,v]of Object.entries(engine)){const input=form.elements.namedItem(name);if(input)input.type==='checkbox'?input.checked=v:input.value=v}selector.replaceChildren();engines.forEach((engine,index)=>{const option=document.createElement('option');option.value=String(index);option.textContent=(index+1)+'. '+(engine.modelName||engine.upstreamModel)+(engine.enabled?'':'（停用）');selector.appendChild(option)});if(!engines[selected]){const option=document.createElement('option');option.value='-1';option.textContent='新配置（未保存）';selector.appendChild(option)}selector.value=engines[selected]?String(selected):'-1';document.querySelector('#delete').disabled=!engines[selected];document.querySelector('#credential-status').textContent=credentials[selected]?.configured?'已配置凭据':'未配置凭据'}
async function load(){const value=await request('config','GET');revision=value.revision;engines=value.engines;credentials=value.credentials;fill()}
selector.onchange=()=>{selected=Number(selector.value);keyForm.reset();fill();show('')};document.querySelector('#add').onclick=()=>{selected=-1;keyForm.reset();fill();show('')};
form.onsubmit=async event=>{event.preventDefault();try{const data=new FormData(form),engine=Object.fromEntries(data);engine.enabled=form.elements.enabled.checked;engine.timeoutMs=Number(engine.timeoutMs);const next=engines.slice();if(engines[selected])next[selected]=engine;else{selected=next.length;next.push(engine)}await request('config','PUT',{engines:next,revision});await load();show('配置已保存，未调用模型')}catch(error){show(error.message)}};
document.querySelector('#delete').onclick=async()=>{try{if(!engines[selected])throw Error('请先选择已保存的配置');const next=engines.filter((_,index)=>index!==selected);await request('config','PUT',{engines:next,revision});selected=Math.max(0,Math.min(selected,next.length-1));await load();show('配置已删除，凭据已保留')}catch(error){show(error.message)}};
keyForm.onsubmit=async event=>{event.preventDefault();try{await request('credential','PUT',{ref:form.elements.credentialRef.value,value:keyForm.elements.key.value});keyForm.reset();document.querySelector('#credential-status').textContent='凭据已保存';show('凭据已保存')}catch(error){show(error.message)}};
document.querySelector('#test').onclick=async()=>{try{const engine=engines[selected];if(!engine)throw Error('请先保存配置');show('正在测试连接…');show(await request('test','POST',{modelName:engine.modelName||engine.upstreamModel}))}catch(error){show(error.message)}};load().catch(error=>show(error.message));
</script></html>`

export const name = 'dsh-workflow-jev-center'
export const inject = ['credentials']
export const Config = z.object({
  engines: z.array(z.object({
    url: z.string().pattern(/^https?:\/\/[^/?#@\s]+(?:[/?#][^\s]*)?$/).default('https://api.typesafe.ai').description('JEV 服务基础 URL 或 System One 地址'),
    upstreamModel: z.string().min(1).default('jev-latest').description('上游模型名'),
    modelName: z.string().default('').description('调用模型名（留空沿用上游模型名）'),
    credentialRef: z.string().pattern(/^[A-Za-z_][A-Za-z0-9_]*$/).role('credential-ref').default('TYPESAFE_API_KEY').description('凭据引用'),
    enabled: z.boolean().default(true).description('启用'),
    timeoutMs: z.number().step(1).min(1).max(2147483647).default(5000).description('请求超时（毫秒）'),
  })).default([]).volatile().description('JEV 引擎配置'),
})

// Standard Schema validation guards Host writes without putting executable callbacks in the wire form schema.
const standardSchema = Config['~standard']
Object.defineProperty(Config, '~standard', { value: { ...standardSchema, validate(input) {
  const result = standardSchema.validate(input)
  if (result.issues) return result
  try { createJevCenterRemoteDescriptor.assertUniqueModelNames(result.value.engines.get()); return result }
  catch { return { issues: [{ message: '已启用的调用模型名重复，请改名后保存' }] } }
} } })

export function apply(ctx, config) {
  const engines = () => config.engines.get().map(engine => ({ ...engine, modelName: engine.modelName || engine.upstreamModel }))
  const evaluate = async (modelName, request, { signal } = {}) => {
    const started = performance.now()
    const failure = (code, message) => ({ ok: false, error: { code, message }, elapsedMs: performance.now() - started })
    const matches = engines().filter(engine => engine.modelName === modelName)
    const engine = matches.find(engine => engine.enabled) ?? matches[0]
    if (!engine) return failure('ENGINE_MISSING', 'JEV 引擎缺失')
    if (!engine.enabled) return failure('ENGINE_DISABLED', 'JEV 引擎已停用')
    if (signal?.aborted) return failure('CANCELLED', 'JEV 请求已取消')
    const controller = new AbortController()
    let timeout, cancel
    const deadline = new Promise(resolve => {
      const finish = (code, message) => { resolve(failure(code, message)); controller.abort() }
      timeout = setTimeout(() => finish('TIMEOUT', 'JEV 请求超时'), engine.timeoutMs)
      cancel = () => finish('CANCELLED', 'JEV 请求已取消')
      signal?.addEventListener('abort', cancel, { once: true })
    })
    const operation = async () => {
      const credential = await ctx.credentials.resolve(engine.credentialRef)
      if (!credential?.value) return failure('CREDENTIAL_MISSING', 'JEV 凭据未配置')
      controller.signal.throwIfAborted()
      const endpoint = new URL(engine.url)
      const pathname = endpoint.pathname.replace(/\/$/, '')
      endpoint.pathname = pathname.endsWith('/v1/systemone') ? pathname : `${pathname}/v1/systemone`
      const response = await fetch(endpoint, {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${credential.value}`, 'content-type': 'application/json' },
        body: JSON.stringify({ state: request.state, questions: request.questions, model: engine.upstreamModel }),
      })
      if (!response.ok) {
        void response.body?.cancel().catch(() => {})
        if (response.status === 401 || response.status === 403) return failure('AUTHENTICATION_FAILED', `JEV 鉴权失败（HTTP ${response.status}）`)
        if (response.status >= 400 && response.status < 429) return failure('UPSTREAM_REQUEST_REJECTED', `JEV 请求被拒绝（HTTP ${response.status}）`)
        return failure('UPSTREAM_UNAVAILABLE', `JEV 服务不可用（HTTP ${response.status}）`)
      }
      try {
        const body = parseJudgment(await response.json(), request.questions)
        const visible = JSON.stringify(body)
        if (visible.includes(credential.value) || /authorization\s*[:=]|bearer\s+/i.test(visible)) throw new Error('Credential echo')
        return { ok: true, ...body, elapsedMs: performance.now() - started }
      } catch { return failure('INVALID_RESPONSE', 'JEV 返回了无效判断') }
    }
    try {
      return await Promise.race([operation().catch(() => failure('NETWORK_ERROR', 'JEV 请求连接失败')), deadline])
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', cancel) }
  }
  const center = { evaluate, describe: engines, testConnection: modelName => evaluate(modelName, connectionQuestion) }
  center.typertRemote = bindTypertRemote(center, 'jevCenter')
  ctx.provide('jevCenter', center)
  ctx.inject(['typert'], child => {
    child.effect(() => child.typert.register({
      package: 'dsh-workflow', face: 'host', schemas: [],
      model: { services: [], events: [], objects: [] },
      invocations: [createJevCenterRemoteDescriptor()],
    }))
  })
  ctx.inject(['webServer', 'settings'], child => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber))
    const ns = ctx.fiber.entry?.options.id
    child.effect(() => child.webServer.register({ kind: 'prefix', path: '/jev-center', handler: async (req, res) => {
      const path = req.url?.split('?')[0]
      const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(body)) }
      try {
        if (req.method === 'GET' && (path === '/jev-center' || path === '/jev-center/')) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }); res.end(page); return
        }
        if (req.method === 'GET' && path === '/jev-center/api/config') {
          const descriptor = child.settings.describe({ redactSecrets: true }).find(row => row.ns === ns)
          const credentials = await Promise.all(engines().map(engine => child.credentials.describe(engine.credentialRef)))
          send(200, { engines: descriptor.value.engines, revision: descriptor.revision, credentials }); return
        }
        const chunks = []; for await (const chunk of req) chunks.push(chunk)
        const body = JSON.parse(Buffer.concat(chunks).toString() || '{}')
        if (req.method === 'PUT' && path === '/jev-center/api/config') {
          await child.settings.update(ns, { engines: body.engines }, body.revision); send(200, { ok: true }); return
        }
        if (req.method === 'PUT' && path === '/jev-center/api/credential') {
          await child.credentials.set(body.ref, body.value); send(200, { ok: true }); return
        }
        if (req.method === 'POST' && path === '/jev-center/api/test') { send(200, await center.testConnection(body.modelName)); return }
        send(404, { error: { code: 'NOT_FOUND', message: '操作不存在' } })
      } catch (error) {
        const conflict = error.message?.includes('调用模型名重复')
        send(400, { error: { code: conflict ? 'MODEL_NAME_CONFLICT' : 'CONFIGURATION_ERROR',
          message: conflict ? '已启用的调用模型名重复，请改名后保存' : '配置或凭据操作失败，请检查设置' } })
      }
    } }))
  })
}

export default { name, inject, Config, apply }
