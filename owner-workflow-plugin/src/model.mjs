import { isAbsolute, normalize, relative, sep } from 'node:path'
import { createHash } from 'node:crypto'
import { MEMORY_DIRECTORY, normalizeMemoryUpdates } from './memory.mjs'

export const PLAN_CONTRACT = 'DSH_PLAN_V1'
export const PLAN_V2_CONTRACT = 'DSH_PLAN_V2'
export const STATE_CONTRACT = 'DSH_WORKFLOW_STATE_V1'
export const OWNER_RESULT_CONTRACT = 'DSH_OWNER_RESULT_V1'
export const MODE_CONTRACT = 'DSH_OWNER_MODE_V1'
export const PLAN_REVIEW_CONTRACT = 'DSH_PLAN_REVIEW_V1'
export const IMPLEMENTATION_REVIEW_CONTRACT = 'DSH_IMPLEMENTATION_REVIEW_V1'

const OWNER_ID = /^[a-z][a-z0-9_-]{0,63}$/u
const STAGE_ID = /^[a-z][a-z0-9_-]{0,63}$/u
const TASK_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
const SHA256_DIGEST = /^[a-f0-9]{64}$/iu
const MAX_GLOB_PATH_LENGTH = 256
const MAX_GLOB_LITERAL_CHARACTERS = 64
const MAX_TASK_PRIORITY = 10_000
const MAX_POLICY_ATTEMPTS = 8
const DEFAULT_TASK_TIMEOUT_MS = 30 * 60 * 1000
const MIN_TASK_TIMEOUT_MS = 60 * 1000
const MAX_TASK_TIMEOUT_MS = 24 * 60 * 60 * 1000
const POLICY_ACTIONS = new Set(['repair_owner', 'handoff_replan', 'notify_main'])

export const TASK_STATUSES = Object.freeze(['pending', 'running', 'completed', 'stopped'])
export const WORKFLOW_STATUSES = Object.freeze([
  'initializing',
  'planning',
  'planned',
  'registry_pending_plan',
  'approved',
  'running',
  'blocked',
  'failed',
  'completed',
  'stopped',
  'cancelled',
])
export const STOP_REASON_ACTIONS = Object.freeze({
  input_missing: 'provide_input',
  decision_required: 'await_user',
  task_failed: 'repair_task',
  thread_failed: 'replace_thread',
  plan_invalid: 'revise_plan',
  runtime_failed: 'retry_runtime',
  owner_orphaned: 'recover_owner',
})

export function text(value, field) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${field} 必须是非空字符串`)
  }
  return value.trim()
}

export function optionalText(value, field) {
  if (value === undefined || value === null) return undefined
  return text(value, field)
}

export function identifier(value, field, pattern = OWNER_ID) {
  const result = text(value, field)
  if (!pattern.test(result)) throw new Error(`${field} 的格式不正确：${result}`)
  return result
}

export function stringList(value, field, { allowEmpty = true } = {}) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`)
  const result = value.map((item, index) => text(item, `${field}[${index}]`))
  if (!allowEmpty && result.length === 0) throw new Error(`${field} 不能为空`)
  return [...new Set(result.map(normalizeRelativePath))]
}

function textList(value, field, { allowEmpty = true } = {}) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`)
  const result = value.map((item, index) => text(item, `${field}[${index}]`))
  if (!allowEmpty && result.length === 0) throw new Error(`${field} 不能为空`)
  return [...new Set(result)]
}

function normalizeTaskPriority(value, field) {
  if (value === undefined) return 0
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_TASK_PRIORITY) {
    throw new Error(`${field} 必须是 0-${MAX_TASK_PRIORITY} 的安全整数`)
  }
  return value
}

function normalizeTaskPolicy(value, field, { allowRepair = true, timeout = false } = {}) {
  if (value === undefined) {
    return timeout
      ? { action: 'notify_main', afterMs: DEFAULT_TASK_TIMEOUT_MS }
      : { action: 'notify_main' }
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} 必须是对象`)
  }
  const allowed = timeout ? ['action', 'afterMs'] : ['action', 'maxAttempts']
  if (Object.keys(value).some(key => !allowed.includes(key))) {
    throw new Error(`${field} 包含不受支持的字段`)
  }
  const action = text(value.action, `${field}.action`)
  if (!POLICY_ACTIONS.has(action) || (!allowRepair && action === 'repair_owner')) {
    throw new Error(`${field}.action 不受支持：${action}`)
  }
  if (timeout) {
    const afterMs = value.afterMs ?? DEFAULT_TASK_TIMEOUT_MS
    if (!Number.isSafeInteger(afterMs) || afterMs < MIN_TASK_TIMEOUT_MS || afterMs > MAX_TASK_TIMEOUT_MS) {
      throw new Error(`${field}.afterMs 必须是 ${MIN_TASK_TIMEOUT_MS}-${MAX_TASK_TIMEOUT_MS} 的安全整数`)
    }
    return { action, afterMs }
  }
  const hasMaxAttempts = Object.hasOwn(value, 'maxAttempts')
  if (action === 'repair_owner') {
    if (!hasMaxAttempts || !Number.isSafeInteger(value.maxAttempts)
      || value.maxAttempts < 1 || value.maxAttempts > MAX_POLICY_ATTEMPTS) {
      throw new Error(`${field}.maxAttempts 必须是 1-${MAX_POLICY_ATTEMPTS} 的安全整数`)
    }
    return { action, maxAttempts: value.maxAttempts }
  }
  if (hasMaxAttempts) throw new Error(`${field}.maxAttempts 仅 repair_owner 策略允许声明`)
  return { action }
}

export function normalizeRelativePath(value) {
  const normalized = value.replaceAll('\\', '/').replace(/^\.\//u, '')
  if ([...normalized].length > MAX_GLOB_PATH_LENGTH) {
    throw new Error(`glob 路径长度超过上限：${MAX_GLOB_PATH_LENGTH}`)
  }
  const literalCharacters = new Set()
  for (const character of normalized) {
    if (character !== '/' && character !== '*' && character !== '?') literalCharacters.add(character)
  }
  if (literalCharacters.size > MAX_GLOB_LITERAL_CHARACTERS) {
    throw new Error(`glob 字面字符种类超过上限：${MAX_GLOB_LITERAL_CHARACTERS}`)
  }
  if (normalized === '' || normalized === '.' || normalized.startsWith('/') || isAbsolute(normalized)) {
    throw new Error(`scope 路径必须是仓库相对路径：${value}`)
  }
  const cleaned = normalize(normalized).replaceAll(sep, '/')
  if (cleaned === '..' || cleaned.startsWith('../')) {
    throw new Error(`scope 路径不能越过仓库根目录：${value}`)
  }
  return cleaned
}

/** 将固定验证的工作目录收敛为不含通配符的仓库相对路径。 */
export function normalizeVerificationCwd(value, field = 'verification.cwd') {
  const raw = text(value, field)
  if (raw.includes('\0')) throw new Error(`${field} 不能包含 NUL 字符`)
  const slashPath = raw.replaceAll('\\', '/')
  if (isAbsolute(slashPath) || /^[A-Za-z]:\//u.test(slashPath) || slashPath.startsWith('//')) {
    throw new Error(`${field} 必须是仓库相对路径`)
  }
  if (slashPath.includes('*') || slashPath.includes('?') || slashPath.split('/').includes('..')) {
    throw new Error(`${field} 不能包含通配符或越界路径段`)
  }
  const normalized = normalize(slashPath).replaceAll(sep, '/')
  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`${field} 不能越过仓库根目录`)
  }
  return normalized === '' ? '.' : normalized
}

