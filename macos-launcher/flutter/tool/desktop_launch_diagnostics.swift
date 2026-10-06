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
      let requested = app.isTerminated || app.terminate()
      facts["normalTerminationRequested"] = requested
      let deadline = Date().addingTimeInterval(15)
      while !app.isTerminated && Date() < deadline {
        RunLoop.current.run(until: Date().addingTimeInterval(0.05))
      }
      facts["observedExited"] = app.isTerminated
      if !requested || !app.isTerminated {
        facts["cleanupFailure"] = "normal-termination-not-observed"
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
