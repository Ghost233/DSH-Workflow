import { createHash } from 'node:crypto'

export const PLANNING_BINDINGS_CONTRACT = 'DSH_PLANNING_BINDINGS_V1'
export const PLANNING_PACKAGE_CONTRACT = 'DSH_PLANNING_PACKAGE_V1'
export const PLANNING_PACKAGE_SET_CONTRACT = 'DSH_PLANNING_PACKAGE_SET_V1'

const REFERENCE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u
const TASK_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
const OWNER_ID = /^[a-z][a-z0-9_-]{0,63}$/u
const SHA256 = /^[a-f0-9]{64}$/u

export class PlanningPackageError extends Error {
  constructor(code, field, detail) {
    super(`Planning packages: ${code}${field === undefined ? '' : ` (${field}${detail === undefined ? '' : `: ${detail}`})`}`)
    this.name = 'PlanningPackageError'
    this.code = code
    this.field = field
  }
}

function fail(code, field, detail) { throw new PlanningPackageError(code, field, detail) }

function plain(value, field, code = 'INVALID_INPUT') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code, field, 'expected plain object')
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) fail(code, field, 'expected plain object')
  return value
}

function exact(value, keys, field, code = 'INVALID_INPUT') {
  const object = plain(value, field, code)
  const actual = Object.keys(object)
  if (actual.length !== keys.length || actual.some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(object, key))) {
    fail(code, field, 'unexpected fields')
  }
  return object
}

function text(value, field, { task = false, owner = false, digest = false, code = 'INVALID_INPUT' } = {}) {
  if (typeof value !== 'string' || value.trim() === '') fail(code, field, 'expected non-empty string')
  const result = value.trim()
  const pattern = task ? TASK_ID : owner ? OWNER_ID : digest ? SHA256 : REFERENCE_ID
  if (!pattern.test(result)) fail(code, field, 'invalid stable identifier')
  return digest ? result.toLowerCase() : result
}

function clone(value) { return JSON.parse(JSON.stringify(value)) }

function canonical(value) {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) fail('INVALID_INPUT', 'value', 'expected finite JSON value')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  fail('INVALID_INPUT', 'value', 'expected JSON value')
}

function same(left, right) { return canonical(left) === canonical(right) }
function digest(value) { return createHash('sha256').update(canonical(value)).digest('hex') }

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}

function unique(items, field, key = item => item) {
  const seen = new Set()
  for (const item of items) {
    const value = key(item)
    if (seen.has(value)) fail('DUPLICATE_BINDING', field, String(value))
    seen.add(value)
  }
}

function list(value, field, { nonempty = false, code = 'INVALID_INPUT' } = {}) {
  if (!Array.isArray(value) || (nonempty && value.length === 0)) fail(code, field, nonempty ? 'expected non-empty array' : 'expected array')
  return value
}

function normalizedTicketBinding(value, field) {
  exact(value, ['id', 'revision', 'fragments'], field, 'INVALID_BINDINGS')
  const fragments = list(value.fragments, `${field}.fragments`, { nonempty: true, code: 'INVALID_BINDINGS' })
    .map((item, index) => text(item, `${field}.fragments[${index}]`, { code: 'INVALID_BINDINGS' }))
  unique(fragments, `${field}.fragments`)
  return {
    id: text(value.id, `${field}.id`, { code: 'INVALID_BINDINGS' }),
    revision: text(value.revision, `${field}.revision`, { code: 'INVALID_BINDINGS' }),
    fragments,
  }
}

function normalizedContractBinding(value, field) {
  exact(value, ['id', 'revision'], field, 'INVALID_BINDINGS')
  return {
    id: text(value.id, `${field}.id`, { code: 'INVALID_BINDINGS' }),
    revision: text(value.revision, `${field}.revision`, { code: 'INVALID_BINDINGS' }),
  }
}

