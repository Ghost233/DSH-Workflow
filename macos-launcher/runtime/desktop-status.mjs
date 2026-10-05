import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { readDesktopHost } from './desktop-launch.mjs'

export async function desktopStatus(globalRoot, { readHost = readDesktopHost, request = fetch } = {}) {
  const observedAt = () => new Date().toISOString()
  const message = error => error.message.replace(/token=[^&\s]+/g, 'token=<REDACTED>')
  let host
  try { host = await readHost(join(globalRoot, '.dsh-workflow/desktop')) }
  catch (error) {
    if (['ENOENT', 'ESRCH'].includes(error.code)) return { state: 'stopped', ready: false, observedAt: observedAt() }
    return { state: 'unknown', observedAt: observedAt(), message: message(error) }
  }
  try {
    const signal = AbortSignal.timeout(2000)
    const login = await request(new URL(host.url), { redirect: 'manual', signal })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const response = await request(new URL('/owner-workflow/api/health', host.url), { headers: { cookie }, signal })
    const health = await response.json()
    return { state: 'running', instanceId: host.lease, ready: response.ok && health.ready === true,
      observedAt: observedAt() }
  } catch (error) {
    return { state: 'running', instanceId: host.lease, ready: null, observedAt: observedAt(), message: message(error) }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error('Pass the global application data directory')
  process.stdout.write(JSON.stringify(await desktopStatus(process.argv[2])) + '\n')
}
