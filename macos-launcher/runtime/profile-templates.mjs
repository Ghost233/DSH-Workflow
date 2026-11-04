/** Resolve the upstream Web template from the installed DSH version. */
export function webProfileBundles(require, boot) {
  const templates = boot.PROFILE_TEMPLATES ?? require('@deepseek-ai/dsh-official-bundles').PROFILE_TEMPLATES
  return templates.web.bundles
}
