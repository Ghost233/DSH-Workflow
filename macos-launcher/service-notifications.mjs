import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { cp, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const execute = promisify(execFile)

/** Compile the project-owned notification app; it needs its own macOS notification identity. */
export async function bundleServiceNotifications(root, resources) {
  const source = join(root, 'macos-launcher/native/service-notifications')
  const app = join(resources, 'DSH Service Notifications.app')
  const contents = join(app, 'Contents')
  await mkdir(join(contents, 'MacOS'), { recursive: true })
  await cp(join(source, 'Info.plist'), join(contents, 'Info.plist'))
  await execute('xcrun', ['swiftc', '-O', '-target', 'arm64-apple-macos14.0', join(source, 'main.swift'), '-o', join(contents, 'MacOS/DSH Service Notifications'),
    '-framework', 'AppKit', '-framework', 'UserNotifications'])
  await execute('codesign', ['--force', '--sign', '-', app])
}