export function normalizeOwner(raw) {
  if (raw === null || typeof raw !== 'object') throw new Error('Owner 定义必须是对象')
  const id = identifier(raw.id, 'owner.id')
  const scope = stringList(raw.scope, `owner(${id}).scope`, { allowEmpty: false })
  const declaredExclude = stringList(
    raw.declaredExclude ?? raw.exclude,
    `owner(${id}).declaredExclude`,
  )
  const managedExclude = stringList(raw.managedExclude, `owner(${id}).managedExclude`)
  const exclude = [...new Set([...declaredExclude, ...managedExclude])]
  const parentOwnerId = raw.parentOwnerId === undefined
    ? undefined
    : identifier(raw.parentOwnerId, `owner(${id}).parentOwnerId`)
  return {
    id,
    name: text(raw.name ?? id, `owner(${id}).name`),
    description: text(raw.description ?? raw.name ?? id, `owner(${id}).description`),
    scope,
    exclude,
    declaredExclude,
    managedExclude,
    ...(parentOwnerId === undefined ? {} : { parentOwnerId }),
  }
}

function escapeRegex(value) {
  return value.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&')
}

const OTHER_SYMBOL = Symbol('非字面路径字符')
const AUTOMATA_STATE_LIMIT = 20000

function globSegments(pattern) {
  const normalized = normalizeRelativePath(pattern)
  const result = []
  for (const segment of normalized.split('/')) {
    if (segment === '**' && result.at(-1) === '**') continue
    result.push(segment)
  }
  return result
}

function segmentRegex(pattern) {
  let result = ''
  for (const character of pattern) {
    if (character === '*') {
      result += '[^/]*'
    } else if (character === '?') {
      result += '[^/]'
    } else {
      result += escapeRegex(character)
    }
  }
  return new RegExp(`^${result}$`, 'u')
}

export function scopeMatches(pattern, filePath) {
  const path = normalizeRelativePath(filePath)
  const patterns = globSegments(pattern)
  const files = path.split('/')
  const matchers = patterns.map(item => item === '**' ? undefined : segmentRegex(item))
  const visited = new Map()

  function visit(patternIndex, fileIndex) {
    const key = `${patternIndex}:${fileIndex}`
    if (visited.has(key)) return visited.get(key)
    let result
    if (patternIndex === patterns.length) {
      result = fileIndex === files.length
    } else if (patterns[patternIndex] === '**') {
      if (patternIndex === patterns.length - 1) {
        result = fileIndex < files.length
      } else {
        result = visit(patternIndex + 1, fileIndex)
          || (fileIndex < files.length && visit(patternIndex, fileIndex + 1))
      }
    } else {
      result = fileIndex < files.length
        && matchers[patternIndex].test(files[fileIndex])
        && visit(patternIndex + 1, fileIndex + 1)
    }
    visited.set(key, result)
    return result
  }

  return visit(0, 0)
}

export function ownerAllows(owner, filePath) {
  const path = normalizeRelativePath(filePath)
  const included = owner.scope.some(pattern => scopeMatches(pattern, path))
  if (!included) return false
  return !owner.exclude.some(pattern => scopeMatches(pattern, path))
}

function newAutomatonState(states) {
  const id = states.length
  states.push({ epsilon: [], transitions: [] })
  return id
}

function addEpsilon(states, from, to) {
  states[from].epsilon.push(to)
}

function addTransition(states, from, to, type, value) {
  states[from].transitions.push({ to, type, ...(value === undefined ? {} : { value }) })
}

function appendSegment(states, current, segment) {
  for (const character of segment) {
    if (character === '*') {
      const next = newAutomatonState(states)
      addEpsilon(states, current, next)
      addTransition(states, current, current, 'nonSlash')
      current = next
    } else if (character === '?') {
      const next = newAutomatonState(states)
      addTransition(states, current, next, 'nonSlash')
      current = next
    } else {
      const next = newAutomatonState(states)
      addTransition(states, current, next, character === '/' ? 'slash' : 'literal', character === '/' ? undefined : character)
      current = next
    }
  }
  return current
}

function appendLiteral(states, current, character) {
  const next = newAutomatonState(states)
  addTransition(states, current, next, character === '/' ? 'slash' : 'literal', character === '/' ? undefined : character)
  return next
}

