const original = 'const persistence = ctx.remote.$host.isLoopback ? "host" : "memory";'
const enabled = 'const persistence = ctx.remote.$host.isLoopback || (typeof document !== "undefined" && document.cookie.split(";").some(part => part.trim() === "dsh-workflow-settings-access=1")) ? "host" : "memory";'

/** Limit the packaged DSH client change to its pinned settings persistence decision. */
export function allowAuthenticatedLanSettings(source) {
  if (source.split(original).length !== 2) throw new Error('Pinned DSH settings client no longer has the expected persistence decision')
  return source.replace(original, enabled)
}
