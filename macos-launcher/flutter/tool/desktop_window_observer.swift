import Cocoa
import Darwin

func canonical(_ path: String) -> String? {
  guard let value = realpath(path, nil) else { return nil }
  defer { free(value) }
  return String(cString: value)
}

func emit(_ phase: String, _ facts: [String: Any] = [:]) {
  let row = facts.merging(["phase": phase,
    "at": ISO8601DateFormatter().string(from: Date()),
    "uptime": ProcessInfo.processInfo.systemUptime], uniquingKeysWith: { _, new in new })
  if let bytes = try? JSONSerialization.data(withJSONObject: row, options: [.sortedKeys]) {
    FileHandle.standardOutput.write(bytes + Data([10]))
  }
}

do {
  guard CommandLine.arguments.count == 2,
        let root = canonical(CommandLine.arguments[1]),
        root == CommandLine.arguments[1] else {
    throw NSError(domain: "window-observer", code: 1)
  }
  let rootURL = URL(fileURLWithPath: root)
  let parent = rootURL.deletingLastPathComponent().path
  let environment = ProcessInfo.processInfo.environment
  let localAllowed = environment["GITHUB_ACTIONS"] != "true" &&
    environment["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == parent &&
    parent == "/private/tmp/dsh-launcher-local-" + String(getuid())
  let ciAllowed = environment["GITHUB_ACTIONS"] == "true" &&
    environment["RUNNER_TEMP"].flatMap { canonical($0) } == parent
  guard (localAllowed || ciAllowed), (rootURL.lastPathComponent.hasPrefix("dsh-t01-") || rootURL.lastPathComponent.hasPrefix("dsh-t05-")) else {
    throw NSError(domain: "window-observer", code: 1)
  }
  let attributes = try FileManager.default.attributesOfItem(atPath: root)
  guard (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
        (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700,
        let bundlePath = canonical(root + "/missing-runtime/desktop/DeepSeek Harness.app"),
        bundlePath == root + "/missing-runtime/desktop/DeepSeek Harness.app",
        let executableURL = Bundle(url: URL(fileURLWithPath: bundlePath))?.executableURL,
        let executable = canonical(executableURL.path) else {
    throw NSError(domain: "window-observer", code: 2)
  }
  var previous = ""
  var boundPid: pid_t?, boundStart: (UInt64, UInt64)?
  func sample(_ phase: String = "sample") {
    let matches = NSWorkspace.shared.runningApplications.filter {
      !$0.isTerminated && $0.bundleURL.flatMap { canonical($0.path) } == bundlePath
    }
    let frontmost: Any = NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull()
    var facts: [String: Any] = ["frontmostPid": frontmost, "ownershipKnown": true, "running": false,
      "pid": NSNull(), "onscreenWindowCount": 0, "windows": []]
    if matches.count > 1 { facts["ownershipKnown"] = false }
    else if let app = matches.first {
      var identity = proc_bsdinfo()
      let size = MemoryLayout<proc_bsdinfo>.stride
      let valid = app.executableURL.flatMap { canonical($0.path) } == executable &&
        proc_pidinfo(app.processIdentifier, PROC_PIDTBSDINFO, 0, &identity, Int32(size)) == Int32(size) &&
        identity.pbi_uid == getuid()
      let start = (identity.pbi_start_tvsec, identity.pbi_start_tvusec)
      if !valid || (boundPid != nil && (boundPid != app.processIdentifier ||
          boundStart?.0 != start.0 || boundStart?.1 != start.1)) {
        facts["ownershipKnown"] = false
      } else {
        boundPid = app.processIdentifier; boundStart = start
        let all = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]]
        let windows = all?.filter {
          ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == app.processIdentifier &&
          ($0[kCGWindowLayer as String] as? NSNumber)?.intValue == 0 &&
          (($0[kCGWindowAlpha as String] as? NSNumber)?.doubleValue ?? 0) > 0
        }.map { value -> [String: Any] in
          ["number": value[kCGWindowNumber as String] ?? NSNull(),
           "bounds": value[kCGWindowBounds as String] ?? NSNull()]
        }
        facts = ["frontmostPid": frontmost, "ownershipKnown": true, "running": true, "pid": app.processIdentifier,
          "uid": identity.pbi_uid, "parentPid": identity.pbi_ppid,
          "kernelStartSeconds": start.0, "kernelStartMicroseconds": start.1,
          "bundle": bundlePath, "executable": executable,
          "hidden": app.isHidden, "active": app.isActive,
          "windowLookupKnown": all != nil, "onscreenWindowCount": windows?.count ?? -1,
          "windows": windows ?? []]
      }
    }
    let encoded = String(data: (try? JSONSerialization.data(withJSONObject: facts, options: [.sortedKeys])) ?? Data(), encoding: .utf8) ?? ""
    if phase != "sample" || encoded != previous { emit(phase, facts); previous = encoded }
  }
  emit("observer-ready", ["root": rootURL.path, "bundle": bundlePath, "sampleIntervalMilliseconds": 20])
  sample()
  let names: [Notification.Name] = [NSWorkspace.didLaunchApplicationNotification,
    NSWorkspace.didActivateApplicationNotification, NSWorkspace.didHideApplicationNotification,
    NSWorkspace.didUnhideApplicationNotification]
  let tokens = names.map { name in
    NSWorkspace.shared.notificationCenter.addObserver(forName: name, object: nil, queue: .main) { note in
      if let app = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
         app.bundleURL.flatMap({ canonical($0.path) }) == bundlePath { sample(name.rawValue) }
    }
  }
  let timer = Timer.scheduledTimer(withTimeInterval: 0.02, repeats: true) { _ in sample() }
  DispatchQueue.global().async {
    _ = readLine()
    DispatchQueue.main.async { CFRunLoopStop(CFRunLoopGetMain()) }
  }
  CFRunLoopRun()
  timer.invalidate()
  for token in tokens { NSWorkspace.shared.notificationCenter.removeObserver(token) }
  sample("observer-complete")
} catch {
  emit("observer-unknown", ["errorType": String(describing: type(of: error))])
  exit(1)
}