function appendAnySegmentWithSeparatorRepeat(states, current) {
  const end = newAutomatonState(states)
  addEpsilon(states, current, end)
  const segment = newAutomatonState(states)
  addTransition(states, current, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  const afterSlash = newAutomatonState(states)
  addTransition(states, segment, afterSlash, 'slash')
  addEpsilon(states, afterSlash, current)
  return end
}

function appendSlashSegmentRepeat(states, current) {
  const end = newAutomatonState(states)
  addEpsilon(states, current, end)
  const segmentStart = newAutomatonState(states)
  addTransition(states, current, segmentStart, 'slash')
  const segment = newAutomatonState(states)
  addTransition(states, segmentStart, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  addEpsilon(states, segment, end)
  addEpsilon(states, segment, current)
  return end
}

function appendSlashSegmentOneOrMore(states, current) {
  const end = newAutomatonState(states)
  const segmentStart = newAutomatonState(states)
  addTransition(states, current, segmentStart, 'slash')
  const segment = newAutomatonState(states)
  addTransition(states, segmentStart, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  addEpsilon(states, segment, end)
  addEpsilon(states, segment, current)
  return end
}

function appendAnySegmentsOneOrMore(states, current) {
  const segment = newAutomatonState(states)
  addTransition(states, current, segment, 'nonSlash')
  addTransition(states, segment, segment, 'nonSlash')
  return appendSlashSegmentRepeat(states, segment)
}

function compileGlob(pattern) {
  const segments = globSegments(pattern)
  const states = []
  const start = newAutomatonState(states)
  let current = start

  if (segments.length === 1 && segments[0] === '**') {
    current = appendAnySegmentsOneOrMore(states, current)
  } else {
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === '**') {
        if (index === 0) {
          current = appendAnySegmentWithSeparatorRepeat(states, current)
        } else if (index === segments.length - 1) {
          current = appendSlashSegmentOneOrMore(states, current)
        } else {
          current = appendSlashSegmentRepeat(states, current)
        }
      } else {
        if (index > 0 && !(segments[0] === '**' && index === 1)) {
          current = appendLiteral(states, current, '/')
        }
        current = appendSegment(states, current, segment)
      }
    }
  }

  return { states, start, end: current }
}

function epsilonClosure(automaton, initial) {
  const result = new Set(initial)
  const pending = [...result]
  while (pending.length > 0) {
    const state = pending.pop()
    for (const next of automaton.states[state].epsilon) {
      if (result.has(next)) continue
      result.add(next)
      pending.push(next)
    }
  }
  return result
}

function transitionMatches(transition, symbol) {
  if (transition.type === 'any') return true
  if (transition.type === 'slash') return symbol === '/'
  if (transition.type === 'nonSlash') return symbol !== '/'
  return symbol !== OTHER_SYMBOL && symbol === transition.value
}

function move(automaton, states, symbol) {
  const result = new Set()
  for (const state of states) {
    for (const transition of automaton.states[state].transitions) {
      if (transitionMatches(transition, symbol)) result.add(transition.to)
    }
  }
  return result
}

function pathValidityAfter(validity, symbol) {
  if (validity === 3) return 3
  if (symbol === '/') return validity === 1 ? 2 : 3
  return 1
}

function alphabetFor(patterns) {
  const literals = new Set()
  for (const pattern of patterns) {
    for (const character of normalizeRelativePath(pattern)) {
      if (character !== '/' && character !== '*' && character !== '?') literals.add(character)
    }
  }
  return ['/', ...literals, OTHER_SYMBOL]
}

function subsetKey(subset) {
  return [...subset].sort((left, right) => left - right).join(',')
}

function buildDfa(pattern, alphabet) {
  const automaton = compileGlob(pattern)
  const states = []
  const byKey = new Map()
  const pending = []

  function getState(validity, subset) {
    const key = `${validity}:${subsetKey(subset)}`
    const existing = byKey.get(key)
    if (existing !== undefined) return existing
    if (states.length >= AUTOMATA_STATE_LIMIT) {
      throw new Error(`glob 自动机状态超过限制：${pattern}`)
    }
    const index = states.length
    const state = {
      validity,
      subset,
      accepting: validity === 1 && subset.has(automaton.end),
      transitions: new Map(),
    }
    states.push(state)
    byKey.set(key, index)
    pending.push(index)
    return index
  }

  const start = getState(0, epsilonClosure(automaton, [automaton.start]))
  while (pending.length > 0) {
    const index = pending.shift()
    const state = states[index]
    for (const symbol of alphabet) {
      const validity = pathValidityAfter(state.validity, symbol)
      const subset = validity === 3
        ? new Set()
        : epsilonClosure(automaton, move(automaton, state.subset, symbol))
      state.transitions.set(symbol, getState(validity, subset))
    }
  }
  return { states, start }
}

function languageHasWitness(includes, excludes) {
  const patterns = [...includes, ...excludes]
  const alphabet = alphabetFor(patterns)
  const includeDfas = includes.map(pattern => buildDfa(pattern, alphabet))
  const excludeDfas = excludes.map(pattern => buildDfa(pattern, alphabet))
  const start = [
    ...includeDfas.map(dfa => dfa.start),
    ...excludeDfas.map(dfa => dfa.start),
  ]
  const pending = [start]
  const visited = new Set([start.join(',')])
  while (pending.length > 0) {
    const state = pending.shift()
    const includeAccepted = includeDfas.every((dfa, index) => dfa.states[state[index]].accepting)
    const excludeAccepted = excludeDfas.some((dfa, index) => dfa.states[state[includeDfas.length + index]].accepting)
    if (includeAccepted && !excludeAccepted) return true
    for (const symbol of alphabet) {
      const next = [
        ...includeDfas.map((dfa, index) => dfa.states[state[index]].transitions.get(symbol)),
        ...excludeDfas.map((dfa, index) => dfa.states[state[includeDfas.length + index]].transitions.get(symbol)),
      ]
      const key = next.join(',')
      if (visited.has(key)) continue
      if (visited.size >= AUTOMATA_STATE_LIMIT) {
        throw new Error('glob 求交自动机状态超过限制')
      }
      visited.add(key)
      pending.push(next)
    }
  }
  return false
}

/** 判断一个 glob 的全部可匹配路径是否都被另一组 glob 覆盖。 */
export function scopePatternCoveredBy(pattern, coveringPatterns) {
  if (typeof pattern !== 'string' || !Array.isArray(coveringPatterns)) return false
  return !languageHasWitness([pattern], coveringPatterns)
}

export function ownersMayOverlap(left, right) {
  try {
    if (!Array.isArray(left?.scope) || !Array.isArray(right?.scope)
      || !Array.isArray(left?.exclude) || !Array.isArray(right?.exclude)) return true
    for (const includeLeft of left.scope) {
      for (const includeRight of right.scope) {
        if (languageHasWitness(
          [includeLeft, includeRight],
          [...left.exclude, ...right.exclude],
        )) return true
      }
    }
    return false
  } catch {
    return true
  }
}

export function assertOwnerScopesDisjoint(owners) {
  for (let leftIndex = 0; leftIndex < owners.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < owners.length; rightIndex += 1) {
      const left = owners[leftIndex]
      const right = owners[rightIndex]
      if (ownersMayOverlap(left, right)) {
        throw new Error(`Owner scope 重叠：${left.id} 与 ${right.id}，必须拆分或设置 exclude`)
      }
    }
  }
}

function assertNoCycle(stages) {
  const byId = new Map(stages.map(stage => [stage.id, stage]))
  const visiting = new Set()
  const visited = new Set()
  const visit = id => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`DAG 存在环：${id}`)
    visiting.add(id)
    for (const dependency of byId.get(id).dependsOn) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const stage of stages) visit(stage.id)
}

export function normalizePlan(raw) {
  if (raw === null || typeof raw !== 'object') throw new Error('规划子代理返回的计划必须是对象')
  const ownersRaw = raw.owners
  const stagesRaw = raw.stages
  if (!Array.isArray(ownersRaw) || ownersRaw.length === 0) throw new Error('计划必须至少包含一个 Owner')
  if (!Array.isArray(stagesRaw) || stagesRaw.length === 0) throw new Error('计划必须至少包含一个阶段')

  const owners = ownersRaw.map(rawOwner => {
    const owner = normalizeOwner(rawOwner)
    return {
      id: owner.id,
      name: owner.name,
      description: owner.description,
      scope: owner.scope,
      exclude: stringList(rawOwner.exclude, `owner(${owner.id}).exclude`),
      ...(owner.parentOwnerId === undefined ? {} : { parentOwnerId: owner.parentOwnerId }),
    }
  })
  const ownerIds = new Set()
  for (const owner of owners) {
    if (ownerIds.has(owner.id)) throw new Error(`Owner 编号重复：${owner.id}`)
    ownerIds.add(owner.id)
  }
  assertOwnerScopesDisjoint(owners)

  const stageIds = new Set()
  const stages = stagesRaw.map((rawStage, stageIndex) => {
    if (rawStage === null || typeof rawStage !== 'object') throw new Error(`stages[${stageIndex}] 必须是对象`)
    const id = identifier(rawStage.id ?? `stage-${stageIndex + 1}`, `stages[${stageIndex}].id`, STAGE_ID)
    if (stageIds.has(id)) throw new Error(`阶段编号重复：${id}`)
    stageIds.add(id)
    const dependsOn = stringList(rawStage.dependsOn, `stage(${id}).dependsOn`)
    const tasksRaw = rawStage.tasks
    if (!Array.isArray(tasksRaw) || tasksRaw.length === 0) throw new Error(`阶段 ${id} 必须至少包含一个任务`)
    const tasks = tasksRaw.map((rawTask, taskIndex) => {
      if (rawTask === null || typeof rawTask !== 'object') throw new Error(`任务 ${id}/${taskIndex} 必须是对象`)
      const taskId = identifier(rawTask.id ?? `${id}-task-${taskIndex + 1}`, `task(${id}/${taskIndex}).id`, STAGE_ID)
      const ownerId = identifier(rawTask.ownerId, `task(${taskId}).ownerId`)
      if (!ownerIds.has(ownerId)) throw new Error(`任务 ${taskId} 引用了不存在的 Owner：${ownerId}`)
      const files = stringList(rawTask.files, `task(${taskId}).files`)
      const owner = owners.find(item => item.id === ownerId)
      for (const file of files) {
        if (!ownerAllows(owner, file)) throw new Error(`任务 ${taskId} 的文件 ${file} 不在 Owner ${ownerId} scope 内`)
      }
      return {
        id: taskId,
        ownerId,
        title: text(rawTask.title ?? taskId, `task(${taskId}).title`),
        description: text(rawTask.description ?? rawTask.title ?? taskId, `task(${taskId}).description`),
        acceptance: stringList(rawTask.acceptance, `task(${taskId}).acceptance`),
        files,
      }
    })
    return { id, name: text(rawStage.name ?? id, `stage(${id}).name`), dependsOn, tasks }
  })

  const taskIds = new Set()
  for (const stage of stages) {
    for (const task of stage.tasks) {
      if (taskIds.has(task.id)) throw new Error(`任务编号重复：${task.id}`)
      taskIds.add(task.id)
    }
    for (const dependency of stage.dependsOn) {
      if (!stageIds.has(dependency)) throw new Error(`阶段 ${stage.id} 依赖不存在的阶段：${dependency}`)
    }
  }
  assertNoCycle(stages)

  return {
    contract: PLAN_CONTRACT,
    executable: false,
    summary: text(raw.summary ?? '未提供计划摘要', 'plan.summary'),
    owners,
    stages,
  }
}

