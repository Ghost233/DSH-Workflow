import Cocoa
import Darwin
func physical(_ path: String) throws -> String {
  guard let p = realpath(path, nil) else { throw NSError(domain: "physical", code: Int(errno)) }
  defer { free(p) }; return String(cString: p)
}
func facts(_ app: NSRunningApplication) throws -> [String: Any] {
  var info = proc_bsdinfo()
  guard proc_pidinfo(app.processIdentifier, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)) == MemoryLayout<proc_bsdinfo>.size,
        info.pbi_uid == getuid(), let path = app.executableURL?.path, let bundle = app.bundleURL?.path else {
    throw NSError(domain: "physical Finder unknown", code: 1)
  }
  return ["pid": app.processIdentifier, "uid": info.pbi_uid, "kernelSeconds": info.pbi_start_tvsec,
    "kernelMicroseconds": info.pbi_start_tvusec, "executable": try physical(path), "bundle": try physical(bundle)]
}
do {
  guard CommandLine.arguments.count == 3 else { throw NSError(domain: "ROOT capture|activate|restore required", code: 1) }
  let root = CommandLine.arguments[1], action = CommandLine.arguments[2]
  let env = ProcessInfo.processInfo.environment
  let base: String
  if env["GITHUB_ACTIONS"] == "true" {
    guard env["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == nil, let requested = env["RUNNER_TEMP"], try physical(requested) == requested else { throw NSError(domain: "physical CI root required", code: 1) }
    base = env["RUNNER_TEMP"]!
  } else {
    base = "/private/tmp/dsh-launcher-local-" + String(getuid())
    guard env["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == base else { throw NSError(domain: "explicit local root required", code: 1) }
  }
  let attr = try FileManager.default.attributesOfItem(atPath: root)
  guard try physical(root) == root, URL(fileURLWithPath: root).deletingLastPathComponent().path == base,
        URL(fileURLWithPath: root).lastPathComponent.hasPrefix("dsh-t05-"),
        (attr[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(), (attr[.posixPermissions] as? NSNumber)?.intValue == 0o700,
        ["capture", "activate", "restore"].contains(action) else { throw NSError(domain: "exact private owned root required", code: 1) }
  let original = root + "/external-foreground-original.json"
  let session = CGSessionCopyCurrentDictionary() as? [String: Any] ?? [:]
  let onConsole = session["kCGSSessionOnConsoleKey"] as? Bool == true
  let loginDone = session["kCGSessionLoginDoneKey"] as? Bool == true
  let locked = session["CGSSessionScreenIsLocked"] as? Bool
  guard onConsole && loginDone && locked != true else { throw NSError(domain: "interactive session unavailable", code: 1) }
  let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.finder")
  guard apps.count == 1 && !apps[0].isTerminated else { throw NSError(domain: "existing Finder unknown", code: 1) }
  let app = apps[0], current = try facts(app)
  if action == "restore" {
    let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: original))) as! [String: Any]
    let counts = [CGEventType.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown].map { CGEventSource.counterForEventType(.hidSystemState, eventType: $0) }
    if (saved["inputCounts"] as? [UInt32]) == counts, let original = saved["originalFrontmost"] as? [String: Any],
       let target = NSRunningApplication(processIdentifier: (original["pid"] as! NSNumber).int32Value), !target.isTerminated {
      let now = try facts(target)
      guard ["pid", "uid", "kernelSeconds", "kernelMicroseconds", "executable"].allSatisfy({ String(describing: now[$0]!) == String(describing: original[$0]!) }) else { throw NSError(domain: "original foreground identity changed", code: 1) }
      guard target.activate(options: [.activateAllWindows]) else { throw NSError(domain: "original foreground restore refused", code: 1) }
    }
  }
  if action == "activate" {
    let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: original))) as! [String: Any]
    for key in ["pid", "uid", "kernelSeconds", "kernelMicroseconds", "executable", "bundle"] {
      guard String(describing: current[key]!) == String(describing: saved[key]!) else { throw NSError(domain: "Finder identity changed", code: 1) }
    }
    guard app.activate(options: [.activateAllWindows]) else { throw NSError(domain: "Finder activate refused", code: 1) }
    let deadline = ProcessInfo.processInfo.systemUptime + 3
    while NSWorkspace.shared.frontmostApplication?.processIdentifier != app.processIdentifier && ProcessInfo.processInfo.systemUptime < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.02)) }
    guard app.isActive && NSWorkspace.shared.frontmostApplication?.processIdentifier == app.processIdentifier else { throw NSError(domain: "Finder actual foreground unavailable", code: 1) }
  }
  var out = current
  out["inputCounts"] = [CGEventType.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown].map { CGEventSource.counterForEventType(.hidSystemState, eventType: $0) }
  if let previous = NSWorkspace.shared.frontmostApplication { out["originalFrontmost"] = try facts(previous) }
  out["action"] = action; out["frontmostPid"] = NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull()
  out["frontmostActive"] = NSWorkspace.shared.frontmostApplication?.isActive as Any? ?? NSNull()
  out["lockedRaw"] = session["CGSSessionScreenIsLocked"] ?? NSNull(); out["onConsole"] = onConsole; out["loginDone"] = loginDone
  if action == "capture" {
    guard !FileManager.default.fileExists(atPath: original) else { throw NSError(domain: "existing foreground baseline refused", code: 1) }
    try JSONSerialization.data(withJSONObject: out).write(to: URL(fileURLWithPath: original), options: .atomic)
  }
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: out, options: [.sortedKeys])); print("")
} catch { fputs("EXTERNAL_FOCUS_PREFLIGHT_ERROR=\(error)\n", stderr); exit(1) }
