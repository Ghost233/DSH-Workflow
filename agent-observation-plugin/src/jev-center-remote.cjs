module.exports = function createJevCenterRemoteDescriptor() {
  return {
    id: 'dsh-workflow#jevCenter/testConnection',
    service: 'jevCenter', namespace: 'jevCenter', method: 'testConnection',
    invocation: { kind: 'direct' },
    parameters: [{ name: 'modelName', wire: 'modelName', source: 'json', codec: {
      mode: 'strict', typeSymbol: 'dsh-workflow#JevModelName',
      create: () => ({ parse(value) {
        if (typeof value !== 'string' || !value.trim()) throw new TypeError('A JEV model name is required')
        return value
      } }),
    } }],
    result: { mode: 'src-json' },
  }
}

module.exports.assertUniqueModelNames = function assertUniqueModelNames(engines) {
  const names = new Set()
  for (const engine of engines) {
    if (engine.enabled === false) continue
    const modelName = engine.modelName || engine.upstreamModel
    if (names.has(modelName)) throw new Error('已启用的调用模型名重复，请改名后保存')
    names.add(modelName)
  }
}