/** Validate the optional model-side V1 mapping without importing model.mjs. */
export function normalizePlanningBindings(raw) {
  if (raw === undefined) return undefined
  exact(raw, ['contract', 'snapshotId', 'sourceDigest', 'tasks'], 'planningBindings', 'INVALID_BINDINGS')
  if (raw.contract !== PLANNING_BINDINGS_CONTRACT) fail('INVALID_BINDINGS', 'planningBindings.contract')
  const tasks = list(raw.tasks, 'planningBindings.tasks', { nonempty: true, code: 'INVALID_BINDINGS' }).map((item, index) => {
    const field = `planningBindings.tasks[${index}]`
    exact(item, ['taskId', 'tickets', 'contracts'], field, 'INVALID_BINDINGS')
    const tickets = list(item.tickets, `${field}.tickets`, { nonempty: true, code: 'INVALID_BINDINGS' })
      .map((ticket, ticketIndex) => normalizedTicketBinding(ticket, `${field}.tickets[${ticketIndex}]`))
    const contracts = list(item.contracts, `${field}.contracts`, { code: 'INVALID_BINDINGS' })
      .map((contract, contractIndex) => normalizedContractBinding(contract, `${field}.contracts[${contractIndex}]`))
    unique(tickets, `${field}.tickets`, ticket => ticket.id)
    unique(contracts, `${field}.contracts`, contract => contract.id)
    return {
      taskId: text(item.taskId, `${field}.taskId`, { task: true, code: 'INVALID_BINDINGS' }),
      tickets,
      contracts,
    }
  })
  unique(tasks, 'planningBindings.tasks', task => task.taskId)
  return deepFreeze({
    contract: PLANNING_BINDINGS_CONTRACT,
    snapshotId: text(raw.snapshotId, 'planningBindings.snapshotId', { code: 'INVALID_BINDINGS' }),
    sourceDigest: text(raw.sourceDigest, 'planningBindings.sourceDigest', { digest: true, code: 'INVALID_BINDINGS' }),
    tasks,
  })
}

function snapshotReferences(snapshot) {
  plain(snapshot, 'snapshot', 'INVALID_SNAPSHOT')
  if (snapshot.contract !== 'DSH_PLANNING_CHECKPOINT_SNAPSHOT_V1') fail('INVALID_SNAPSHOT', 'snapshot.contract')
  const id = text(snapshot.id, 'snapshot.id', { code: 'INVALID_SNAPSHOT' })
  const sourceDigest = text(snapshot.sourceDigest, 'snapshot.sourceDigest', { digest: true, code: 'INVALID_SNAPSHOT' })
  const source = plain(snapshot.source, 'snapshot.source', 'INVALID_SNAPSHOT')
  if (source.contract !== 'DSH_PLANNING_SOURCE_CHAIN_V1') fail('INVALID_SNAPSHOT', 'snapshot.source.contract')
  if (digest(source) !== sourceDigest) fail('SNAPSHOT_SOURCE_MISMATCH', 'snapshot.sourceDigest')
  const references = plain(source.references, 'snapshot.source.references', 'INVALID_SNAPSHOT')
  if (references.contract !== 'DSH_PLANNING_REFERENCE_SET_V1') fail('INVALID_SNAPSHOT', 'snapshot.source.references.contract')
  if (!Array.isArray(references.tickets) || !Array.isArray(references.ready) || !Array.isArray(references.blocked)) {
    fail('INVALID_SNAPSHOT', 'snapshot.source.references')
  }
  return { id, sourceDigest, source, references }
}

function ticketMap(references) {
  const tickets = new Map()
  for (const [index, raw] of references.tickets.entries()) {
    const field = `snapshot.source.references.tickets[${index}]`
    const ticket = plain(raw, field, 'INVALID_SNAPSHOT')
    const id = text(ticket.id, `${field}.id`, { code: 'INVALID_SNAPSHOT' })
    const revision = text(ticket.revision, `${field}.revision`, { code: 'INVALID_SNAPSHOT' })
    if (tickets.has(id)) fail('INVALID_SNAPSHOT', field, 'duplicate ticket')
    if (!Array.isArray(ticket.acceptanceCriteria) || !Array.isArray(ticket.contracts)
      || !Array.isArray(ticket.dependsOn) || !plain(ticket.work, `${field}.work`, 'INVALID_SNAPSHOT')
      || !Array.isArray(ticket.work.ready) || !Array.isArray(ticket.work.blocked)) {
      fail('INVALID_SNAPSHOT', field)
    }
    const ready = new Set(ticket.work.ready.map((fragment, fragmentIndex) => {
      const value = plain(fragment, `${field}.work.ready[${fragmentIndex}]`, 'INVALID_SNAPSHOT')
      return text(value.id, `${field}.work.ready[${fragmentIndex}].id`, { code: 'INVALID_SNAPSHOT' })
    }))
    const blocked = new Set(ticket.work.blocked.map((fragment, fragmentIndex) => {
      const value = plain(fragment, `${field}.work.blocked[${fragmentIndex}]`, 'INVALID_SNAPSHOT')
      return text(value.id, `${field}.work.blocked[${fragmentIndex}].id`, { code: 'INVALID_SNAPSHOT' })
    }))
    for (const fragment of blocked) if (ready.has(fragment)) fail('INVALID_SNAPSHOT', `${field}.work`)
    const dependencies = ticket.dependsOn.map((dependency, dependencyIndex) => text(dependency, `${field}.dependsOn[${dependencyIndex}]`, { code: 'INVALID_SNAPSHOT' }))
    unique(dependencies, `${field}.dependsOn`)
    tickets.set(id, { raw: ticket, id, revision, ready, blocked, dependencies })
  }
  for (const ticket of tickets.values()) {
    for (const dependency of ticket.dependencies) if (!tickets.has(dependency)) fail('MISSING_TICKET_DEPENDENCY', `ticket(${ticket.id}).dependsOn`, dependency)
  }
  return tickets
}

