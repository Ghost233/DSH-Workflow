import Cocoa
import Carbon
import Darwin

func canonical(_ path: String) -> String? {
  guard let value = realpath(path, nil) else { return nil }
  defer { free(value) }
  return String(cString: value)
}

func emit(_ facts: [String: Any]) {
  if let bytes = try? JSONSerialization.data(withJSONObject: facts, options: [.sortedKeys]) {
    FileHandle.standardOutput.write(bytes + Data([10]))
  }
}

do {
  let expired = CommandLine.arguments.count == 6 && CommandLine.arguments[5] == "--expired"
  guard (CommandLine.arguments.count == 5 || expired),
        let root = canonical(CommandLine.arguments[1]), root == CommandLine.arguments[1],
        let pid = Int32(CommandLine.arguments[2]),
        let seconds = UInt64(CommandLine.arguments[3]),
        let microseconds = UInt64(CommandLine.arguments[4]) else {
    throw NSError(domain: "reopen-probe-arguments", code: 1)
  }
  let parent = URL(fileURLWithPath: root).deletingLastPathComponent().path
  let environment = ProcessInfo.processInfo.environment
  let attributes = try FileManager.default.attributesOfItem(atPath: root)
  guard environment["GITHUB_ACTIONS"] != "true",
        environment["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == parent,
        parent == "/private/tmp/dsh-launcher-local-" + String(getuid()),
        URL(fileURLWithPath: root).lastPathComponent.hasPrefix("dsh-s02-"),
        (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
        (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700 else {
    throw NSError(domain: "reopen-probe-root", code: 2)
  }
  let bundle = root + "/resources/desktop/DeepSeek Harness.app"
  guard canonical(bundle) == bundle,
        let executable = Bundle(url: URL(fileURLWithPath: bundle))?.executableURL.flatMap({ canonical($0.path) }) else {
    throw NSError(domain: "reopen-probe-bundle", code: 3)
  }
  let record = URL(fileURLWithPath: root + "/reopen-event-known-target.json")
  if expired {
    let saved = try JSONSerialization.jsonObject(with: Data(contentsOf: record)) as? [String: NSNumber]
    guard saved?["pid"]?.int32Value == pid, saved?["seconds"]?.uint64Value == seconds,
          saved?["microseconds"]?.uint64Value == microseconds,
          NSRunningApplication(processIdentifier: pid) == nil,
          kill(pid, 0) == -1, errno == ESRCH else {
      throw NSError(domain: "reopen-probe-expired-identity", code: 5)
    }
  } else {
    var identity = proc_bsdinfo()
    let size = MemoryLayout<proc_bsdinfo>.stride
    guard let application = NSRunningApplication(processIdentifier: pid),
          !application.isTerminated,
          application.bundleURL.flatMap({ canonical($0.path) }) == bundle,
          application.executableURL.flatMap({ canonical($0.path) }) == executable,
          proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &identity, Int32(size)) == Int32(size),
          identity.pbi_uid == getuid(), identity.pbi_pid == UInt32(pid),
          identity.pbi_start_tvsec == seconds, identity.pbi_start_tvusec == microseconds else {
      throw NSError(domain: "reopen-probe-identity", code: 4)
    }
    try JSONSerialization.data(withJSONObject: ["pid": pid, "seconds": seconds,
      "microseconds": microseconds]).write(to: record, options: [.atomic])
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: record.path)
  }
  let event = NSAppleEventDescriptor(eventClass: AEEventClass(kInternetEventClass),
    eventID: AEEventID(kAEGetURL), targetDescriptor: NSAppleEventDescriptor(processIdentifier: pid),
    returnID: AEReturnID(kAutoGenerateReturnID), transactionID: AETransactionID(kAnyTransactionID))
  event.setParam(NSAppleEventDescriptor(string: "dsh://open"), forKeyword: AEKeyword(keyDirectObject))
  let options = NSAppleEventDescriptor.SendOptions(rawValue: UInt(
    kAENoReply | kAENeverInteract | kAEDontReconnect | kAEDoNotPromptForUserConsent))
  do {
    _ = try event.sendEvent(options: options, timeout: 1)
    emit(["sent": true, "expiredTarget": expired, "pid": pid, "kernelStartSeconds": seconds,
      "kernelStartMicroseconds": microseconds, "targetKind": "processIdentifier",
      "url": "dsh://open", "automaticReconnect": false, "userInteraction": false,
      "permissionPrompt": false])
  } catch let error as NSError {
    emit(["sent": false, "expiredTarget": expired, "pid": pid, "targetKind": "processIdentifier",
      "errorDomain": error.domain, "errorCode": error.code,
      "automaticReconnect": false, "userInteraction": false, "permissionPrompt": false])
    exit(1)
  }
} catch let error as NSError {
  emit(["sent": false, "errorDomain": error.domain, "errorCode": error.code])
  exit(2)
}
