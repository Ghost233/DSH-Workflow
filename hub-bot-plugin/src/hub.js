/**
 * The hub-bot composition root shared by the root plugin (src/index.js) and the preset-subtree tool plugins
 * (src/router-tools.js).
 *
 * Why a Symbol.for global, not a module-level variable nor a cordis service:
 *  - the preset subtree is a mounted composition whose rows resolve modules through a DIFFERENT loader base than
 *    the root composition (observed live: the router-tools row loaded and ran, yet saw a fresh module instance in
 *    which the root plugin's singleton was unset). A module-level variable is therefore NOT shared.
 *  - cordis service visibility into a mounted preset subtree is undocumented for profile-level custom services;
 *    only Host services (tools, systemPrompt) are known to be injectable there.
 *  - both module instances run in the same process realm, so a Symbol.for-keyed property on globalThis is the one
 *    channel guaranteed to connect them.
 */
import { join } from 'node:path'
import { OwnerRegistry } from './registry.js'
import { Router } from './router.js'

/** The globalThis key bridging the root loader's module instance and the preset subtree's. */
const HUB_KEY = Symbol.for('dsh-hub-bot:hub')

/** Installs the process-wide hub (called by the root plugin once the store/router exist). */
export function setHub(hub) {
  globalThis[HUB_KEY] = hub ?? null
}

/** The installed hub, or null when the root plugin has not started (preset tools refuse work then). */
export function getHub() {
  return globalThis[HUB_KEY] ?? null
}

/** store + registry + router wired together; sessions is the narrow port from src/router.js. */
export class Hub {
  constructor({ store, config, sessions }) {
    this.store = store
    this.config = config
    this.sessions = sessions
    this.registry = new OwnerRegistry(store, { scratchRoot: join(config.stateDir, 'scratch') })
    this.router = new Router({ store, registry: this.registry, sessions })
  }
}
