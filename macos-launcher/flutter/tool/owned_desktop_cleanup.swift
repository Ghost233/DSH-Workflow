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
          let actual = app.bundleURL, let executable = app.executableURL, let launched = app.launchDate else {
      throw fail("Owned Desktop is unavailable")
    }
    let expected = canonical(arguments[3])
    guard expected.hasPrefix(runnerRoot + "/"), canonical(actual.path) == expected,
          canonical(executable.path).hasPrefix(expected + "/Contents/MacOS/") else {
      throw fail("Desktop bundle identity differs from private candidate")
    }
    let probe = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("probe-process.json"))) as! [String: Any]
    let format = ISO8601DateFormatter()
    format.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let started = format.date(from: probe["startedAt"] as? String ?? ""), launched >= started.addingTimeInterval(-5) else {
      throw fail("Desktop predates this probe")
    }
    let facts: [String: Any] = ["pid": pid, "bundlePath": expected, "executablePath": canonical(executable.path),
                              "launchDateUnix": launched.timeIntervalSince1970, "probeStartedAt": probe["startedAt"]!]
    try JSONSerialization.data(withJSONObject: facts, options: [.sortedKeys]).write(to: ledger, options: .atomic)
    try emit(facts.merging(["event": "captured"], uniquingKeysWith: { _, new in new }))
  } else if mode == "terminate" || mode == "request-only" {
    guard arguments.count == (mode == "request-only" ? 4 : 3) else { throw fail("Invalid cleanup arguments") }
    let facts = try JSONSerialization.jsonObject(with: Data(contentsOf: ledger)) as! [String: Any]
    guard let pid = facts["pid"] as? Int32, pid > 1, let expected = facts["bundlePath"] as? String,
          expected.hasPrefix(runnerRoot + "/"), let launched = facts["launchDateUnix"] as? Double,
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
          let actualExecutable = app.executableURL, canonical(actualExecutable.path) == executable,
          let actualLaunch = app.launchDate, abs(actualLaunch.timeIntervalSince1970 - launched) < 0.001 else {
      throw fail("Desktop PID identity changed")
    }
    if mode == "request-only" {
      let binding = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("owned-desktop-request.json"))) as! [String: Any]
      let probe = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: root).appendingPathComponent("probe-process.json"))) as! [String: Any]
      guard let launcher = binding["launcher"] as? [String: Any], let driver = binding["driver"] as? [String: Any],
            let launcherPid = launcher["pid"] as? Int32, launcherPid == probe["pid"] as? Int32,
            let driverPid = driver["pid"] as? Int32, driverPid == getppid(),
            launcher["parentPid"] as? Int32 == driverPid,
            launcher["uid"] as? UInt32 == getuid(), driver["uid"] as? UInt32 == getuid(),
            let launcherExecutable = launcher["executable"] as? String, launcherExecutable == probe["executable"] as? String,
            let launcherStart = launcher["startUnixSeconds"] as? Double,
            let launcherApp = NSRunningApplication(processIdentifier: launcherPid), !launcherApp.isTerminated,
            let launcherURL = launcherApp.executableURL, canonical(launcherURL.path) == launcherExecutable,
            let launcherDate = launcherApp.launchDate, abs(launcherDate.timeIntervalSince1970 - launcherStart) <= 1,
            binding["root"] as? String == root, binding["desktopPid"] as? Int32 == pid,
            let hostPid = binding["hostPid"] as? Int32, hostPid > 1, kill(hostPid, 0) == 0 else {
        throw fail("Live Launcher/driver/Desktop/Host request binding changed")
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
    if mode == "request-only" { exit(0) }
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
