module.exports = function createJevCenterRemoteDescriptor() {
  return {
    id: 'dsh-owner-workflow#jevCenter/testConnection',
    service: 'jevCenter', namespace: 'jevCenter', method: 'testConnection',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'modelName', wire: 'modelName', source: 'json', codec: {
      mode: 'strict', typeSymbol: 'dsh-owner-workflow#JevModelName',
      create: () => ({ parse(value) {
        if (typeof value !== 'string' || !value.trim()) throw new TypeError('A JEV model name is required')
        return value
      } }),
    } }],
    result: { mode: 'src-json' },
  }
}
