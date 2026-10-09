module.exports = function createAgentMonitorRemoteDescriptor() {
  return {
    id: 'dsh-workflow#agentMonitor/snapshot',
    service: 'agentMonitor', namespace: 'agentMonitor', method: 'snapshot',
    invocation: { kind: 'direct' }, parameters: [], result: { mode: 'src-json' },
  }
}
