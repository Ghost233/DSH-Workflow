import AppKit
import Foundation

// Only the exact Desktop instance observed in a disposable CI probe may exit.
func fail(_ message: String) -> NSError {
  NSError(domain: "OwnedDesktopCleanup", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
}
func canonical(_ path: String) -> String {
  URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL.path
}
func emit(_ facts: [String: Any]) throws {
  FileHandle.standardOutput.write(try JSONSerialization.data(withJSONObject: facts, options: [.sortedKeys]))
  FileHandle.standardOutput.write(Data("\n".utf8))
}

func requestFailure(_ clause: String, _ facts: [String: Any] = [:]) -> NSError {
  let allowed = ["present", "expectedPid", "actualPid", "expectedUid", "actualUid",
                 "matches", "baselineStartUnix", "currentStartUnix", "precisionSeconds"]
  var value: [String: Any] = ["event": "request-guard-failed", "mode": "request-only",
                            "requests": 0, "clause": clause]
  for key in allowed where facts[key] != nil { value[key] = facts[key] }
  try? emit(value)
  return fail("Request-only guard failed: \(clause)")
}

do {
  let arguments = CommandLine.arguments
  guard arguments.count >= 3, ProcessInfo.processInfo.environment["GITHUB_ACTIONS"] == "true",
        let runner = ProcessInfo.processInfo.environment["RUNNER_TEMP"] else { throw fail("Requires clean CI") }
  let root = canonical(arguments[1]), runnerRoot = canonical(runner)
  guard root.hasPrefix(runnerRoot + "/"), URL(fileURLWithPath: root).lastPathComponent.hasPrefix("dsh-") else {
    throw fail("Unowned probe root")
  }
  let ledger = URL(fileURLWithPath: root).appendingPathComponent("owned-desktop-process.json")
  let mode = arguments[2]
  if mode == "capture" {
    guard arguments.count == 5, let pid = Int32(arguments[4]), pid > 1,
          let app = NSRunningApplication(processIdentifier: pid),
          let actual = app.bundleURL, let executable = app.executableURL else {
      throw fail("Owned Desktop is unavailable")
    }
    let expected = canonical(arguments[3])
    guard expected.hasPrefix(runnerRoot + "/"), canonical(actual.path) == expected,
          canonical(executable.path).hasPrefix(expected + "/Contents/MacOS/") else {
      throw fail("Desktop bundle identity differs from private candidate")
    }
    let probe = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("probe-process.json"))) as! [String: Any]
    let facts: [String: Any] = ["pid": pid, "bundlePath": expected, "executablePath": canonical(executable.path),
                              "probeStartedAt": probe["startedAt"]!]
    try JSONSerialization.data(withJSONObject: facts, options: [.sortedKeys]).write(to: ledger, options: .atomic)
    try emit(facts.merging(["event": "captured"], uniquingKeysWith: { _, new in new }))
  } else if mode == "terminate" || mode == "request-only" {
    guard arguments.count == (mode == "request-only" ? 4 : 3) else { throw fail("Invalid cleanup arguments") }
    let facts = try JSONSerialization.jsonObject(with: Data(contentsOf: ledger)) as! [String: Any]
    guard let pid = facts["pid"] as? Int32, pid > 1, let expected = facts["bundlePath"] as? String,
          expected.hasPrefix(runnerRoot + "/"),
          let executable = facts["executablePath"] as? String else { throw fail("Invalid owned Desktop ledger") }
    if mode == "request-only" {
      guard let expectedPid = Int32(arguments[3]), expectedPid == pid else { throw fail("Desktop ledger differs from current PID") }
    }
    guard let app = NSRunningApplication(processIdentifier: pid), !app.isTerminated else {
      try emit(["event": "already-exited", "mode": mode, "requests": 0, "pid": pid, "observedExited": true])
      if mode == "request-only" { throw fail("Current Desktop request liveness is unknown") }
      exit(0)
    }
    guard let bundle = app.bundleURL, canonical(bundle.path) == expected,
          let actualExecutable = app.executableURL, canonical(actualExecutable.path) == executable else {
      throw fail("Desktop PID identity changed")
    }
    if mode == "request-only" {
      let binding = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("owned-desktop-request.json"))) as! [String: Any]
      let probe = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("probe-process.json"))) as! [String: Any]
      guard let launcher = binding["launcher"] as? [String: Any] else {
        throw requestFailure("launcher-metadata", ["present": false])
      }
      guard let driver = binding["driver"] as? [String: Any] else {
        throw requestFailure("driver-metadata", ["present": false])
      }
      let prepared = (probe["liveProcesses"] as? [String: Any])?["launcher"] as? [String: Any]
      // Fixed allowlist projection into the already-collected helper log.
      var metadata: [String: Any] = ["event": "request-binding-metadata", "mode": mode, "requests": 0,
                "launcherPidPresent": launcher["pid"] as? Int32 != nil,
                "driverPidPresent": driver["pid"] as? Int32 != nil,
                "currentHelperParentPid": getppid(), "currentUid": getuid(),
                "ownedRootMatches": binding["root"] as? String == root,
                "currentDesktopPidMatches": binding["desktopPid"] as? Int32 == pid,
                "launcherKnownExecutableMatches": launcher["executable"] as? String != nil && launcher["executable"] as? String == probe["executable"] as? String,
                "kernelBaselinePresent": prepared?["startUnixSeconds"] as? Double != nil,
                "kernelCurrentPresent": launcher["startUnixSeconds"] as? Double != nil,
                "kernelBaselineMatches": prepared?["startUnixSeconds"] as? Double != nil && prepared?["startUnixSeconds"] as? Double == launcher["startUnixSeconds"] as? Double,
                "kernelStartPrecisionSeconds": 1]
      if let value = launcher["pid"] as? Int32 { metadata["launcherPid"] = value }
      if let value = launcher["uid"] as? UInt32 { metadata["launcherUid"] = value }
      if let value = driver["pid"] as? Int32 { metadata["driverPid"] = value }
      if let value = driver["uid"] as? UInt32 { metadata["driverUid"] = value }
      if let value = binding["hostPid"] as? Int32 { metadata["hostPid"] = value }
      if let value = prepared?["startUnixSeconds"] as? Double { metadata["kernelBaselineStartUnix"] = value }
      if let value = launcher["startUnixSeconds"] as? Double { metadata["kernelCurrentStartUnix"] = value }
      try emit(metadata)
      guard let launcherPid = launcher["pid"] as? Int32 else {
        throw requestFailure("launcher-pid", ["present": false])
      }
      guard launcherPid == probe["pid"] as? Int32 else {
        throw requestFailure("launcher-current-pid", ["actualPid": launcherPid])
      }
      guard let driverPid = driver["pid"] as? Int32 else {
        throw requestFailure("driver-pid", ["present": false])
      }
      guard driverPid == getppid() else {
        throw requestFailure("driver-helper-parent", ["expectedPid": driverPid, "actualPid": getppid()])
      }
      guard launcher["parentPid"] as? Int32 == driverPid else {
        throw requestFailure("launcher-parent", ["expectedPid": driverPid])
      }
      guard launcher["uid"] as? UInt32 == getuid() else {
        throw requestFailure("launcher-uid", ["expectedUid": getuid()])
      }
      guard driver["uid"] as? UInt32 == getuid() else {
        throw requestFailure("driver-uid", ["expectedUid": getuid()])
      }
      guard let launcherExecutable = launcher["executable"] as? String,
            launcherExecutable == probe["executable"] as? String else {
        throw requestFailure("launcher-known-executable", ["matches": false])
      }
      // Both birth values are the existing inspect_host BSD lstart snapshot at one-second precision.
      guard let launcherStart = launcher["startUnixSeconds"] as? Double else {
        throw requestFailure("launcher-kernel-start", ["present": false])
      }
      guard let baselineStart = prepared?["startUnixSeconds"] as? Double else {
        throw requestFailure("launcher-kernel-baseline", ["present": false])
      }
      guard launcherStart == baselineStart else {
        throw requestFailure("launcher-kernel-baseline-match", ["baselineStartUnix": baselineStart,
                           "currentStartUnix": launcherStart, "precisionSeconds": 1])
      }
      guard binding["root"] as? String == root else {
        throw requestFailure("owned-root", ["matches": false])
      }
      guard binding["desktopPid"] as? Int32 == pid else {
        throw requestFailure("current-desktop-pid", ["expectedPid": pid])
      }
      guard let hostPid = binding["hostPid"] as? Int32, hostPid > 1 else {
        throw requestFailure("current-host-pid", ["present": false])
      }
      guard kill(hostPid, 0) == 0 else {
        throw requestFailure("current-host-alive", ["actualPid": hostPid])
      }
      let receipt = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("data/global/.dsh-workflow/desktop/desktop-host.json"))) as! [String: Any]
      guard receipt["pid"] as? Int32 == hostPid, receipt["lease"] as? String == binding["hostLease"] as? String else {
        throw fail("Current Host receipt changed before Desktop request")
      }
      try emit(["event": "request-live-binding", "mode": mode, "pid": pid,
                "launcherPid": launcherPid, "driverPid": driverPid, "hostPid": hostPid,
                "launcherLive": true, "driverLive": true])
    }
    let requested = app.terminate()
    if mode == "request-only" {
      try emit(["event": "normal-termination-request", "mode": mode, "requests": 1,
                "pid": pid, "expectedPid": pid, "lookupFound": true,
                "accepted": requested, "hasTerminated": app.isTerminated])
    } else {
      try emit(["event": "normal-termination-request", "mode": mode, "requests": 1, "pid": pid, "requested": requested])
    }
    guard requested else { throw fail("Desktop declined normal termination") }
    if mode == "request-only" {
      // The driver releases this sender after its original Desktop-exit wait.
      RunLoop.current.add(NSMachPort(), forMode: .default)
      DispatchQueue.global().async {
        _ = FileHandle.standardInput.readDataToEndOfFile()
        exit(0)
      }
      RunLoop.current.run()
      exit(0)
    }
    let deadline = Date().addingTimeInterval(15)
    while !app.isTerminated && Date() < deadline {
      RunLoop.current.run(until: Date().addingTimeInterval(0.1))
    }
    try emit(["event": "termination-observation", "pid": pid, "observedExited": app.isTerminated])
    guard app.isTerminated else { throw fail("Desktop did not exit after normal termination") }
  } else { throw fail("Unknown cleanup action") }
} catch {
  FileHandle.standardError.write(Data("OWNED_DESKTOP_CLEANUP_ERROR: \(error.localizedDescription)\n".utf8))
  exit(1)
}
