import { orchestratorDocumentPath } from '../../src/orchestrator-documents.mjs'

/** Minimal host contract for native planning-document provenance tests. */
export function planningDocumentRuntime(ctx, root, agent) {
  return {
    activeOwners: new Map(),
    agentRoles: new Map(),
    modeEnabledForActor: actor => actor?.agent === agent,
    checkToolExecution: actor => ['read', 'write', 'edit'].includes(actor?.name) ? undefined : 'unsupported test tool',
    actorRoot: actor => actor?.agent === agent ? root : undefined,
    orchestratorDocumentPath: (actor, filePath) => actor?.agent === agent
      ? orchestratorDocumentPath({ root, cwd: agent.session.header.cwd, filePath })
      : undefined,
    checkFilesystemWrite(target, actor, service) {
      if (actor?.agent !== agent) return { kind: 'deny', reason: 'Only the bound root agent may write planning documents' }
      const path = service.fs.processPath(target)
      if (!orchestratorDocumentPath({ root, cwd: agent.session.header.cwd, filePath: path })) {
        return { kind: 'deny', reason: 'Orchestrator document boundary rejected this write' }
      }
    },
  }
}