function planShape(plan) {
  plain(plan, 'plan', 'INVALID_PLAN')
  if (plan.contract !== 'DSH_PLAN_V2') fail('INVALID_PLAN', 'plan.contract')
  if (plan.executable !== true) fail('PLAN_NOT_EXECUTABLE', 'plan.executable')
  const registryDigest = text(plan.registryDigest, 'plan.registryDigest', { digest: true, code: 'INVALID_PLAN' })
  const owners = new Map()
  for (const [index, raw] of list(plan.owners, 'plan.owners', { nonempty: true, code: 'INVALID_PLAN' }).entries()) {
    const owner = plain(raw, `plan.owners[${index}]`, 'INVALID_PLAN')
    const id = text(owner.id, `plan.owners[${index}].id`, { owner: true, code: 'INVALID_PLAN' })
    if (!Array.isArray(owner.scope) || owner.scope.length === 0 || !Array.isArray(owner.exclude)) fail('INVALID_PLAN', `plan.owners[${index}]`)
    if (owners.has(id)) fail('INVALID_PLAN', `plan.owners[${index}].id`, 'duplicate owner')
    owners.set(id, owner)
  }
  const verifications = new Map()
  for (const [index, raw] of list(plan.verifications, 'plan.verifications', { code: 'INVALID_PLAN' }).entries()) {
    const verification = plain(raw, `plan.verifications[${index}]`, 'INVALID_PLAN')
    const id = text(verification.id, `plan.verifications[${index}].id`, { owner: true, code: 'INVALID_PLAN' })
    const run = list(verification.run, `plan.verifications[${index}].run`, { nonempty: true, code: 'INVALID_PLAN' })
      .map((argument, argumentIndex) => {
        if (typeof argument !== 'string' || argument.trim() === '') fail('INVALID_PLAN', `plan.verifications[${index}].run[${argumentIndex}]`)
        return argument
      })
    if (verification.cwd !== undefined && (typeof verification.cwd !== 'string' || verification.cwd.trim() === '')) {
      fail('INVALID_PLAN', `plan.verifications[${index}].cwd`)
    }
    if (verifications.has(id)) fail('INVALID_PLAN', `plan.verifications[${index}].id`, 'duplicate verification')
    verifications.set(id, { ...verification, id, run })
  }
  const tasks = new Map()
  for (const [index, raw] of list(plan.tasks, 'plan.tasks', { nonempty: true, code: 'INVALID_PLAN' }).entries()) {
    const task = plain(raw, `plan.tasks[${index}]`, 'INVALID_PLAN')
    const id = text(task.id, `plan.tasks[${index}].id`, { task: true, code: 'INVALID_PLAN' })
    const ownerId = text(task.ownerId, `plan.tasks[${index}].ownerId`, { owner: true, code: 'INVALID_PLAN' })
    if (!owners.has(ownerId)) fail('UNKNOWN_OWNER', `plan.tasks[${index}].ownerId`, ownerId)
    const dependencies = list(task.dependsOn, `plan.tasks[${index}].dependsOn`, { code: 'INVALID_PLAN' })
      .map((dependency, dependencyIndex) => text(dependency, `plan.tasks[${index}].dependsOn[${dependencyIndex}]`, { task: true, code: 'INVALID_PLAN' }))
    const verify = list(task.verify, `plan.tasks[${index}].verify`, { code: 'INVALID_PLAN' })
      .map((verificationId, verificationIndex) => text(verificationId, `plan.tasks[${index}].verify[${verificationIndex}]`, { owner: true, code: 'INVALID_PLAN' }))
    unique(dependencies, `plan.tasks[${index}].dependsOn`)
    unique(verify, `plan.tasks[${index}].verify`)
    for (const verificationId of verify) if (!verifications.has(verificationId)) fail('UNKNOWN_VERIFICATION', `task(${id}).verify`, verificationId)
    if (tasks.has(id)) fail('INVALID_PLAN', `plan.tasks[${index}].id`, 'duplicate task')
    tasks.set(id, { raw: task, id, ownerId, dependencies, verify })
  }
  for (const task of tasks.values()) for (const dependency of task.dependencies) {
    if (!tasks.has(dependency)) fail('MISSING_TASK_DEPENDENCY', `task(${task.id}).dependsOn`, dependency)
  }
  const visiting = new Set(), visited = new Set()
  const visit = id => {
    if (visited.has(id)) return
    if (visiting.has(id)) fail('TASK_DEPENDENCY_CYCLE', 'plan.tasks', id)
    visiting.add(id)
    for (const dependency of tasks.get(id).dependencies) visit(dependency)
    visiting.delete(id)
    visited.add(id)
  }
  for (const id of tasks.keys()) visit(id)
  return { registryDigest, owners, verifications, tasks }
}

