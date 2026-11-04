import { runtimeRequire } from '../../scripts/test-runtime.mjs'
const require = runtimeRequire
const { Peer } = require('@deepseek-ai/dsh-client-connection')
const peers = new WeakMap()

// Each direct Gateway call names the owner of its isolated test Context tree.
export function ownerPeer(ctx) {
  let peer = peers.get(ctx.root)
  if (!peer) { peer = new Peer(ctx.root, { principal: { kind: 'owner' } }); peers.set(ctx.root, peer) }
  return peer
}
