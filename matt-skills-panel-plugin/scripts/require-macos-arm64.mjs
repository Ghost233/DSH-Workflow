if (process.platform !== 'darwin' || process.arch !== 'arm64') {
  throw new Error('DSH Workflow Matt engineering requires macOS ARM64')
}
