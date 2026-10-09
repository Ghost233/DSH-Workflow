import AppKit
import CoreGraphics
import Darwin

func physical(_ path: String) throws -> String {
  guard let value = realpath(path, nil) else { throw NSError(domain: "path", code: Int(errno)) }
  defer { free(value) }
  return String(cString: value)
}
func require(_ condition: Bool, _ reason: String) throws {
  if !condition { throw NSError(domain: reason, code: 1) }
}
func kernel(_ pid: pid_t) throws -> proc_bsdinfo {
  var info = proc_bsdinfo()
  let size = Int32(MemoryLayout<proc_bsdinfo>.size)
  try require(proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, size) == size && info.pbi_pid == UInt32(pid), "kernel identity unknown")
  return info
}
func emit(_ value: [String: Any]) throws {
  print(String(data: try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), encoding: .utf8)!)
}
do {
  let args = CommandLine.arguments
  try require(args.count == 4, "ROOT APP capture|query|terminate required")
  let root = args[1], bundle = args[2], mode = args[3]
  try require(["capture", "query", "terminate"].contains(mode), "supported observation/normal-exit action required")
  let env = ProcessInfo.processInfo.environment
  let base: String
  if env["GITHUB_ACTIONS"] == "true" {
    try require(env["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == nil && env["RUNNER_TEMP"] != nil, "mixed context")
    base = try physical(env["RUNNER_TEMP"]!)
  } else {
    base = "/private/tmp/dsh-launcher-local-" + String(getuid())
    try require(env["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == base, "explicit local context required")
  }
  try require(physical(base) == base && physical(root) == root &&
    URL(fileURLWithPath: root).deletingLastPathComponent().path == base &&
    URL(fileURLWithPath: root).lastPathComponent.hasPrefix("dsh-t05-"), "private direct root required")
  for path in [base, root] {
    let attributes = try FileManager.default.attributesOfItem(atPath: path)
    try require((attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() &&
      (path == base && env["GITHUB_ACTIONS"] == "true" ||
      (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700), "private UID and mode required")
  }
  try require(physical(bundle) == bundle && bundle.hasPrefix(root + "/"), "physical private app required")
  let executable = try physical(bundle + "/Contents/MacOS/DSH Workflow")
  let ledger = root + "/release-window-identity.json"
  let matches = NSWorkspace.shared.runningApplications.filter { app in
    guard let path = app.bundleURL?.path else { return false }
    return (try? physical(path)) == bundle
  }
  if mode == "capture" && matches.isEmpty { try emit(["known": false, "reason": "not-yet-running"]); exit(0) }
  try require(matches.count == 1, "unique app required")
  let app = matches[0], pid = app.processIdentifier
  let identity = try kernel(pid)
  try require(identity.pbi_uid == getuid() && (try? app.executableURL.map { try physical($0.path) }) == executable, "current UID/executable differs")
  let facts: [String: Any] = ["pid": pid, "executable": executable, "uid": identity.pbi_uid,
    "parentPid": identity.pbi_ppid, "kernelSeconds": identity.pbi_start_tvsec,
    "kernelMicroseconds": identity.pbi_start_tvusec]
  if mode == "capture" {
    try require(!FileManager.default.fileExists(atPath: ledger), "existing baseline refused")
    try JSONSerialization.data(withJSONObject: facts).write(to: URL(fileURLWithPath: ledger), options: .atomic)
  } else {
    try require((try? FileManager.default.destinationOfSymbolicLink(atPath: ledger)) == nil, "symlink baseline refused")
    let baseline = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: ledger))) as! [String: Any]
    try require(NSDictionary(dictionary: baseline).isEqual(to: facts), "physical identity changed")
  }
  if mode == "terminate" {
    let accepted = app.terminate()
    try require(accepted, "normal terminate rejected")
    let end = Date().addingTimeInterval(10)
    while !app.isTerminated && Date() < end { RunLoop.current.run(until: Date().addingTimeInterval(0.1)) }
    var info = proc_bsdinfo(); errno = 0
    let raw = proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)), error = errno
    try emit(["known": true, "pid": pid, "normalAccepted": accepted, "isTerminated": app.isTerminated, "kernelLookup": raw, "errno": error])
    try require(app.isTerminated && raw == 0 && error == ESRCH, "normal-stage disappearance unknown")
    exit(0)
  }
  try require(mode == "capture" || mode == "query", "unknown operation")
  guard let windows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] else {
    throw NSError(domain: "window lookup unknown", code: 1)
  }
  let own = windows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == pid &&
    ($0[kCGWindowLayer as String] as? Int) == 0 && ($0[kCGWindowAlpha as String] as? Double ?? 1) > 0 }
  try emit(facts.merging(["known": true, "hidden": app.isHidden, "active": app.isActive,
    "frontmostPid": NSWorkspace.shared.frontmostApplication?.processIdentifier as Any? ?? NSNull(),
    "onscreenWindows": own.count], uniquingKeysWith: { _, new in new }))
} catch {
  FileHandle.standardError.write(Data("RELEASE_WINDOW_UNKNOWN: \(error.localizedDescription)\n".utf8))
  exit(1)
}