function contractMap(references) {
  const result = new Map()
  const contracts = references.spec?.contracts
  if (!Array.isArray(contracts)) fail('INVALID_SNAPSHOT', 'snapshot.source.references.spec.contracts')
  for (const [index, contract] of contracts.entries()) {
    const value = plain(contract, `snapshot.source.references.spec.contracts[${index}]`, 'INVALID_SNAPSHOT')
    const id = text(value.id, `snapshot.source.references.spec.contracts[${index}].id`, { code: 'INVALID_SNAPSHOT' })
    const revision = text(value.revision, `snapshot.source.references.spec.contracts[${index}].revision`, { code: 'INVALID_SNAPSHOT' })
    if (result.has(id)) fail('INVALID_SNAPSHOT', 'snapshot.source.references.spec.contracts', 'duplicate contract')
    result.set(id, { id, revision, status: value.status ?? 'ready' })
  }
  return result
}

function blockedByReference(references, ticketId, fragmentId) {
  return references.blocked.filter(item => item?.ticketId === ticketId && item?.segment?.id === fragmentId).map(clone)
}

function allBlockedForTicket(references, ticketId) {
  return references.blocked.filter(item => item?.ticketId === ticketId).map(clone)
}

function dedupeRecords(items) {
  const result = []
  const seen = new Set()
  for (const item of items) {
    const key = canonical(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.push(item)
  }
  return result
}

function reaches(tasks, fromId, targetId) {
  const seen = new Set()
  const visit = id => {
    if (id === targetId) return true
    if (seen.has(id)) return false
    seen.add(id)
    return tasks.get(id).dependencies.some(visit)
  }
  return visit(fromId)
}

function inputForTask(task, bindingByTask, plan) {
  return task.dependencies.map(taskId => {
    const producer = plan.tasks.get(taskId)
    const binding = bindingByTask.get(taskId)
    return {
      kind: 'task_dependency',
      taskId: producer.id,
      ownerId: producer.ownerId,
      contracts: clone(binding.contracts),
    }
  })
}

function acceptanceIndex(packages) {
  const entries = new Map()
  for (const item of packages) for (const ticket of item.tickets) {
    for (const acceptance of ticket.acceptanceCriteria) {
      const key = canonical(acceptance)
      const current = entries.get(key) ?? { ...clone(acceptance), contributors: [] }
      current.contributors.push({ taskId: item.taskId, ownerId: item.owner.id, ticketId: ticket.id, fragments: clone(ticket.selectedFragments) })
      entries.set(key, current)
    }
  }
  return [...entries.values()].map(item => ({ ...item, contributors: item.contributors.toSorted((a, b) => a.taskId.localeCompare(b.taskId) || a.ticketId.localeCompare(b.ticketId)) }))
    .toSorted((a, b) => a.id.localeCompare(b.id))
}

/**
 * Compile fixed snapshot references and a pre-normalized V2 plan into one
 * immutable package per task. This does not activate a version or authorize
 * execution.
 */
export function compilePlanningPackages({ snapshot, plan } = {}) {
  const frozen = snapshotReferences(snapshot)
  const binding = normalizePlanningBindings(plan?.planningBindings)
  if (binding === undefined) fail('MISSING_BINDINGS', 'plan.planningBindings')
  if (binding.snapshotId !== frozen.id) fail('SNAPSHOT_ID_MISMATCH', 'plan.planningBindings.snapshotId')
  if (binding.sourceDigest !== frozen.sourceDigest) fail('SOURCE_DIGEST_MISMATCH', 'plan.planningBindings.sourceDigest')
  const normalizedPlan = planShape(plan)
  const tickets = ticketMap(frozen.references)
  const contracts = contractMap(frozen.references)
  const bindingByTask = new Map(binding.tasks.map(item => [item.taskId, item]))
  if (bindingByTask.size !== normalizedPlan.tasks.size) fail('TASK_BINDING_MISMATCH', 'plan.planningBindings.tasks')
  for (const taskId of normalizedPlan.tasks.keys()) if (!bindingByTask.has(taskId)) fail('MISSING_TASK_BINDING', 'plan.planningBindings.tasks', taskId)
  for (const taskId of bindingByTask.keys()) if (!normalizedPlan.tasks.has(taskId)) fail('UNKNOWN_TASK', 'plan.planningBindings.tasks', taskId)

  const contributors = new Map()
  const packageDrafts = []
  for (const task of normalizedPlan.tasks.values()) {
    const taskBinding = bindingByTask.get(task.id)
    const selectedTickets = []
    const blockers = []
    for (const reference of taskBinding.tickets) {
      const ticket = tickets.get(reference.id)
      if (ticket === undefined || ticket.revision !== reference.revision) fail('UNKNOWN_TICKET', `task(${task.id}).tickets`, reference.id)
      const selectedFragments = []
      for (const fragment of reference.fragments) {
        if (ticket.blocked.has(fragment)) fail('BLOCKED_FRAGMENT', `task(${task.id}).tickets`, fragment)
        if (!ticket.ready.has(fragment)) fail('UNKNOWN_FRAGMENT', `task(${task.id}).tickets`, fragment)
        selectedFragments.push(fragment)
        const key = `${ticket.id}\u0000${fragment}`
        const bound = contributors.get(key) ?? []
        bound.push(task.id)
        contributors.set(key, bound)
        blockers.push(...blockedByReference(frozen.references, ticket.id, fragment))
      }
      selectedTickets.push({ ...clone(ticket.raw), selectedFragments })
    }
    const requiredContracts = new Map()
    for (const ticket of selectedTickets) for (const [contractIndex, contract] of ticket.contracts.entries()) {
      const id = text(contract?.id, `task(${task.id}).tickets(${ticket.id}).contracts[${contractIndex}].id`, { code: 'INVALID_SNAPSHOT' })
      const revision = text(contract?.revision, `task(${task.id}).tickets(${ticket.id}).contracts[${contractIndex}].revision`, { code: 'INVALID_SNAPSHOT' })
      const source = contracts.get(id)
      if (source === undefined || source.revision !== revision) fail('UNKNOWN_CONTRACT', `task(${task.id}).tickets`, id)
      const prior = requiredContracts.get(id)
      if (prior !== undefined && prior !== revision) fail('INVALID_SNAPSHOT', `task(${task.id}).tickets`, id)
      requiredContracts.set(id, revision)
    }
    const declaredContracts = new Map(taskBinding.contracts.map(contract => [contract.id, contract.revision]))
    if (declaredContracts.size !== requiredContracts.size
      || [...requiredContracts.entries()].some(([id, revision]) => declaredContracts.get(id) !== revision)) {
      fail('MISSING_CONTRACT_BINDING', `task(${task.id}).contracts`)
    }
    for (const contract of taskBinding.contracts) {
      const source = contracts.get(contract.id)
      if (source === undefined || source.revision !== contract.revision) fail('UNKNOWN_CONTRACT', `task(${task.id}).contracts`, contract.id)
      if (!selectedTickets.some(ticket => ticket.contracts.some(item => item.id === contract.id && item.revision === contract.revision))) {
        fail('UNKNOWN_CONTRACT', `task(${task.id}).contracts`, contract.id)
      }
    }
    const owner = normalizedPlan.owners.get(task.ownerId)
    packageDrafts.push({ task, binding: taskBinding, owner, selectedTickets, blockers: dedupeRecords(blockers) })
  }

  for (const ticket of tickets.values()) for (const fragment of ticket.ready) {
    if (!contributors.has(`${ticket.id}\u0000${fragment}`)) fail('OMITTED_READY_FRAGMENT', `ticket(${ticket.id}).work.ready`, fragment)
  }

  const draftsByTask = new Map(packageDrafts.map(item => [item.task.id, item]))
  for (const draft of packageDrafts) {
    const ticketInputs = []
    for (const ticket of draft.selectedTickets) {
      for (const dependencyTicketId of ticket.dependsOn) {
        const dependency = tickets.get(dependencyTicketId)
        if (dependency === undefined) fail('MISSING_TICKET_DEPENDENCY', `ticket(${ticket.id}).dependsOn`, dependencyTicketId)
        const producerIds = [...new Set([...dependency.ready]
          .flatMap(fragment => contributors.get(`${dependency.id}\u0000${fragment}`) ?? []))]
          .toSorted()
        if (producerIds.length > 0 && producerIds.some(taskId => taskId === draft.task.id || !reaches(normalizedPlan.tasks, draft.task.id, taskId))) {
          fail('TICKET_DEPENDENCY_UNSATISFIED', `task(${draft.task.id}).dependsOn`, dependencyTicketId)
        }
        const dependencyBlockers = allBlockedForTicket(frozen.references, dependencyTicketId)
        draft.blockers.push(...dependencyBlockers)
        ticketInputs.push({
          kind: 'ticket_dependency',
          ticketId: ticket.id,
          dependencyTicketId,
          producers: producerIds.map(taskId => ({
            taskId,
            ownerId: draftsByTask.get(taskId).task.ownerId,
            contracts: clone(draftsByTask.get(taskId).binding.contracts),
          })),
          ...(dependencyBlockers.length === 0 ? {} : { blockedBy: dependencyBlockers }),
        })
      }
    }
    draft.ticketInputs = ticketInputs
    draft.blockers = dedupeRecords(draft.blockers)
  }

  const packageByTask = new Map()
  const statusFor = taskId => {
    const draft = draftsByTask.get(taskId)
    if (packageByTask.has(taskId)) return packageByTask.get(taskId)
    const dependencyPackages = draft.task.dependencies.map(statusFor)
    const blockedBy = dedupeRecords([
      ...draft.blockers,
      ...dependencyPackages.filter(item => item.status === 'blocked').map(item => ({ kind: 'blocked_task_input', taskId: item.taskId, ownerId: item.owner.id })),
    ])
    const verification = draft.task.verify.map(id => clone(normalizedPlan.verifications.get(id)))
    const result = {
      contract: PLANNING_PACKAGE_CONTRACT,
      snapshotId: frozen.id,
      sourceDigest: frozen.sourceDigest,
      registryDigest: normalizedPlan.registryDigest,
      taskId: draft.task.id,
      status: blockedBy.length === 0 ? 'planned' : 'blocked',
      task: clone(draft.task.raw),
      owner: clone(draft.owner),
      spec: clone(frozen.references.spec),
      tickets: clone(draft.selectedTickets),
      contracts: clone(draft.binding.contracts),
      verification,
      inputs: [...inputForTask(draft.task, bindingByTask, normalizedPlan), ...clone(draft.ticketInputs)],
      blockedBy,
    }
    packageByTask.set(taskId, result)
    return result
  }
  const packages = [...normalizedPlan.tasks.keys()].map(statusFor)
  const set = {
    contract: PLANNING_PACKAGE_SET_CONTRACT,
    snapshotId: frozen.id,
    sourceDigest: frozen.sourceDigest,
    registryDigest: normalizedPlan.registryDigest,
    spec: clone(frozen.references.spec),
    blockedFragments: clone(frozen.references.blocked),
    acceptanceIndex: acceptanceIndex(packages),
    packages,
  }
  return deepFreeze(set)
}

/** Return a current, owner-matched executable package for an Owner prompt. */
export function planningPackageForTask({ snapshot, plan, packages, taskId, ownerId } = {}) {
  const expected = compilePlanningPackages({ snapshot, plan })
  if (!same(packages, expected)) fail('PACKAGE_SET_MISMATCH', 'packages')
  const task = text(taskId, 'taskId', { task: true })
  const owner = text(ownerId, 'ownerId', { owner: true })
  const selected = expected.packages.find(item => item.taskId === task)
  if (selected === undefined) fail('UNKNOWN_TASK', 'taskId', task)
  if (selected.owner.id !== owner) fail('MIXED_OWNER_REFERENCE', 'ownerId', owner)
  if (selected.status !== 'planned') fail('BLOCKED_PACKAGE', 'taskId', task)
  return selected
}
