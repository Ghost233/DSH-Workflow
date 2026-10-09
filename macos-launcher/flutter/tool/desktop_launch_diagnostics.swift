import AppKit
import Foundation

// Diagnostic boundary only: never runs outside a disposable GitHub runner.
func canonical(_ path: String) -> String {
  URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL.path
}
func emit(_ value: [String: Any], to file: URL) throws {
  let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
  try data.write(to: file, options: .atomic)
  FileHandle.standardOutput.write(data + Data("\n".utf8))
}
func errorFacts(_ error: NSError) -> [String: Any] {
  var facts: [String: Any] = ["domain": error.domain, "code": error.code,
                            "message": error.localizedDescription]
  if let underlying = error.userInfo[NSUnderlyingErrorKey] as? NSError {
    facts["underlying"] = errorFacts(underlying)
  }
  return facts
}
func reject(_ message: String) -> NSError {
  NSError(domain: "DesktopLaunchDiagnostics", code: 1,
          userInfo: [NSLocalizedDescriptionKey: message])
}

func readOnlyCommand(_ executable: String, _ arguments: [String]) throws -> [String: Any] {
  let process = Process(), output = Pipe(), errors = Pipe()
  process.executableURL = URL(fileURLWithPath: executable)
  process.arguments = arguments
  process.environment = ProcessInfo.processInfo.environment.merging(["LC_ALL": "C"], uniquingKeysWith: { _, new in new })
  process.standardOutput = output; process.standardError = errors
  try process.run()
  process.waitUntilExit()
  return ["command": [executable] + arguments, "exit": process.terminationStatus,
    "terminationReason": process.terminationReason == .exit ? "exit" : "signal",
    "stdout": String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self),
    "stderr": String(decoding: errors.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)]
}
func esrch(_ lookup: [String: Any], _ pid: pid_t) -> Bool {
  let message = (lookup["stderr"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
  return lookup["terminationReason"] as? String == "exit" &&
    lookup["exit"] as? Int32 == 1 && lookup["stdout"] as? String == "" &&
    !message.contains("\n") && message.contains(String(pid)) && message.hasSuffix("No such process")
}
func sameIdentity(_ app: NSRunningApplication, _ bundle: String, _ executable: String, _ launched: Date) -> Bool {
  guard let actual = app.bundleURL, let binary = app.executableURL, let date = app.launchDate else { return false }
  return canonical(actual.path) == bundle && canonical(binary.path) == executable &&
    abs(date.timeIntervalSince1970 - launched.timeIntervalSince1970) < 0.001
}

do {
  let args = CommandLine.arguments
  let env = ProcessInfo.processInfo.environment
  guard args.count == 4, env["GITHUB_ACTIONS"] == "true", let runner = env["RUNNER_TEMP"] else {
    throw reject("Requires clean GitHub macOS CI; no Desktop was launched")
  }
  let resources = canonical(args[1]), output = canonical(args[2]), script = canonical(args[3])
  let runnerRoot = canonical(runner)
  guard resources.hasPrefix(runnerRoot + "/"), output.hasPrefix(runnerRoot + "/"),
        URL(fileURLWithPath: output).lastPathComponent.hasPrefix("dsh-native-") else {
    throw reject("Resources and evidence must be owned by this clean runner")
  }
  let bundle = canonical(resources + "/desktop/DeepSeek Harness.app")
  guard bundle.hasPrefix(runnerRoot + "/"), script.hasSuffix("/macos-launcher/runtime/prepare-desktop.mjs") else {
    throw reject("Unexpected Desktop bundle or project integration script")
  }
  let manager = FileManager.default
  let executable = bundle + "/Contents/MacOS/DeepSeek Harness"
  let desktopResources = bundle + "/Contents/Resources"
  let source = URL(fileURLWithPath: desktopResources + "/dsh-source-runtime.json")
  var runtime = desktopResources + "/app/dsh"
  if manager.fileExists(atPath: source.path) {
    let metadata = try JSONSerialization.jsonObject(with: Data(contentsOf: source)) as! [String: Any]
    runtime = metadata["runtimeRoot"] as! String
  }
  var failed = 0
  var preciseCorruptFailures = 0
  for iteration in 1...5 {
    let iterationBegan = Date()
    let root = URL(fileURLWithPath: output).appendingPathComponent("direct-\(iteration)")
    try manager.createDirectory(at: root, withIntermediateDirectories: true)
    let home = root.appendingPathComponent("home").path
    let data = root.appendingPathComponent("data").path
    let preparation = Process()
    preparation.executableURL = URL(fileURLWithPath: executable)
    preparation.arguments = [script, resources, data + "/global", runtime]
    preparation.environment = env.merging(["ELECTRON_RUN_AS_NODE": "1", "DSH_HOME": home,
      "DSH_PERMISSION_MODE": "danger-full-access", "DSH_ALLOW_LAN_SETTINGS": "0"], uniquingKeysWith: { _, new in new })
    let preparationLog = root.appendingPathComponent("prepare.log")
    _ = manager.createFile(atPath: preparationLog.path, contents: nil)
    let sink = try FileHandle(forWritingTo: preparationLog)
    preparation.standardOutput = sink
    preparation.standardError = sink
    try preparation.run()
    preparation.waitUntilExit()
    try sink.close()
    var facts: [String: Any] = ["iteration": iteration, "boundary": "external-NSWorkspace",
      "parentContext": "diagnostic-process", "targetBundle": bundle,
      "prepareExit": preparation.terminationStatus,
      "preparationMs": Int(Date().timeIntervalSince(iterationBegan) * 1000)]
    guard preparation.terminationStatus == 0 else {
      facts["signal"] = "preparation-failed"
      try emit(facts, to: root.appendingPathComponent("result.json"))
      failed += 1
      continue
    }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.createsNewApplicationInstance = true
    configuration.allowsRunningApplicationSubstitution = false
    configuration.arguments = ["--user-data-dir=" + data + "/desktop-user-data"]
    configuration.environment = ["DSH_HOME": home, "DSH_PERMISSION_MODE": "danger-full-access",
      "DSH_DESKTOP_UPDATE_JOURNAL_DIR": data + "/desktop-update",
      "DSH_DESKTOP_DIAGNOSTIC_FILE": data + "/desktop-diagnostic.json"]
    facts["launchConfiguration"] = ["createsNewApplicationInstance": true,
      "allowsRunningApplicationSubstitution": false, "arguments": configuration.arguments,
      "environment": configuration.environment]
    facts["payloadDigestReference"] = "../runtime-payload.sha256"
    let began = Date()
    var completed = false
    var application: NSRunningApplication?
    var launchError: NSError?
    NSWorkspace.shared.openApplication(at: URL(fileURLWithPath: bundle), configuration: configuration) { app, error in
      DispatchQueue.main.async {
        application = app
        launchError = error as NSError?
        completed = true
      }
    }
    while !completed && Date().timeIntervalSince(began) < 15 {
      RunLoop.current.run(until: Date().addingTimeInterval(0.02))
    }
    facts["timeToSignalMs"] = Int(Date().timeIntervalSince(began) * 1000)
    facts["startedAtUnix"] = began.timeIntervalSince1970
    if let launchError {
      facts["signal"] = "native-open-failed"
      facts["actualLaunchNSError"] = errorFacts(launchError)
      if launchError.localizedDescription.contains("could not be launched because it is corrupt") { preciseCorruptFailures += 1 }
      facts["targetPid"] = NSNull()
      failed += 1
    } else if let app = application, let actualBundle = app.bundleURL,
              let actualExecutable = app.executableURL, let launched = app.launchDate,
              canonical(actualBundle.path) == bundle,
              canonical(actualExecutable.path).hasPrefix(bundle + "/Contents/MacOS/"), launched >= began {
      facts["signal"] = "native-open-succeeded"
      facts["targetPid"] = app.processIdentifier
      facts["launchDateUnix"] = launched.timeIntervalSince1970
      facts["actualExecutable"] = canonical(actualExecutable.path)
      // NSWorkspace launches are not children: no exit status can be reaped here.
      facts["actualExitStatus"] = NSNull()
      facts["exitStatusAvailability"] = "not-a-child-process"
      try emit(facts, to: root.appendingPathComponent("launch-observation.json"))
      let pid = app.processIdentifier, binary = canonical(actualExecutable.path)
      let current = NSRunningApplication(processIdentifier: pid)
      let ownershipKnown = current.map { sameIdentity($0, bundle, binary, launched) } ?? true
      let requested = ownershipKnown && (current?.terminate() ?? false)
      facts["normalTerminationRequested"] = requested
      facts["nativeLookupMissingBeforeRequest"] = current == nil
      let deadline = Date().addingTimeInterval(15)
      var exited = false, samples = 0
      if ownershipKnown {
        repeat {
          let lookup = try readOnlyCommand("/bin/kill", ["-0", String(pid)])
          let fresh = NSRunningApplication(processIdentifier: pid)
          let matches = fresh.map { sameIdentity($0, bundle, binary, launched) } ?? false
          let absent = esrch(lookup, pid)
          samples += 1
          facts["lastPidLookup"] = lookup
          facts["pidLookupState"] = absent ? "gone-ESRCH" : lookup["exit"] as? Int32 == 0 ? "exists" : "unknown"
          facts["freshApplicationObservation"] = ["pid": pid, "present": fresh != nil,
            "sameBundleExecutableLaunchDate": matches, "isTerminated": fresh?.isTerminated as Any? ?? NSNull(),
            "bundlePath": fresh?.bundleURL.map { canonical($0.path) } as Any? ?? NSNull(),
            "executablePath": fresh?.executableURL.map { canonical($0.path) } as Any? ?? NSNull(),
            "launchDateUnix": fresh?.launchDate?.timeIntervalSince1970 as Any? ?? NSNull()]
          if samples == 1 {
            facts["firstPidLookup"] = lookup
            facts["firstFreshApplicationObservation"] = facts["freshApplicationObservation"]
          }
          if fresh != nil && !matches {
            facts["cleanupFailure"] = "native-pid-identity-changed"
            break
          }
          if absent && (fresh == nil || fresh?.isTerminated == true) { exited = true; break }
          if !absent && lookup["exit"] as? Int32 != 0 {
            facts["cleanupFailure"] = "pid-lookup-unknown"
            break
          }
          RunLoop.current.run(until: min(deadline, Date().addingTimeInterval(0.05)))
        } while Date() < deadline
      } else { facts["cleanupFailure"] = "native-pid-identity-changed" }
      facts["exitObservationSamples"] = samples
      facts["observedExited"] = exited
      facts["privateRootResiduals"] = ["root": root.path,
        "receiptStat": try readOnlyCommand("/usr/bin/stat", ["-f", "%HT %z", data + "/global/.dsh-workflow/desktop/desktop-host.json"]),
        "userDataDirectoryExistsReported": manager.fileExists(atPath: data + "/desktop-user-data"),
        "updateJournalDirectoryExistsReported": manager.fileExists(atPath: data + "/desktop-update"),
        "diagnosticFileExistsReported": manager.fileExists(atPath: data + "/desktop-diagnostic.json")]
      if !exited {
        if facts["cleanupFailure"] == nil { facts["cleanupFailure"] = "normal-termination-not-observed" }
        failed += 1
      }
    } else {
      facts["signal"] = completed ? "unowned-launch-result" : "native-callback-timeout"
      facts["targetPid"] = application.map { $0.processIdentifier as Any } ?? NSNull()
      failed += 1
    }
    facts["iterationWallMs"] = Int(Date().timeIntervalSince(iterationBegan) * 1000)
    try emit(facts, to: root.appendingPathComponent("result.json"))
    if facts["cleanupFailure"] != nil || ["unowned-launch-result", "native-callback-timeout"].contains(facts["signal"] as? String ?? "") {
      throw reject("Cannot safely repeat after missing exact ownership or normal cleanup")
    }
  }
  try emit(["iterations": 5, "failedIterations": failed, "boundary": "external-NSWorkspace",
            "preciseCorruptFailures": preciseCorruptFailures, "phase1Complete": false, "note": "Launch errors require comparison with the actual Launcher parent loop"],
           to: URL(fileURLWithPath: output).appendingPathComponent("direct-summary.json"))
  exit(failed == 0 ? 0 : 1)
} catch {
  FileHandle.standardError.write(Data("DESKTOP_LAUNCH_DIAGNOSTICS_ERROR: \(error.localizedDescription)\n".utf8))
  exit(2)
}