function normalizeV2Owners(rawOwners) {
  if (!Array.isArray(rawOwners) || rawOwners.length === 0) {
    throw new Error('V2 计划必须至少包含一个 Owner')
  }
  const owners = rawOwners.map(normalizeOwner)
  const ownerIds = new Set()
  for (const owner of owners) {
    if (ownerIds.has(owner.id)) throw new Error(`Owner 编号重复：${owner.id}`)
    ownerIds.add(owner.id)
  }
  const children = new Map(owners.map(owner => [owner.id, []]))
  for (const owner of owners) {
    if (owner.parentOwnerId === undefined) continue
    if (!ownerIds.has(owner.parentOwnerId)) {
      throw new Error(`Owner ${owner.id} 引用了不存在的父 Owner：${owner.parentOwnerId}`)
    }
    if (owner.parentOwnerId === owner.id) throw new Error(`Owner ${owner.id} 不能把自己设为父 Owner`)
    children.get(owner.parentOwnerId).push(owner)
  }
  const visiting = new Set()
  const visited = new Set()
  const visit = owner => {
    if (visited.has(owner.id)) return
    if (visiting.has(owner.id)) throw new Error(`Owner 层级存在环：${owner.id}`)
    visiting.add(owner.id)
    for (const child of children.get(owner.id)) visit(child)
    visiting.delete(owner.id)
    visited.add(owner.id)
  }
  for (const owner of owners) visit(owner)
  for (const owner of owners) {
    Object.assign(owner, normalizeOwner({
      ...owner,
      managedExclude: children.get(owner.id).flatMap(child => child.scope),
    }))
  }
  const memoryOwner = { id: 'owner-memory-runtime', scope: [`${MEMORY_DIRECTORY}/**`], exclude: [] }
  for (const owner of owners) {
    if (ownersMayOverlap(owner, memoryOwner)) {
      throw new Error(`Owner ${owner.id} 的 scope 不能覆盖运行时管理的 ${MEMORY_DIRECTORY}`)
    }
  }
  assertOwnerScopesDisjoint(owners)
  return owners
}

