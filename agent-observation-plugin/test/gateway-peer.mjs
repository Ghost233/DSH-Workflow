import { createRequire } from 'node:module'
const require = createRequire(new URL('../../deepseek-harness/apps/cli/package.json', import.meta.url))
const { Peer } = require('@deepseek-ai/dsh-client-connection')
const peers = new WeakMap()

// Each direct Gateway call names the owner of its isolated test Context tree.
export function ownerPeer(ctx) {
  let peer = peers.get(ctx.root)
  if (!peer) { peer = new Peer(ctx.root, { principal: { kind: 'owner' } }); peers.set(ctx.root, peer) }
  return peer
}
