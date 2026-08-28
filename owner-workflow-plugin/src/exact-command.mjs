const SAFE_SHELL_ARG = /^[A-Za-z0-9_@%+=:,./-]+$/u

function quoteShellArg(value) {
  if (value === '') return "''"
  if (SAFE_SHELL_ARG.test(value)) return value
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

/** 将 command 或结构化 argv 归一化为可审计、可精确批准的一条 Shell 命令。 */
export function normalizeExactCommand(args, toolName) {
  const hasCommand = typeof args?.command === 'string'
  const hasArgv = Array.isArray(args?.argv)
  if (hasCommand === hasArgv) {
    throw new Error(`${toolName} 必须且只能提供 command 或 argv 之一`)
  }
  if (hasCommand) {
    const command = args.command.trim()
    if (command === '') throw new Error(`${toolName} 必须提供非空 command`)
    return { command, structured: false }
  }
  if (args.argv.length === 0 || args.argv.length > 128
    || args.argv.some(value => typeof value !== 'string')
    || args.argv[0].trim() === '') {
    throw new Error(`${toolName}.argv 必须包含 1 到 128 个字符串，且可执行文件不能为空`)
  }
  const argv = [...args.argv]
  return {
    argv,
    command: argv.map(quoteShellArg).join(' '),
    structured: true,
  }
}