function identifierList(value, field, pattern = TASK_ID, { allowEmpty = true } = {}) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是字符串数组`)
  const result = value.map((item, index) => identifier(item, `${field}[${index}]`, pattern))
  if (!allowEmpty && result.length === 0) throw new Error(`${field} 不能为空`)
  return [...new Set(result)]
}

function normalizeVerifications(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('V2 计划必须至少包含一个验证')
  const ids = new Set()
  return raw.map((verification, index) => {
    if (verification === null || typeof verification !== 'object') {
      throw new Error(`verifications[${index}] 必须是对象`)
    }
    const id = identifier(verification.id, `verifications[${index}].id`)
    if (ids.has(id)) throw new Error(`验证编号重复：${id}`)
    ids.add(id)
    if (!Array.isArray(verification.run) || verification.run.length === 0) {
      throw new Error(`验证 ${id} 的 argv 必须是非空字符串数组`)
    }
    const cwd = verification.cwd === undefined
      ? undefined
      : normalizeVerificationCwd(verification.cwd, `verification(${id}).cwd`)
    return {
      id,
      run: verification.run.map((argument, argumentIndex) => text(argument, `verification(${id}).run[${argumentIndex}]`)),
      ...(cwd === undefined ? {} : { cwd }),
    }
  })
}

function assertTaskDag(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const visiting = new Set()
  const visited = new Set()
  const visit = id => {
    if (visited.has(id)) return
    if (visiting.has(id)) throw new Error(`任务 DAG 存在环：${id}`)
    visiting.add(id)
    for (const dependency of byId.get(id).dependsOn) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const task of tasks) visit(task.id)
}

function assertCompositeTaskMetadata(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]))
  const compositeParentByChild = new Map()
  for (const task of tasks) {
    const hasChildren = task.children !== undefined
    const hasEntry = task.entry !== undefined
    const hasExit = task.exit !== undefined
    if (hasEntry || hasExit) {
      if (!hasChildren) throw new Error(`任务 ${task.id} 的 entry/exit 必须绑定 children`)
    }
    if (hasChildren) {
      if (task.role !== 'work') throw new Error(`只有 work 任务可以展开 Composite：${task.id}`)
      if (!Array.isArray(task.children) || task.children.length === 0) {
        throw new Error(`Composite 父任务 ${task.id} 必须包含 children`)
      }
      if (!Array.isArray(task.entry) || task.entry.length === 0
        || !Array.isArray(task.exit) || task.exit.length === 0) {
        throw new Error(`Composite 父任务 ${task.id} 必须完整声明 entry 和 exit`)
      }
      const children = new Set(task.children)
      if (children.size !== task.children.length) throw new Error(`Composite 父任务 ${task.id} 的 children 不能重复`)
      for (const childId of children) {
        const child = byId.get(childId)
        if (child === undefined) throw new Error(`Composite 父任务 ${task.id} 引用了不存在的 child：${childId}`)
        const previousParent = compositeParentByChild.get(childId)
        if (previousParent !== undefined && previousParent !== task.id) {
          throw new Error(`Composite child ${childId} 不能同时属于多个父任务`)
        }
        compositeParentByChild.set(childId, task.id)
        if (child.parentTaskId !== task.id) throw new Error(`child ${childId} 没有绑定 Composite 父任务 ${task.id}`)
        for (const dependency of child.dependsOn) {
          if (!children.has(dependency)) {
            throw new Error(`Composite child ${childId} 只能依赖同一父任务内部节点`)
          }
        }
      }
      const entry = new Set(task.entry)
      const exit = new Set(task.exit)
      if (entry.size !== task.entry.length || exit.size !== task.exit.length) {
        throw new Error(`Composite 父任务 ${task.id} 的 entry/exit 不能重复`)
      }
      for (const childId of [...entry, ...exit]) {
        if (!children.has(childId)) throw new Error(`Composite 父任务 ${task.id} 的 entry/exit 必须属于 children`)
      }
      const outgoing = new Map([...children].map(childId => [childId, []]))
      for (const childId of children) {
        const child = byId.get(childId)
        for (const dependency of child.dependsOn) outgoing.get(dependency).push(childId)
      }
      for (const childId of entry) {
        if (byId.get(childId).dependsOn.length > 0) {
          throw new Error(`Composite entry ${childId} 不能依赖父任务外部或内部节点`)
        }
      }
      for (const childId of exit) {
        if (outgoing.get(childId).length > 0) throw new Error(`Composite exit ${childId} 仍有内部后继`)
      }
      const reachable = new Set(entry)
      const forward = [...entry]
      while (forward.length > 0) {
        const current = forward.shift()
        for (const next of outgoing.get(current)) {
          if (reachable.has(next)) continue
          reachable.add(next)
          forward.push(next)
        }
      }
      const reverse = new Map([...children].map(childId => [childId, []]))
      for (const childId of children) {
        for (const dependency of byId.get(childId).dependsOn) reverse.get(childId).push(dependency)
      }
      const canReachExit = new Set(exit)
      const backward = [...exit]
      while (backward.length > 0) {
        const current = backward.shift()
        for (const dependency of reverse.get(current)) {
          if (canReachExit.has(dependency)) continue
          canReachExit.add(dependency)
          backward.push(dependency)
        }
      }
      if ([...children].some(childId => !reachable.has(childId) || !canReachExit.has(childId))) {
        throw new Error(`Composite 父任务 ${task.id} 的 children 必须从 entry 到 exit 完整可达`)
      }
    }
    if (task.parentTaskId !== undefined) {
      const parent = byId.get(task.parentTaskId)
      if (parent === undefined) throw new Error(`任务 ${task.id} 引用了不存在的 Composite 父任务：${task.parentTaskId}`)
      if (!Array.isArray(parent.children) || !parent.children.includes(task.id)) {
        throw new Error(`任务 ${task.id} 的 Composite 父任务声明不一致`)
      }
      if (task.children !== undefined) throw new Error(`Composite child ${task.id} 不能再次声明子图`)
    }
  }
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      const parentId = compositeParentByChild.get(dependency)
      if (parentId !== undefined && task.parentTaskId !== parentId) {
        throw new Error(`Composite 外部任务 ${task.id} 不能直接依赖 child ${dependency}，必须依赖父任务 ${parentId}`)
      }
    }
  }
}

function assertTaskWriteScope(taskId, owner, write) {
  for (const pattern of write) {
    if (languageHasWitness([pattern], owner.scope)) {
      throw new Error(`任务 ${taskId} 的 write 范围 ${pattern} 不属于 Owner ${owner.id} scope`)
    }
    if (owner.exclude.some(exclude => languageHasWitness([pattern, exclude], []))) {
      throw new Error(`任务 ${taskId} 的 write 范围 ${pattern} 与 Owner ${owner.id} exclude 相交`)
    }
  }
}

export function normalizePlanV2(raw) {
  if (raw === null || typeof raw !== 'object') throw new Error('V2 计划必须是对象')
  if (raw.contract !== PLAN_V2_CONTRACT) throw new Error('计划契约必须是 DSH_PLAN_V2')
  if (Object.hasOwn(raw, 'stages')) {
    throw new Error('DSH_PLAN_V2 禁止携带 legacy stages；请使用 tasks/dependsOn')
  }
  if (Object.hasOwn(raw, 'completedStages')) {
    throw new Error('DSH_PLAN_V2 禁止携带 completedStages；请使用 task 状态')
  }
  const registryDigest = text(raw.registryDigest, 'plan.registryDigest')
  if (!SHA256_DIGEST.test(registryDigest)) throw new Error('plan.registryDigest 必须是 SHA-256 摘要')
  const owners = normalizeV2Owners(raw.owners)
  const ownersById = new Map(owners.map(owner => [owner.id, owner]))
  const verifications = normalizeVerifications(raw.verifications)
  const verificationIds = new Set(verifications.map(verification => verification.id))
  if (!Array.isArray(raw.tasks) || raw.tasks.length === 0) throw new Error('V2 计划必须至少包含一个任务')
  const taskIds = new Set()
  const tasks = raw.tasks.map((rawTask, index) => {
    if (rawTask === null || typeof rawTask !== 'object') throw new Error(`tasks[${index}] 必须是对象`)
    const id = identifier(rawTask.id, `tasks[${index}].id`, TASK_ID)
    if (taskIds.has(id)) throw new Error(`任务编号重复：${id}`)
    taskIds.add(id)
    const role = text(rawTask.role, `task(${id}).role`)
    if (!['work', 'review', 'verify'].includes(role)) throw new Error(`任务 ${id} 的角色不受支持：${role}`)
    const ownerId = identifier(rawTask.ownerId, `task(${id}).ownerId`)
    const owner = ownersById.get(ownerId)
    if (owner === undefined) throw new Error(`任务 ${id} 引用了不存在的 Owner：${ownerId}`)
    const write = stringList(rawTask.write, `task(${id}).write`)
    if (role !== 'work' && write.length > 0) {
      throw new Error(`任务 ${id} 的 ${role} 角色必须将 write 设为空数组`)
    }
    assertTaskWriteScope(id, owner, write)
    const verify = identifierList(rawTask.verify, `task(${id}).verify`, OWNER_ID, {
      allowEmpty: role !== 'work',
    })
    for (const verificationId of verify) {
      if (!verificationIds.has(verificationId)) throw new Error(`任务 ${id} 绑定了不存在的验证：${verificationId}`)
    }
    const parentTaskId = rawTask.parentTaskId === undefined
      ? undefined
      : identifier(rawTask.parentTaskId, `task(${id}).parentTaskId`, TASK_ID)
    const children = rawTask.children === undefined
      ? undefined
      : identifierList(rawTask.children, `task(${id}).children`, TASK_ID, { allowEmpty: false })
    const entry = rawTask.entry === undefined
      ? undefined
      : identifierList(rawTask.entry, `task(${id}).entry`, TASK_ID, { allowEmpty: false })
    const exit = rawTask.exit === undefined
      ? undefined
      : identifierList(rawTask.exit, `task(${id}).exit`, TASK_ID, { allowEmpty: false })
    return {
      id,
      role,
      ownerId,
      title: text(rawTask.title ?? id, `task(${id}).title`),
      dependsOn: identifierList(rawTask.dependsOn, `task(${id}).dependsOn`),
      write,
      verify,
      done: textList(rawTask.done, `task(${id}).done`, { allowEmpty: false }),
      priority: normalizeTaskPriority(rawTask.priority, `task(${id}).priority`),
      onFailure: normalizeTaskPolicy(rawTask.onFailure, `task(${id}).onFailure`),
      onBlocked: normalizeTaskPolicy(rawTask.onBlocked, `task(${id}).onBlocked`, { allowRepair: false }),
      onTimeout: normalizeTaskPolicy(rawTask.onTimeout, `task(${id}).onTimeout`, { allowRepair: false, timeout: true }),
      ...(parentTaskId === undefined ? {} : { parentTaskId }),
      ...(children === undefined ? {} : { children }),
      ...(entry === undefined ? {} : { entry }),
      ...(exit === undefined ? {} : { exit }),
    }
  })
  for (const task of tasks) {
    for (const dependency of task.dependsOn) {
      if (!taskIds.has(dependency)) throw new Error(`任务 ${task.id} 依赖不存在的任务：${dependency}`)
    }
  }
  assertTaskDag(tasks)
  assertCompositeTaskMetadata(tasks)
  return {
    contract: PLAN_V2_CONTRACT,
    executable: true,
    registryDigest: registryDigest.toLowerCase(),
    summary: text(raw.summary, 'plan.summary'),
    owners,
    verifications,
    tasks,
  }
}

function taskExecutionRecord(plan, taskId) {
  const candidates = [plan.taskStates, plan.taskState, plan.state?.tasks]
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      const found = candidate.find(item => item?.taskId === taskId || item?.id === taskId)
      if (found !== undefined) return found
    } else if (candidate !== null && typeof candidate === 'object') {
      const found = candidate[taskId]
      if (found !== undefined) return found
    }
  }
  return undefined
}

function hasBusinessCommit(record) {
  if (record === null || typeof record !== 'object') return false
  for (const field of ['commitSha', 'fixedCommit', 'fixedCommitSha', 'businessCommit', 'businessCommitSha', 'commit']) {
    if (typeof record[field] === 'string' && record[field].trim() !== '') return true
  }
  return typeof record.result?.commitSha === 'string' && record.result.commitSha.trim() !== ''
}

function assertCompositeParentExpandable(plan, parent) {
  if (parent.role !== 'work') throw new Error(`只有未开始的 V2 work task 可以展开 Composite：${parent.id}`)
  if (parent.children !== undefined) throw new Error(`任务 ${parent.id} 已经展开过 Composite`)
  const rawParent = Array.isArray(plan.tasks)
    ? plan.tasks.find(task => task?.id === parent.id)
    : undefined
  if (rawParent?.status !== undefined && rawParent.status !== 'pending') {
    throw new Error(`Composite 父任务 ${parent.id} 必须在未开始状态，当前为 ${rawParent.status}`)
  }
  if (hasBusinessCommit(rawParent)) throw new Error(`Composite 父任务 ${parent.id} 已有业务提交，不能展开`)
  const execution = taskExecutionRecord(plan, parent.id)
  if (execution?.status !== undefined && execution.status !== 'pending') {
    throw new Error(`Composite 父任务 ${parent.id} 必须在未开始状态，当前为 ${execution.status}`)
  }
  if (hasBusinessCommit(execution)) throw new Error(`Composite 父任务 ${parent.id} 已有业务提交，不能展开`)
}

export function expandCompositeTask(plan, parentTaskId, proposal) {
  if (plan?.contract !== PLAN_V2_CONTRACT) throw new Error('Composite 只支持 DSH_PLAN_V2 计划')
  const normalized = normalizePlanV2(plan)
  const id = identifier(parentTaskId, 'parentTaskId', TASK_ID)
  const parent = normalized.tasks.find(task => task.id === id)
  if (parent === undefined) throw new Error(`找不到 Composite 父任务：${id}`)
  assertCompositeParentExpandable(plan, parent)
  if (proposal === null || typeof proposal !== 'object' || Array.isArray(proposal)) {
    throw new Error('Composite proposal 必须是对象')
  }
  if (proposal.registryOperation !== undefined || proposal.owners !== undefined || proposal.registryDigest !== undefined) {
    throw new Error('Composite 不能绕过 Owner Registry 提案审批')
  }
  if (!Array.isArray(proposal.children) || proposal.children.length === 0) {
    throw new Error('Composite proposal 必须包含非空 children')
  }
  const existing = new Set(normalized.tasks.map(task => task.id))
  const childIds = proposal.children.map((child, index) => identifier(child?.id, `children[${index}].id`, TASK_ID))
  for (const childId of childIds) {
    if (existing.has(childId)) throw new Error(`Composite child ID 冲突：${childId}`)
  }
  if (new Set(childIds).size !== childIds.length) throw new Error('Composite children 不能包含重复 ID')
  const entry = identifierList(proposal.entry, 'Composite.entry', TASK_ID, { allowEmpty: false })
  const exit = identifierList(proposal.exit, 'Composite.exit', TASK_ID, { allowEmpty: false })
  const children = proposal.children.map((child, index) => {
    if (child?.parentTaskId !== undefined && child.parentTaskId !== id) {
      throw new Error(`Composite child ${childIds[index]} 的父任务声明不一致`)
    }
    return { ...child, parentTaskId: id }
  })
  const expandedParent = {
    ...parent,
    children: [...childIds],
    entry: [...entry],
    exit: [...exit],
  }
  const expandedTasks = []
  for (const task of normalized.tasks) {
    expandedTasks.push(task.id === id ? expandedParent : task)
    if (task.id === id) expandedTasks.push(...children)
  }
  return normalizePlanV2({
    ...normalized,
    tasks: expandedTasks,
  })
}

function deltaTaskIds(value, field) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error(`${field} 必须是任务 ID 数组`)
  return value.map((item, index) => identifier(
    typeof item === 'string' ? item : item?.taskId ?? item?.id,
    `${field}[${index}]`,
    TASK_ID,
  ))
}

function taskRecordEntries(tasks) {
  if (Array.isArray(tasks)) return tasks.map((record, index) => [record?.taskId ?? record?.id, record, index])
  if (tasks !== null && typeof tasks === 'object') return Object.entries(tasks).map(([id, record]) => [record?.taskId ?? id, record, id])
  throw new Error('工作流状态必须包含数组或对象形式的任务状态')
}

function fixedCommitForTask(state, taskId) {
  const records = taskRecordEntries(state.tasks).filter(([id]) => id === taskId).map(([, record]) => record)
  records.push(...Object.values(state.ownerRuns ?? {}).filter(record => record?.taskId === taskId || record?.stageId === taskId))
  return records.some(hasBusinessCommit)
}

function ownerRegistryIdentity(owner) {
  return JSON.stringify({
    id: owner.id,
    name: owner.name,
    description: owner.description,
    scope: owner.scope,
    exclude: owner.exclude,
    ...(owner.parentOwnerId === undefined ? {} : { parentOwnerId: owner.parentOwnerId }),
  })
}

function assertDeltaRegistryBoundary(oldPlan, nextPlan) {
  if (oldPlan.registryDigest !== nextPlan.registryDigest) {
    throw new Error('局部 plan delta 不能改变 Owner Registry digest')
  }
  const oldOwners = new Map(oldPlan.owners.map(owner => [owner.id, owner]))
  if (oldOwners.size !== nextPlan.owners.length) {
    throw new Error('局部 plan delta 不能增删 Owner；请先走 Registry 提案审批')
  }
  for (const owner of nextPlan.owners) {
    const previous = oldOwners.get(owner.id)
    if (previous === undefined || ownerRegistryIdentity(previous) !== ownerRegistryIdentity(owner)) {
      throw new Error(`局部 plan delta 不能改变 Owner ${owner.id} 的 Registry 定义或 scope`)
    }
  }
}

function taskSemantic(task) {
  if (task === undefined) return undefined
  return JSON.stringify({
    id: task.id,
    role: task.role,
    ownerId: task.ownerId,
    title: task.title,
    dependsOn: task.dependsOn,
    write: task.write,
    verify: task.verify,
    done: task.done,
    parentTaskId: task.parentTaskId,
    children: task.children,
    entry: task.entry,
    exit: task.exit,
  })
}

function dependencyClosure(plans, seeds) {
  const reverse = new Map()
  const ensure = id => {
    if (!reverse.has(id)) reverse.set(id, new Set())
    return reverse.get(id)
  }
  for (const plan of plans) {
    for (const task of plan.tasks) {
      ensure(task.id)
      for (const dependency of task.dependsOn) {
        ensure(dependency).add(task.id)
      }
      if (task.children !== undefined) {
        for (const childId of task.children) ensure(task.id).add(childId)
        for (const exitId of task.exit) ensure(exitId).add(task.id)
      }
    }
  }
  const result = new Set(seeds)
  const queue = [...result]
  while (queue.length > 0) {
    const current = queue.shift()
    for (const successor of reverse.get(current) ?? []) {
      if (result.has(successor)) continue
      result.add(successor)
      queue.push(successor)
    }
  }
  return result
}

function resetTaskRecord(record) {
  const next = {
    ...(record ?? {}),
    status: 'pending',
    executorId: null,
    executor: null,
    cursor: null,
    unchangedPolls: 0,
    reason: null,
    action: null,
    verificationResults: {},
  }
  for (const field of [
    'review', 'reviewDigest', 'reviewedAt', 'reviewEvidence', 'completionEvidence', 'completedEvidence',
    'completion', 'evidence', 'fixedCommit', 'fixedCommitSha', 'commitSha', 'businessCommit',
    'businessCommitSha', 'commit', 'result', 'completedAt', 'finishedAt',
  ]) delete next[field]
  return next
}

function planDigestV2(plan) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}

export function applyPlanDelta(state, delta) {
  if (state === null || typeof state !== 'object') throw new Error('工作流状态必须是对象')
  if (state.plan?.contract !== PLAN_V2_CONTRACT) throw new Error('Plan delta 只接受 DSH_PLAN_V2')
  if (delta !== null && typeof delta !== 'object') throw new Error('Plan delta 必须是对象')
  if (delta?.contract !== undefined && delta.contract !== PLAN_V2_CONTRACT) {
    throw new Error('Plan delta 只接受 DSH_PLAN_V2')
  }
  const oldPlan = normalizePlanV2(state.plan)
  const nextPlan = normalizePlanV2(delta?.plan ?? oldPlan)
  assertDeltaRegistryBoundary(oldPlan, nextPlan)
  const oldById = new Map(oldPlan.tasks.map(task => [task.id, task]))
  const nextById = new Map(nextPlan.tasks.map(task => [task.id, task]))
  const entries = taskRecordEntries(state.tasks)
  const records = new Map(entries.map(([id, record]) => [id, record]))
  const carryForward = new Set(deltaTaskIds(delta?.carryForward, 'carryForward'))
  const explicitInvalidate = new Set(deltaTaskIds(delta?.invalidate, 'invalidate'))
  for (const taskId of [...carryForward, ...explicitInvalidate]) {
    if (!oldById.has(taskId) && !nextById.has(taskId)) throw new Error(`Plan delta 引用了不存在的任务：${taskId}`)
  }
  for (const taskId of carryForward) {
    if (explicitInvalidate.has(taskId)) throw new Error(`任务 ${taskId} 不能同时 carryForward 和 invalidate`)
    if (records.get(taskId)?.status !== 'completed') throw new Error(`carryForward 只能用于已 completed 任务：${taskId}`)
  }
  const changed = new Set()
  for (const taskId of oldById.keys()) {
    if (taskSemantic(oldById.get(taskId)) !== taskSemantic(nextById.get(taskId))) changed.add(taskId)
  }
  const affected = dependencyClosure([oldPlan, nextPlan], new Set([...explicitInvalidate, ...changed]))
  for (const taskId of changed) {
    if (records.get(taskId)?.status === 'completed') {
      throw new Error(`已 completed 任务 ${taskId} 的计划语义不能修改`)
    }
    if (!explicitInvalidate.has(taskId)) throw new Error(`任务 ${taskId} 的计划语义变化必须明确 invalidate`)
  }
  for (const [taskId, record] of records) {
    if (record?.status !== 'completed') continue
    if (!nextById.has(taskId)) throw new Error(`已 completed 任务 ${taskId} 不能从新计划删除`)
    if (affected.has(taskId)) throw new Error(`已 completed 任务 ${taskId} 不能被 invalidate 或重置`)
    if (!affected.has(taskId) && !carryForward.has(taskId)) {
      throw new Error(`已 completed 任务 ${taskId} 必须明确 carryForward`)
    }
  }
  for (const taskId of affected) {
    if (fixedCommitForTask(state, taskId)) {
      throw new Error(`任务 ${taskId} 已有固定业务提交，不能被局部 delta invalidate`)
    }
  }
  const next = structuredClone(state)
  const nextRecords = nextPlan.tasks.map(task => {
    const previous = records.get(task.id)
    if (previous === undefined) return { taskId: task.id, status: 'pending', executorId: null, verificationResults: {} }
    return affected.has(task.id) ? resetTaskRecord(previous) : structuredClone(previous)
  })
  if (Array.isArray(state.tasks)) next.tasks = nextRecords
  else next.tasks = Object.fromEntries(nextRecords.map(record => [record.taskId, record]))
  for (const field of ['ownerRuns', 'supervisorOutbox']) {
    if (next[field] === undefined) continue
    next[field] = Object.fromEntries(Object.entries(next[field]).filter(([key, record]) => {
      const taskId = record?.taskId ?? record?.stageId ?? key.split(':')[0]
      return !affected.has(taskId)
    }))
  }
  next.plan = nextPlan
  next.planDigest = planDigestV2(nextPlan)
  next.revision = Number.isSafeInteger(state.revision) ? state.revision + 1 : 1
  next.planRevision = Number.isSafeInteger(state.planRevision) ? state.planRevision + 1 : 1
  next.planReview = undefined
  next.planReviewDigest = undefined
  next.planReviewedAt = undefined
  next.planApproved = false
  next.planApprovedAt = undefined
  next.planApprovedBy = undefined
  next.implementationReview = undefined
  next.implementationReviewHead = undefined
  return next
}

export function plannerResultV2(raw) {
  if (raw?.contract !== PLAN_V2_CONTRACT) {
    throw new Error(`V2 规划结果契约不受支持：${String(raw?.contract)}`)
  }
  return normalizePlanV2(raw)
}

function normalizeTaskState(raw, field) {
  if (raw === null || typeof raw !== 'object') throw new Error(`${field} 必须是对象`)
  const status = text(raw.status, `${field}.status`)
  if (!TASK_STATUSES.includes(status)) throw new Error(`${field}.status 不受支持：${status}`)
  if (status !== 'stopped') return { status, reason: null, action: null }
  const reason = text(raw.reason, `${field}.reason`)
  const action = text(raw.action, `${field}.action`)
  if (STOP_REASON_ACTIONS[reason] !== action) throw new Error(`${field}.reason/action 配对不受支持`)
  return { status, reason, action }
}

export function taskLifecycleTransition(task, event) {
  const current = normalizeTaskState(task, 'task')
  if (event === null || typeof event !== 'object') throw new Error('任务生命周期事件必须是对象')
  const type = text(event.type, 'event.type')
  if (type === 'start' && current.status === 'pending') {
    return { status: 'running', reason: null, action: null }
  }
  if (type === 'complete' && current.status === 'running') {
    return { status: 'completed', reason: null, action: null }
  }
  if (type === 'stop' && ['pending', 'running'].includes(current.status)) {
    const reason = text(event.reason, 'event.reason')
    const action = text(event.action, 'event.action')
    if (STOP_REASON_ACTIONS[reason] === action) return { status: 'stopped', reason, action }
    throw new Error('任务停止的 reason/action 配对不受支持')
  }
  throw new Error('非法任务生命周期迁移')
}

export function nextReadyTaskIds(plan, tasks) {
  if (plan?.contract !== PLAN_V2_CONTRACT || !Array.isArray(plan.tasks)) {
    throw new Error('仅支持 DSH_PLAN_V2 计划的任务调度')
  }
  if (!Array.isArray(tasks)) throw new Error('任务状态必须是数组')
  const planTaskIds = new Set(plan.tasks.map(task => task.id))
  const states = new Map()
  for (const [index, task] of tasks.entries()) {
    const id = identifier(task?.id, `tasks[${index}].id`, TASK_ID)
    if (!planTaskIds.has(id)) throw new Error(`任务状态包含计划外任务：${id}`)
    if (states.has(id)) throw new Error(`任务状态重复：${id}`)
    states.set(id, normalizeTaskState(task, `tasks[${index}]`))
  }
  for (const id of planTaskIds) {
    if (!states.has(id)) throw new Error(`任务状态缺失：${id}`)
  }
  return plan.tasks
    .filter(task => states.get(task.id).status === 'pending')
    .filter(task => task.dependsOn.every(dependency => states.get(dependency).status === 'completed'))
    .map(task => task.id)
}

export function assertPlanOwnerScopes(plan) {
  assertOwnerScopesDisjoint(plan.owners)
  return plan
}

export function relativePath(root, target) {
  const value = relative(root, target).replaceAll(sep, '/')
  return value === '' ? '.' : value
}

export function sanitizeSegment(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9_-]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 60) || 'item'
}

export function plannerResult(raw) {
  if (raw?.contract !== PLAN_CONTRACT) {
    throw new Error(`规划结果契约不受支持：${String(raw?.contract)}`)
  }
  return normalizePlan(raw)
}

export function ownerResult(raw, fallbackSummary, context) {
  if (raw?.contract !== OWNER_RESULT_CONTRACT) {
    throw new Error(`Owner 结果契约不受支持：${String(raw?.contract)}`)
  }
  const status = raw?.status
  if (!['completed', 'failed', 'blocked', 'needs_repair'].includes(status)) {
    throw new Error(`Owner 结果状态不受支持：${String(status)}`)
  }
  const changes = Array.isArray(raw?.changes) ? raw.changes.map((item, index) => ({
    summary: text(item?.summary, `changes[${index}].summary`),
    files: stringList(item?.files, `changes[${index}].files`),
    tests: stringList(item?.tests, `changes[${index}].tests`),
  })) : []
  const handoffs = Array.isArray(raw?.handoffs) ? raw.handoffs.map((item, index) => {
    const targetType = text(item?.targetType, `handoffs[${index}].targetType`)
    if (!['owner', 'orchestrator', 'supervisor'].includes(targetType)) {
      throw new Error(`handoffs[${index}].targetType 不受支持：${targetType}`)
    }
    const targetOwnerId = item?.targetOwnerId === undefined
      ? undefined
      : identifier(item.targetOwnerId, `handoffs[${index}].targetOwnerId`)
    if (targetType === 'owner' && targetOwnerId === undefined) {
      throw new Error(`handoffs[${index}] 指向 owner 时必须提供 targetOwnerId`)
    }
    return {
      targetType,
      ...(targetOwnerId === undefined ? {} : { targetOwnerId }),
      summary: text(item?.summary, `handoffs[${index}].summary`),
      reason: text(item?.reason ?? item?.summary, `handoffs[${index}].reason`),
      files: stringList(item?.files, `handoffs[${index}].files`),
    }
  }) : []
  if (context !== undefined) {
    validateHandoffTargets(handoffs, context?.plan, context?.sourceOwnerId)
  }
  return {
    contract: OWNER_RESULT_CONTRACT,
    status,
    summary: text(raw?.summary, 'owner.summary'),
    changes,
    tests: stringList(raw?.tests, 'owner.tests'),
    handoffs,
    memoryUpdates: normalizeMemoryUpdates(raw?.memory_updates),
  }
}

export function validateHandoffTargets(handoffs, plan, sourceOwnerId) {
  if (!Array.isArray(handoffs)) throw new Error('handoffs 必须是数组')
  if (plan === null || typeof plan !== 'object' || !Array.isArray(plan.owners)) {
    throw new Error('验证 handoff 目标 Owner 时必须提供包含 owners 的 plan 上下文')
  }
  const owners = new Map()
  for (const rawOwner of plan.owners) {
    const owner = normalizeOwner(rawOwner)
    if (owners.has(owner.id)) throw new Error(`plan 上下文中的 Owner 编号重复：${owner.id}`)
    owners.set(owner.id, owner)
  }
  const source = sourceOwnerId === undefined
    ? undefined
    : identifier(sourceOwnerId, 'sourceOwnerId')
  if (source !== undefined && !owners.has(source)) {
    throw new Error(`handoff 来源 Owner 不存在：${source}`)
  }

  for (const [index, handoff] of handoffs.entries()) {
    if (handoff?.targetType !== 'owner') continue
    const targetOwnerId = handoff?.targetOwnerId
    if (typeof targetOwnerId !== 'string' || targetOwnerId.trim() === '') {
      throw new Error(`handoffs[${index}] 指向 owner 时必须提供 targetOwnerId`)
    }
    const target = owners.get(targetOwnerId)
    if (target === undefined) {
      throw new Error(`handoffs[${index}] 指向不存在的目标 Owner：${targetOwnerId}`)
    }
    if (source !== undefined && target.id === source) {
      throw new Error(`handoffs[${index}] 不能转交给当前 Owner：${source}`)
    }
    if (!Array.isArray(handoff.files) || handoff.files.length === 0) {
      throw new Error(`handoffs[${index}] 指向 owner 时必须提供待转交文件`)
    }
    for (const file of handoff.files) {
      if (!ownerAllows(target, file)) {
        throw new Error(`handoffs[${index}] 的文件 ${file} 不属于目标 Owner ${target.id} scope`)
      }
    }
  }
  return handoffs
}

export function planReviewResult(raw) {
  if (raw?.contract !== PLAN_REVIEW_CONTRACT) {
    throw new Error(`计划审查结果契约不受支持：${String(raw?.contract)}`)
  }
  if (!['passed', 'needs_revision'].includes(raw.status)) {
    throw new Error(`计划审查状态不受支持：${String(raw.status)}`)
  }
  return {
    contract: PLAN_REVIEW_CONTRACT,
    status: raw.status,
    summary: text(raw.summary ?? '未提供计划审查摘要', 'planReview.summary'),
    issues: normalizePlanReviewIssues(raw.issues),
  }
}

function normalizePlanReviewIssues(value) {
  if (value === undefined) return []
  if (!Array.isArray(value)) throw new Error('planReview.issues 必须是数组')
  return value.map((issue, index) => {
    if (typeof issue === 'string') return text(issue, `planReview.issues[${index}]`)
    if (issue === null || typeof issue !== 'object' || Array.isArray(issue)) {
      throw new Error(`planReview.issues[${index}] 必须是字符串或结构化问题`)
    }
    const severity = text(issue.severity ?? 'medium', `planReview.issues[${index}].severity`)
    if (!['high', 'medium', 'low'].includes(severity)) {
      throw new Error(`planReview.issues[${index}].severity 不受支持：${severity}`)
    }
    return {
      severity,
      title: text(issue.title, `planReview.issues[${index}].title`),
      detail: text(issue.detail, `planReview.issues[${index}].detail`),
      suggestion: text(issue.suggestion, `planReview.issues[${index}].suggestion`),
    }
  })
}

function implementationReviewIssues(value) {
  if (!Array.isArray(value)) throw new Error('implementationReview.issues 必须是数组')
  return value.map((issue, index) => {
    if (typeof issue === 'string') return text(issue, `implementationReview.issues[${index}]`)
    if (issue === null || typeof issue !== 'object' || Array.isArray(issue)) {
      throw new Error(`implementationReview.issues[${index}] 必须是非空字符串或结构化问题`)
    }
    const title = text(issue.title ?? issue.summary, `implementationReview.issues[${index}].title`)
    const detail = text(issue.detail ?? issue.message ?? issue.description, `implementationReview.issues[${index}].detail`)
    const severity = issue.severity === undefined ? undefined : text(issue.severity, `implementationReview.issues[${index}].severity`)
    const suggestion = issue.suggestion === undefined ? undefined : text(issue.suggestion, `implementationReview.issues[${index}].suggestion`)
    return [
      ...(severity === undefined ? [] : [`[${severity}]`]),
      `${title}：${detail}`,
      ...(suggestion === undefined ? [] : [`建议：${suggestion}`]),
    ].join(' ')
  })
}

export function implementationReviewResult(raw) {
  if (raw?.contract !== IMPLEMENTATION_REVIEW_CONTRACT) {
    throw new Error(`实现审查结果契约不受支持：${String(raw?.contract)}`)
  }
  if (!['passed', 'needs_repair'].includes(raw.status)) {
    throw new Error(`实现审查状态不受支持：${String(raw.status)}`)
  }
  return {
    contract: IMPLEMENTATION_REVIEW_CONTRACT,
    status: raw.status,
    summary: text(raw.summary ?? '未提供实现审查摘要', 'implementationReview.summary'),
    // 兼容独立 Reviewer 误沿用计划审查的结构化问题格式；持久化时统一为文本证据。
    issues: implementationReviewIssues(raw.issues),
  }
}
