export const name = 'dsh-station-session-indicator'
export const inject = ['webServer']

const ring = '[data-row-key^="session:"] > span > svg[data-state="ongoing"]'
const style = `
${ring} > g,
${ring} > g > circle:last-child {
  animation: none;
}
${ring} > g > circle:last-child {
  stroke-dasharray: 18 150;
  stroke-dashoffset: -3px;
}`

/** Use the built-in reduced-motion ring in the session list. */
export function apply(ctx) {
  ctx.on('webserver/index-inject', table => {
    table.push({ kind: 'style', text: style })
  })
}
