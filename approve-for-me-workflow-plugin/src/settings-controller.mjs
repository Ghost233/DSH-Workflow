import {
  buildSettingsMutation, createSettingsDraft, validateSettingsDraft,
} from '../../owner-workflow-plugin/vendor/dsh-approve-for-me/src/client/settings-form.ts'

const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const equal = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))

// Staged edits retain their original revision. The native SettingsScope owns
// transport/recovery; a recovered write is not itself confirmation of a save.
export class SettingsController {
  constructor(scope, remote) {
    this.scope = scope
    this.remote = remote
    this.listeners = new Set()
    this.groups = []
    this.catalogStatus = 'loading'
    this.catalogGeneration = 0
    this.stop = scope.subscribe(() => this.publish())
    this.publish()
  }
  subscribe = listener => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  getSnapshot = () => this.state
  publish() {
    if (this.disposed) return
    const host = this.scope.getSnapshot()
    const draft = this.draft ?? (host.value && createSettingsDraft(host.value))
    const errors = draft ? validateSettingsDraft(draft, this.groups, this.base ?? host.value) : undefined
    this.state = { host, draft, groups: this.groups, catalogStatus: this.catalogStatus,
      partial: this.partial, saving: !!this.saving, error: this.error,
      dirty: !!this.draft, conflicted: !!this.draft && host.revision !== this.revision,
      errors, valid: !!errors && !errors.provider && !errors.model
        && errors.shellRules.length === 0 && errors.pwshRules.length === 0 }
    for (const listener of this.listeners) listener()
  }
  edit(field, value) {
    if (this.saving || this.disposed) return
    const host = this.scope.getSnapshot()
    if (host.status !== 'ready' || !host.writable) return
    if (!this.draft) {
      this.base = host.value
      this.revision = host.revision
      this.draft = createSettingsDraft(host.value)
    }
    this.draft = { ...this.draft, [field]: value }
    this.error = undefined
    this.publish()
  }
  discard() {
    if (this.saving) return
    this.clearDraft()
    this.publish()
  }
  clearDraft() { this.draft = undefined; this.base = undefined; this.revision = undefined; this.error = undefined }
  async loadCatalog() {
    const generation = ++this.catalogGeneration
    this.catalogStatus = 'loading'
    this.groups = []
    this.publish()
    try {
      const result = await this.remote.modelCatalog()
      if (this.disposed || generation !== this.catalogGeneration) return
      if (!result.ok) throw new Error(result.error?.message ?? 'Model catalog unavailable')
      this.groups = result.value.groups
      this.partial = result.value.failures?.length > 0
      this.catalogStatus = 'ready'
    } catch {
      if (this.disposed || generation !== this.catalogGeneration) return
      this.catalogStatus = 'error'
      this.partial = false
    }
    this.publish()
  }
  async save(reset = false) {
    const state = this.state
    if (this.disposed || this.saving || state.host.status !== 'ready' || !state.host.writable
      || state.conflicted || (!reset && (!state.dirty || !state.valid))) return
    const revision = this.revision ?? state.host.revision
    const desired = reset ? state.host.base : buildSettingsMutation(this.draft, this.base)
    this.saving = true
    this.error = undefined
    this.publish()
    try {
      await this.scope.mutate(reset ? [{ op: 'unset', path: [] }]
        : [{ op: 'set', path: [], value: desired }], revision)
      if (this.disposed) return
      const confirmed = this.scope.getSnapshot()
      if (confirmed.status !== 'ready' || confirmed.revision < revision || !equal(confirmed.value, desired)) {
        throw new Error('设置未保存或已发生冲突；草稿已保留，请载入最新设置后重试。')
      }
      this.clearDraft()
    } catch (error) {
      if (!this.disposed) this.error = error instanceof Error ? error.message : '设置未保存。'
    } finally {
      this.saving = false
      this.publish()
    }
  }
  dispose() { this.disposed = true; this.catalogGeneration++; this.stop(); this.listeners.clear() }
}
