module.exports = function createDeliveryRemoteDescriptor() {
  return {
    id: 'dsh-workflow#workflowDelivery/list',
    service: 'workflowDelivery', namespace: 'workflowDelivery', method: 'list',
    invocation: { kind: 'direct' }, parameters: [], result: { mode: 'src-json' },
  }
}
