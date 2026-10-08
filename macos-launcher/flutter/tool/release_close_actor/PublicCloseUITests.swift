import Foundation
import XCTest
import XCUIAutomation
import AppKit
import Darwin

func physical(_ path: String) throws -> String {
  guard let value = realpath(path, nil) else { throw NSError(domain: "physical path unknown", code: Int(errno)) }
  defer { free(value) }
  return String(cString: value)
}

final class PublicCloseUITests: XCTestCase {
  func testCloseExactExistingWindow() throws {
    let env = ProcessInfo.processInfo.environment
    guard let requestedRoot = env["DSH_T09_ACTOR_ROOT"], let requestedApp = env["DSH_T09_ACTOR_APP"] else {
      throw NSError(domain: "explicit private actor context required", code: 1)
    }
    let rootPath = try physical(requestedRoot), appPath = try physical(requestedApp)
    let root = URL(fileURLWithPath: rootPath), appURL = URL(fileURLWithPath: appPath)
    let base: String
    if env["GITHUB_ACTIONS"] == "true" {
      guard env["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == nil, let requestedBase = env["RUNNER_TEMP"],
            try physical(requestedBase) == requestedBase else {
        throw NSError(domain: "physical disposable runner context required", code: 1)
      }
      base = requestedBase
    } else {
      base = "/private/tmp/dsh-launcher-local-" + String(getuid())
      guard env["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == base else {
        throw NSError(domain: "explicit local private context required", code: 1)
      }
    }
    guard rootPath == requestedRoot,
          root.deletingLastPathComponent().path == base,
          root.lastPathComponent.hasPrefix("dsh-t05-"),
          appPath == requestedApp, appPath.hasPrefix(rootPath + "/") else {
      throw NSError(domain: "canonical exact private app required", code: 1)
    }
    let attributes = try FileManager.default.attributesOfItem(atPath: root.path)
    guard (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
          (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700 else {
      throw NSError(domain: "private UID and mode required", code: 1)
    }
    func waitForFile(_ name: String) throws {
      let deadline = Date().addingTimeInterval(30)
      while !FileManager.default.fileExists(atPath: root.appendingPathComponent(name).path) && Date() < deadline {
        Thread.sleep(forTimeInterval: 0.1)
      }
      guard FileManager.default.fileExists(atPath: root.appendingPathComponent(name).path) else {
        throw NSError(domain: "actor gate unknown", code: 1)
      }
    }
    try Data("ready".utf8).write(to: root.appendingPathComponent("public-close-actor-ready"), options: .atomic)
    try waitForFile("public-close-request")
    let ledger = try JSONSerialization.jsonObject(with: Data(contentsOf: root.appendingPathComponent("release-window-identity.json"))) as! [String: Any]
    let pid = (ledger["pid"] as! NSNumber).int32Value
    var info = proc_bsdinfo()
    let running = NSRunningApplication(processIdentifier: pid)
    guard proc_pidinfo(pid, PROC_PIDTBSDINFO, 0, &info, Int32(MemoryLayout<proc_bsdinfo>.size)) == MemoryLayout<proc_bsdinfo>.size,
          info.pbi_pid == UInt32(pid), info.pbi_ppid == (ledger["parentPid"] as! NSNumber).uint32Value,
          info.pbi_uid == getuid(), info.pbi_uid == (ledger["uid"] as! NSNumber).uint32Value,
          info.pbi_start_tvsec == (ledger["kernelSeconds"] as! NSNumber).uint64Value,
          info.pbi_start_tvusec == (ledger["kernelMicroseconds"] as! NSNumber).uint64Value,
          let bundlePath = running?.bundleURL?.path, try physical(bundlePath) == appPath,
          let executablePath = running?.executableURL?.path,
          try physical(executablePath) == ledger["executable"] as! String else {
      throw NSError(domain: "current physical app identity differs", code: 1)
    }
    let app = XCUIApplication(url: appURL)
    guard app.state == .runningForeground || app.state == .runningBackground, app.windows.count == 1 else {
      throw NSError(domain: "one already running window required", code: 1)
    }
    let close = app.windows.element(boundBy: 0).buttons[XCUIIdentifierCloseWindow]
    guard close.exists else { throw NSError(domain: "public close button unavailable", code: 1) }
    close.click()
    try Data("closed".utf8).write(to: root.appendingPathComponent("public-close-ack"), options: .atomic)
    // Keep XCTest alive until the driver has completed SDK recovery and normal quit.
    try waitForFile("public-close-driver-complete")
  }
}
