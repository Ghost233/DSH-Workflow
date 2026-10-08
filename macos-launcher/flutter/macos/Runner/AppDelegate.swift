import Cocoa
import FlutterMacOS
import ServiceManagement
import Security
import Darwin

@main
class AppDelegate: FlutterAppDelegate {
  private var statusItem: NSStatusItem?
  private var channel: FlutterMethodChannel?
  #if DEBUG
  private var lastOpenedUrl: String?
  private var entryGateToken: String?
  // TEMP cleanup diagnosis, exposed only in DEBUG state.
  private var desktopQuitObservation: [String: Any] = [:]
  private var desktopWindowObservation: [String: Any] = [:]
  private var coldCallerObservation: [String: Any] = [:]
  #endif
  private var instanceLock: Int32 = -1
  private var instanceClaimed = false
  private var quitApproved = false
  private var quitRequested = false
  private var reopenObserver: NSObjectProtocol?
  private var openedDesktopPid: pid_t?
  private var desktopIdentity: (pid_t, UInt64, UInt64)?
  private var coldDesktopIdentity: (pid_t, UInt64, UInt64)?
  private var coldDesktopObserver: NSObjectProtocol?
  private var coldFocusObserver: NSObjectProtocol?
  private var coldFocusRestoreEligible = false
  private var coldForegroundIdentity: (pid: pid_t, seconds: UInt64, microseconds: UInt64, executable: String, bundle: String)?
  private var coldInputCounts: [UInt32] = []
  private var coldRecoveryObserver: NSKeyValueObservation?
  private var desktopLaunchObserver: NSKeyValueObservation?
  private var desktopHiddenObserver: NSKeyValueObservation?
  private var reopen: Notification.Name {
    let base = "com.ghostagent.dsh-workflow-launcher.reopen"
    return Notification.Name(testRoot == nil ? base : base + ".test." + dataRoot.path)
  }

  private var testRoot: URL? {
    #if DEBUG
    if let root = ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_ROOT"] ?? Bundle.main.object(forInfoDictionaryKey: "DSHLauncherTestRoot") as? String {
      return URL(fileURLWithPath: root, isDirectory: true)
    }
    #endif
    return nil
  }

  #if DEBUG
  // Only the external T06 driver can hold this private candidate's real entry
  // action. Release performs the actual AppKit mutation; timeout/cancel fail.
  private var entryProbeRoot: URL? {
    guard let root = testRoot, root.lastPathComponent == "data",
          root.deletingLastPathComponent().lastPathComponent.hasPrefix("dsh-t06-"),
          root.deletingLastPathComponent().deletingLastPathComponent().path == "/private/tmp",
          (try? String(contentsOf: root.appendingPathComponent("entry-probe-owner"), encoding: .utf8)) ==
            String(ProcessInfo.processInfo.processIdentifier) else { return nil }
    return root
  }

  private func traceEntry(_ phase: String, item: NSStatusItem, managed: Bool) {
    guard let root = entryProbeRoot else { return }
    let path = root.appendingPathComponent("entry-native.jsonl")
    guard let data = try? JSONSerialization.data(withJSONObject: [
      "phase": phase, "token": entryGateToken as Any? ?? NSNull(),
      "managed": managed, "entryVisible": item.isVisible,
      "uptime": ProcessInfo.processInfo.systemUptime,
      "pid": ProcessInfo.processInfo.processIdentifier
    ]) else { return }
    if !FileManager.default.fileExists(atPath: path.path) {
      _ = FileManager.default.createFile(atPath: path.path, contents: nil, attributes: [.posixPermissions: 0o600])
    }
    guard let file = try? FileHandle(forWritingTo: path) else { return }
    defer { try? file.close() }
    do { try file.seekToEnd(); try file.write(contentsOf: data + Data([10])) } catch {}
  }

  private func awaitEntryRelease(_ item: NSStatusItem, root: URL, token: String,
                                 deadline: TimeInterval, result: @escaping FlutterResult) {
    if (try? String(contentsOf: root.appendingPathComponent("entry-release"), encoding: .utf8)) == token {
      item.isVisible = false
      traceEntry("released-applied", item: item, managed: true)
      result(!item.isVisible)
    } else if (try? String(contentsOf: root.appendingPathComponent("entry-cancel"), encoding: .utf8)) == token {
      traceEntry("cancelled", item: item, managed: true)
      result(FlutterError(code: "entry_gate_cancelled", message: "Owned entry action cancelled", details: nil))
    } else if ProcessInfo.processInfo.systemUptime >= deadline {
      traceEntry("timeout", item: item, managed: true)
      result(FlutterError(code: "entry_gate_timeout", message: "Owned entry action release timed out", details: nil))
    } else {
      DispatchQueue.main.asyncAfter(deadline: .now() + .milliseconds(20)) { [weak self] in
        self?.awaitEntryRelease(item, root: root, token: token, deadline: deadline, result: result)
      }
    }
  }
  #endif

  // Real system mutations are restricted to a disposable GitHub macOS runner.
  // The ordinary isolated Debug profile never reads or changes login items.
  private var systemBoundaryTest: Bool {
    #if DEBUG
    let environment = ProcessInfo.processInfo.environment
    if environment["GITHUB_ACTIONS"] == "true", environment["DSH_LAUNCHER_SYSTEM_BOUNDARY_CI"] == "1",
       let runner = environment["RUNNER_TEMP"], let root = testRoot {
      return root.standardizedFileURL.path.hasPrefix(URL(fileURLWithPath: runner, isDirectory: true).standardizedFileURL.path + "/")
    }
    #endif
    return false
  }

  private var ownQuitTraceEnabled: Bool {
    #if DEBUG
    let environment = ProcessInfo.processInfo.environment
    guard let root = testRoot, root.lastPathComponent == "data" else { return false }
    let requestedCandidate = root.deletingLastPathComponent()
    let requestedSocket = URL(fileURLWithPath: environment["DSH_LAUNCHER_TEST_SOCKET"] ??
      requestedCandidate.appendingPathComponent("manager/sdk-v1.sock").path)
    if environment["GITHUB_ACTIONS"] == "true", environment["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"] == nil,
       let runner = environment["RUNNER_TEMP"] {
      let candidate = requestedCandidate.resolvingSymlinksInPath().standardizedFileURL
      let runnerRoot = URL(fileURLWithPath: runner, isDirectory: true).resolvingSymlinksInPath().standardizedFileURL
      let socket = requestedSocket.resolvingSymlinksInPath().standardizedFileURL
      return root.standardizedFileURL.path == candidate.appendingPathComponent("data").path &&
        candidate.lastPathComponent.hasPrefix("dsh-") &&
        candidate.deletingLastPathComponent().path == runnerRoot.path &&
        socket.path == candidate.appendingPathComponent("manager/sdk-v1.sock").path
    }
    guard environment["GITHUB_ACTIONS"] != "true",
          let local = environment["DSH_LAUNCHER_LOCAL_ACCEPTANCE_ROOT"],
          local == "/private/tmp/dsh-launcher-local-" + String(getuid()),
          let localPhysical = realpath(local, nil),
          let candidatePhysical = realpath(requestedCandidate.path, nil),
          let socketPhysical = realpath(requestedSocket.deletingLastPathComponent().path, nil) else { return false }
    defer { free(localPhysical); free(candidatePhysical); free(socketPhysical) }
    guard String(cString: localPhysical) == local,
          String(cString: candidatePhysical) == requestedCandidate.path,
          String(cString: socketPhysical) == requestedSocket.deletingLastPathComponent().path,
          (try? FileManager.default.destinationOfSymbolicLink(atPath: requestedSocket.path)) == nil,
          let attributes = try? FileManager.default.attributesOfItem(atPath: local),
          (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
          (attributes[.posixPermissions] as? NSNumber)?.intValue == 0o700,
          let candidateAttributes = try? FileManager.default.attributesOfItem(atPath: requestedCandidate.path),
          (candidateAttributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid(),
          (candidateAttributes[.posixPermissions] as? NSNumber)?.intValue == 0o700 else { return false }
    return root.path == requestedCandidate.appendingPathComponent("data").path &&
      requestedCandidate.lastPathComponent.hasPrefix("dsh-") &&
      requestedCandidate.deletingLastPathComponent().path == local &&
      requestedSocket.path == requestedCandidate.appendingPathComponent("manager/sdk-v1.sock").path
    #else
    return false
    #endif
  }

  private var dataRoot: URL {
    if let root = testRoot { return root }
    return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
      .appendingPathComponent("DSH Workflow", isDirectory: true)
  }

  // Called by MainFlutterWindow before creating the engine, so a duplicate
  // never starts Dart, SDK connection or password-triggered business work.
  func claimInstance() -> Bool {
    if instanceClaimed { return true }
    if quitApproved { return false }
    do { try FileManager.default.createDirectory(at: dataRoot, withIntermediateDirectories: true) }
    catch { quitApproved = true; NSApp.terminate(nil); return false }
    instanceLock = open(dataRoot.appendingPathComponent("launcher-instance.lock").path, O_CREAT | O_RDWR | O_CLOEXEC, 0o600)
    guard instanceLock >= 0, flock(instanceLock, LOCK_EX | LOCK_NB) == 0 else {
      DistributedNotificationCenter.default().postNotificationName(reopen, object: dataRoot.path, userInfo: nil, deliverImmediately: true)
      quitApproved = true
      NSApp.terminate(nil)
      return false
    }
    instanceClaimed = true
    return true
  }

  override func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    guard claimInstance() else { return }
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem?.button?.image = NSImage(systemSymbolName: "bolt.circle", accessibilityDescription: "DSH Workflow")
    let menu = NSMenu()
    menu.addItem(NSMenuItem(title: "打开 DSH", action: #selector(openGlobal), keyEquivalent: ""))
    menu.addItem(NSMenuItem(title: "管理…", action: #selector(showWindow), keyEquivalent: ""))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "退出启动器", action: #selector(requestQuit), keyEquivalent: "q"))
    for item in menu.items { item.target = self }
    statusItem?.menu = menu
    reopenObserver = DistributedNotificationCenter.default().addObserver(forName: reopen, object: dataRoot.path, queue: .main) { [weak self] _ in
      self?.showWindow()
    }
    showWindow()
    super.applicationDidFinishLaunching(notification)
  }

  func installChannel(_ messenger: FlutterBinaryMessenger) {
    let bridge = FlutterMethodChannel(name: "dsh-workflow/native", binaryMessenger: messenger)
    channel = bridge
    bridge.setMethodCallHandler { [weak self] call, result in
      guard let self else { result(FlutterError(code: "closed", message: "Application closed", details: nil)); return }
      do {
        switch call.method {
        case "environment":
          guard let resources = Bundle.main.resourceURL else { throw self.failure("应用资源目录不可用") }
          let preferences = self.loadPreferences()
          result([
            "resources": self.testRoot == nil ? resources.path :
              ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_RESOURCES"] ?? self.dataRoot.deletingLastPathComponent().appendingPathComponent("missing-runtime").path,
            "dataRoot": self.dataRoot.path,
            "testSocket": self.testRoot == nil ? NSNull() :
              (ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_SOCKET"] ?? self.dataRoot.deletingLastPathComponent().appendingPathComponent("manager/sdk-v1.sock").path) as Any,
            "home": self.testRoot == nil ?
              ProcessInfo.processInfo.environment["DSH_HOME"] ?? NSHomeDirectory() + "/.dsh" :
              ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_HOME"] ?? self.dataRoot.appendingPathComponent(".dsh").path,
            "testReleaseEndpoint": self.testRoot == nil ? NSNull() :
              ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_RELEASE_ENDPOINT"] as Any,
            "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知",
            "fullAccess": preferences["fullAccess"] as? Bool ?? true,
            "allowLanSettings": preferences["allowLanSettings"] as? Bool ?? false,
            "hideWindowOnStart": preferences["hideWindowOnStart"] as? Bool ?? false,
            "password": self.loadPassword() as Any, "loginStatus": self.loginStatus(),
          ])
        case "showWindow": self.showWindow(); result(nil)
        #if DEBUG
        case "debugState": result(["entryVisible": self.statusItem?.isVisible ?? false,
          "windowVisible": self.mainFlutterWindow?.isVisible ?? false,
          "windowKey": self.mainFlutterWindow?.isKeyWindow ?? false,
          "appActive": NSApp.isActive,
          "windowOcclusionVisible": self.mainFlutterWindow?.occlusionState.contains(.visible) ?? false,
          "windowNumber": self.mainFlutterWindow?.windowNumber ?? 0,
          "windowWidth": self.mainFlutterWindow?.frame.width ?? 0,
          "windowHeight": self.mainFlutterWindow?.frame.height ?? 0,
          "pid": ProcessInfo.processInfo.processIdentifier,
          "isolated": self.testRoot != nil, "dataRoot": self.dataRoot.path,
          "ownQuitTraceEnabled": self.ownQuitTraceEnabled,
          "openedDesktopPid": self.openedDesktopPid as Any,
          "desktopQuitObservation": self.desktopQuitObservation,
          "desktopWindowObservation": self.desktopWindowObservation,
          "coldCallerObservation": self.coldCallerObservation,
          "foregroundObservation": self.foregroundObservation(),
          "lastOpenedUrl": self.lastOpenedUrl as Any,
          "urlOpenMode": self.systemBoundaryTest ? "NSWorkspace" : "guarded",
          "systemBoundaryTest": self.systemBoundaryTest, "loginStatus": self.loginStatus()])
        case "debugWindow":
          guard self.testRoot != nil, let action = call.arguments as? String else { throw self.failure("需要隔离测试环境") }
          switch action {
          case "close": self.mainFlutterWindow?.performClose(nil)
          case "ownEntry":
            guard let item = self.statusItem?.menu?.item(withTitle: "管理…"), let action = item.action else { throw self.failure("管理菜单入口不可用") }
            NSApp.sendAction(action, to: item.target, from: item)
          case "quit": NSApp.terminate(nil)
          case "quitDesktop":
            var facts: [String: Any] = ["expectedPid": NSNull(), "lookupFound": false,
                                      "accepted": NSNull(), "hasTerminated": NSNull()]
            if let pid = self.openedDesktopPid {
              facts["expectedPid"] = Int(pid)
              if let desktop = NSRunningApplication(processIdentifier: pid) {
                facts["lookupFound"] = true
                let accepted = desktop.terminate()
                facts["accepted"] = accepted
                facts["hasTerminated"] = desktop.isTerminated
                self.desktopQuitObservation = facts
                guard accepted else { throw self.failure("测试 Desktop 无法退出") }
              }
            }
            self.desktopQuitObservation = facts
          case "minimum":
            if let window = self.mainFlutterWindow { window.setFrame(NSRect(origin: window.frame.origin, size: window.minSize), display: true) }
          default: throw self.failure("无效窗口测试动作")
          }
          result(nil)
        #endif
        case "setEntryManaged":
          guard let managed = call.arguments as? Bool, let item = self.statusItem else { throw self.failure("菜单入口尚未就绪") }
          #if DEBUG
          if managed, let root = self.entryProbeRoot,
             let token = try? String(contentsOf: root.appendingPathComponent("entry-hold"), encoding: .utf8),
             !token.isEmpty, token.count <= 80 {
            self.entryGateToken = token
            self.traceEntry("held", item: item, managed: true)
            self.awaitEntryRelease(item, root: root, token: token,
              deadline: ProcessInfo.processInfo.systemUptime + (token.hasPrefix("timeout-") ? 3 : 12), result: result)
            return
          }
          #endif
          item.isVisible = !managed
          #if DEBUG
          self.traceEntry("applied", item: item, managed: managed)
          #endif
          result(item.isVisible == !managed)
        case "savePreferences":
          guard let values = call.arguments as? [String: Any], let access = values["fullAccess"] as? Bool,
                let lan = values["allowLanSettings"] as? Bool,
                let hide = values["hideWindowOnStart"] as? Bool else { throw self.failure("无效设置") }
          try self.savePreferences(["fullAccess": access, "allowLanSettings": lan, "hideWindowOnStart": hide])
          result(nil)
        case "savePassword":
          guard let password = call.arguments as? String, !password.isEmpty, password.utf8.count <= 1024 else {
            throw self.failure("密码须为 1–1024 字节")
          }
          try self.persistPassword(password); result(nil)
        case "getLoginStatus": result(self.loginStatus())
        case "setLoginEnabled":
          if self.testRoot != nil && !self.systemBoundaryTest { throw self.failure("测试环境不更改系统登录项") }
          guard let enabled = call.arguments as? Bool else { throw self.failure("无效登录启动设置") }
          if #available(macOS 13, *) {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            result(self.loginStatus())
          } else { throw self.failure("登录启动需要 macOS 13 或更新版本") }
        case "openUrl":
          guard let text = call.arguments as? String, let url = URL(string: text), ["http", "https"].contains(url.scheme ?? "") else {
            throw self.failure("无效网页地址")
          }
          #if DEBUG
          if self.testRoot != nil && !self.systemBoundaryTest {
            self.lastOpenedUrl = text
            result(nil)
            return
          }
          #endif
          guard NSWorkspace.shared.open(url) else { throw self.failure("系统未能打开网页") }
          #if DEBUG
          self.lastOpenedUrl = text
          #endif
          result(nil)
        case "desktopRunning", "hideDesktop", "showDesktop":
          guard let path = call.arguments as? String else { throw self.failure("无效 Desktop 路径") }
          let application = try self.runningDesktop(path)
          if call.method == "desktopRunning" {
            result(application != nil); return
          }
          self.releaseColdDesktop("explicit-window-action")
          guard let application else { throw self.failure("Desktop 未运行，请先启动；仅显示不会启动 Desktop。") }
          if call.method == "hideDesktop" {
            guard application.isHidden || application.hide() else { throw self.failure("Desktop 隐藏失败") }
          } else {
            let unhideAccepted = !application.isHidden || application.unhide()
            FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=explicit-unhide-return accepted=\(unhideAccepted) pid=\(application.processIdentifier)\n".utf8))
            guard application.activate(options: [.activateAllWindows]) else { throw self.failure("Desktop 激活失败") }
          }
          _ = try self.runningDesktop(path)
          result(nil)
        case "openDesktop":
          guard let values = call.arguments as? [String: Any], let path = values["path"] as? String,
                let environment = values["environment"] as? [String: String],
                let hidden = values["hidden"] as? Bool else { throw self.failure("无效 Desktop 路径") }
          if try self.runningDesktop(path) != nil { self.releaseColdDesktop("reuse"); result(nil); return }
          let app = URL(fileURLWithPath: path)
          let configuration = NSWorkspace.OpenConfiguration()
          configuration.environment = environment
          configuration.activates = !hidden
          configuration.hides = hidden
          #if DEBUG
          if self.testRoot != nil {
            configuration.createsNewApplicationInstance = true
            configuration.allowsRunningApplicationSubstitution = false
            configuration.arguments = ["--user-data-dir=" + self.dataRoot.appendingPathComponent("desktop-user-data").path]
            configuration.environment["DSH_DESKTOP_UPDATE_JOURNAL_DIR"] = self.dataRoot.appendingPathComponent("desktop-update").path
            configuration.environment["DSH_DESKTOP_DIAGNOSTIC_FILE"] = self.dataRoot.appendingPathComponent("desktop-diagnostic.json").path
          }
          #endif
          if hidden {
            let caller = ProcessInfo.processInfo.processIdentifier
            let foreground = NSWorkspace.shared.frontmostApplication
            self.coldForegroundIdentity = foreground.flatMap { try? self.foregroundIdentity($0) }
            self.coldFocusRestoreEligible = self.coldForegroundIdentity != nil && foreground?.isActive == true
            self.coldInputCounts = self.userInputCounts()
            #if DEBUG
            self.coldCallerObservation = ["callerPid": caller, "foregroundPid": foreground?.processIdentifier as Any? ?? NSNull(),
              "captureUptime": ProcessInfo.processInfo.systemUptime, "restoreSelfEligible": NSApp.isActive && foreground?.processIdentifier == caller,
              "restoreForegroundEligible": self.coldFocusRestoreEligible, "inputCountsBefore": self.coldInputCounts]
            #endif
            FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-caller-captured pid=\(caller) eligible=\(self.coldFocusRestoreEligible) uptime=\(ProcessInfo.processInfo.systemUptime)\n".utf8))
            self.coldFocusObserver = NSWorkspace.shared.notificationCenter.addObserver(
              forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
              guard let self, let activated = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
              if activated.processIdentifier != caller && activated.bundleURL?.resolvingSymlinksInPath().path != app.resolvingSymlinksInPath().path && self.userInputCounts() != self.coldInputCounts {
                self.coldFocusRestoreEligible = false
                #if DEBUG
                self.coldCallerObservation["otherForegroundPid"] = activated.processIdentifier
                self.coldCallerObservation["otherForegroundUptime"] = ProcessInfo.processInfo.systemUptime
                #endif
                FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-caller-interrupted foregroundPid=\(activated.processIdentifier) uptime=\(ProcessInfo.processInfo.systemUptime)\n".utf8))
              }
            }
          }
          NSWorkspace.shared.openApplication(at: app, configuration: configuration) { application, error in
            DispatchQueue.main.async {
              if let error { self.releaseColdDesktop("open-error"); result(FlutterError(code: "open-failed", message: error.localizedDescription, details: nil)) }
              else {
                do {
                  guard let opened = try self.runningDesktop(path),
                        opened.processIdentifier == application?.processIdentifier else {
                    throw self.failure("Desktop 启动身份未知")
                  }
                  if hidden {
                    self.coldDesktopIdentity = self.desktopIdentity
                    self.coldDesktopObserver = NSWorkspace.shared.notificationCenter.addObserver(
                      forName: NSWorkspace.didUnhideApplicationNotification, object: nil, queue: .main) { [weak self] note in
                      guard let self, let target = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication,
                            target.processIdentifier == self.coldDesktopIdentity?.0 else { return }
                      do {
                        let current = try self.checkedColdDesktop(path)
                        self.coldRecoveryObserver?.invalidate()
                        self.coldRecoveryObserver = current.observe(\.isHidden, options: [.new]) { [weak self] _, _ in
                          guard let self, current.isHidden else { return }
                          do {
                            _ = try self.checkedColdDesktop(path)
                            let inputCountsNow = self.userInputCounts()
                            let unchanged = inputCountsNow == self.coldInputCounts
                            #if DEBUG
                            self.coldCallerObservation["inputCountsAtRecovery"] = inputCountsNow
                            self.coldCallerObservation["inputUnchangedAtRecovery"] = unchanged
                            self.coldCallerObservation["hiddenRecoveryUptime"] = ProcessInfo.processInfo.systemUptime
                            #endif
                            if self.coldFocusRestoreEligible && unchanged {
                              guard let captured = self.coldForegroundIdentity,
                                    let target = NSRunningApplication(processIdentifier: captured.pid) else { throw self.failure("原前台身份未知") }
                              let actual = try self.foregroundIdentity(target)
                              guard actual == captured else { throw self.failure("原前台身份已改变") }
                              if captured.pid == ProcessInfo.processInfo.processIdentifier && self.mainFlutterWindow?.isVisible == true {
                                self.mainFlutterWindow?.makeKeyAndOrderFront(nil)
                              }
                              let accepted = target.activate(options: [.activateAllWindows])
                              #if DEBUG
                              self.coldCallerObservation["restoreForegroundPid"] = captured.pid
                              self.coldCallerObservation["restoreForegroundAccepted"] = accepted
                              #endif
                              FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-caller-restore-requested pid=\(captured.pid) accepted=\(accepted) inputUnchanged=true uptime=\(ProcessInfo.processInfo.systemUptime)\n".utf8))
                            } else {
                              FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-caller-restore-skipped inputUnchanged=\(unchanged) uptime=\(ProcessInfo.processInfo.systemUptime)\n".utf8))
                            }
                          } catch { self.releaseColdDesktop("identity-unknown") }
                          self.coldRecoveryObserver?.invalidate(); self.coldRecoveryObserver = nil
                        }
                        if !current.isHidden && !current.hide() {
                          FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-hide-refused\n".utf8))
                        }
                      } catch { self.releaseColdDesktop("identity-unknown") }
                    }
                    var completed = false
                    let completeWhenHidden = { [weak self] in
                      guard let self, !completed, opened.isHidden else { return }
                      completed = true
                      do {
                        guard try self.checkedColdDesktop(path).isHidden else { throw self.failure("Desktop 隐藏状态未知") }
                        result(nil)
                      } catch {
                        self.releaseColdDesktop("open-error")
                        result(FlutterError(code: "open-failed", message: error.localizedDescription, details: nil))
                      }
                      self.desktopLaunchObserver?.invalidate(); self.desktopLaunchObserver = nil
                      self.desktopHiddenObserver?.invalidate(); self.desktopHiddenObserver = nil
                    }
                    self.desktopHiddenObserver = opened.observe(\.isHidden, options: [.initial, .new]) { _, _ in completeWhenHidden() }
                    self.desktopLaunchObserver = opened.observe(\.isFinishedLaunching, options: [.initial, .new]) { [weak self] _, _ in
                      guard let self, opened.isFinishedLaunching, !completed else { return }
                      do {
                        let current = try self.checkedColdDesktop(path)
                        let accepted = current.isHidden || current.hide()
                        FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-hide-return accepted=\(accepted)\n".utf8))
                        completeWhenHidden()
                      } catch {
                        completed = true; self.releaseColdDesktop("open-error")
                        self.desktopHiddenObserver?.invalidate(); self.desktopHiddenObserver = nil
                        result(FlutterError(code: "open-failed", message: error.localizedDescription, details: nil))
                      }
                    }
                    if completed {
                      self.desktopLaunchObserver?.invalidate(); self.desktopLaunchObserver = nil
                      self.desktopHiddenObserver?.invalidate(); self.desktopHiddenObserver = nil
                    }
                  } else { result(nil) }
                } catch { result(FlutterError(code: "open-failed", message: error.localizedDescription, details: nil)) }
              }
            }
          }
        case "finishQuit":
          if self.ownQuitTraceEnabled {
            FileHandle.standardError.write(Data("OWN_QUIT_TRACE phase=native-finish-received\n".utf8))
          }
          self.quitApproved = true; result(nil); NSApp.terminate(nil)
        default: result(FlutterMethodNotImplemented)
        }
      } catch { result(FlutterError(code: "native-error", message: error.localizedDescription, details: nil)) }
    }
  }

  // A window action targets one current-user instance of this exact packaged
  // Desktop. A private Debug copy cannot substitute a user's installed app.
  private func runningDesktop(_ path: String) throws -> NSRunningApplication? {
    let requested = URL(fileURLWithPath: path).resolvingSymlinksInPath()
    let resources: URL
    if testRoot != nil {
      resources = URL(fileURLWithPath: ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_RESOURCES"] ??
        dataRoot.deletingLastPathComponent().appendingPathComponent("missing-runtime").path)
    } else {
      guard let packaged = Bundle.main.resourceURL else { throw failure("应用资源目录不可用") }
      resources = packaged
    }
    let expected = resources.appendingPathComponent("desktop/DeepSeek Harness.app").resolvingSymlinksInPath()
    guard requested.path == expected.path,
          let executable = Bundle(url: expected)?.executableURL?.resolvingSymlinksInPath() else {
      throw failure("Desktop 路径身份未知")
    }
    let matches = NSWorkspace.shared.runningApplications.filter {
      !$0.isTerminated && $0.bundleURL?.resolvingSymlinksInPath().path == expected.path
    }
    guard matches.count <= 1 else { throw failure("Desktop 有多个匹配实例，窗口身份未知") }
    guard let application = matches.first else { return nil }
    var identity = proc_bsdinfo()
    let size = MemoryLayout<proc_bsdinfo>.stride
    guard application.executableURL?.resolvingSymlinksInPath().path == executable.path,
          proc_pidinfo(application.processIdentifier, PROC_PIDTBSDINFO, 0, &identity, Int32(size)) == Int32(size),
          identity.pbi_uid == getuid(), identity.pbi_pid == UInt32(application.processIdentifier) else {
      throw failure("Desktop 进程身份未知")
    }
    openedDesktopPid = application.processIdentifier
    desktopIdentity = (application.processIdentifier, identity.pbi_start_tvsec, identity.pbi_start_tvusec)
    #if DEBUG
    desktopWindowObservation = ["pid": application.processIdentifier,
      "uid": identity.pbi_uid, "parentPid": identity.pbi_ppid,
      "kernelStartSeconds": identity.pbi_start_tvsec, "kernelStartMicroseconds": identity.pbi_start_tvusec,
      "bundle": expected.path, "executable": executable.path,
      "hidden": application.isHidden, "active": application.isActive]
    #endif
    return application
  }

  private func checkedColdDesktop(_ path: String) throws -> NSRunningApplication {
    guard let captured = coldDesktopIdentity, let current = try runningDesktop(path),
          let identity = desktopIdentity, identity.0 == captured.0,
          identity.1 == captured.1, identity.2 == captured.2 else {
      throw failure("Desktop 后台启动身份已改变")
    }
    return current
  }

  private func foregroundIdentity(_ application: NSRunningApplication) throws -> (pid: pid_t, seconds: UInt64, microseconds: UInt64, executable: String, bundle: String) {
    var identity = proc_bsdinfo()
    let size = MemoryLayout<proc_bsdinfo>.stride
    guard !application.isTerminated,
          proc_pidinfo(application.processIdentifier, PROC_PIDTBSDINFO, 0, &identity, Int32(size)) == Int32(size),
          identity.pbi_uid == getuid(), identity.pbi_pid == UInt32(application.processIdentifier),
          let executable = application.executableURL?.resolvingSymlinksInPath().path,
          let bundle = application.bundleURL?.resolvingSymlinksInPath().path else { throw failure("原前台物理身份未知") }
    return (application.processIdentifier, identity.pbi_start_tvsec, identity.pbi_start_tvusec, executable, bundle)
  }

  #if DEBUG
  private func foregroundObservation() -> [String: Any] {
    let cached = NSWorkspace.shared.frontmostApplication
    let fresh = cached.flatMap { NSRunningApplication(processIdentifier: $0.processIdentifier) }
    return ["uptime": ProcessInfo.processInfo.systemUptime,
      "pid": cached?.processIdentifier as Any? ?? NSNull(),
      "cachedActive": cached?.isActive as Any? ?? NSNull(),
      "freshActive": fresh?.isActive as Any? ?? NSNull(),
      "freshHidden": fresh?.isHidden as Any? ?? NSNull(),
      "inputCounts": userInputCounts()]
  }
  #endif

  private func userInputCounts() -> [UInt32] {
    [CGEventType.leftMouseDown, .rightMouseDown, .otherMouseDown, .keyDown].map {
      CGEventSource.counterForEventType(.hidSystemState, eventType: $0)
    }
  }

  private func releaseColdDesktop(_ reason: String) {
    if let captured = coldDesktopIdentity {
      FileHandle.standardError.write(Data("DESKTOP_WINDOW_TRACE phase=cold-guard-released reason=\(reason) pid=\(captured.0) uptime=\(ProcessInfo.processInfo.systemUptime)\n".utf8))
    }
    if let observer = coldDesktopObserver { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    if let observer = coldFocusObserver { NSWorkspace.shared.notificationCenter.removeObserver(observer) }
    coldRecoveryObserver?.invalidate(); coldRecoveryObserver = nil
    coldFocusObserver = nil; coldFocusRestoreEligible = false; coldForegroundIdentity = nil; coldInputCounts = []
    coldDesktopObserver = nil; coldDesktopIdentity = nil
  }

  private func failure(_ text: String) -> NSError {
    NSError(domain: "DSH Workflow", code: 1, userInfo: [NSLocalizedDescriptionKey: text])
  }
  private func loadPreferences() -> [String: Any] {
    if let root = testRoot {
      return NSDictionary(contentsOf: root.appendingPathComponent("test-preferences.plist")) as? [String: Any] ?? [:]
    }
    let defaults = UserDefaults.standard
    return ["fullAccess": defaults.object(forKey: "fullAccess") ?? true,
            "allowLanSettings": defaults.object(forKey: "allowLanSettings") ?? false,
            "hideWindowOnStart": defaults.object(forKey: "hideWindowOnStart") ?? false]
  }
  private func savePreferences(_ values: [String: Any]) throws {
    if let root = testRoot {
      let data = try PropertyListSerialization.data(fromPropertyList: values, format: .xml, options: 0)
      try data.write(to: root.appendingPathComponent("test-preferences.plist"), options: .atomic)
      return
    }
    for (key, value) in values { UserDefaults.standard.set(value, forKey: key) }
  }
  private func loginStatus() -> String {
    if testRoot != nil && !systemBoundaryTest { return "unavailableInTest" }
    if #available(macOS 13, *) {
      switch SMAppService.mainApp.status {
      case .enabled: return "enabled"
      case .requiresApproval: return "requiresApproval"
      case .notRegistered: return "notRegistered"
      case .notFound: return "notFound"
      @unknown default: return "unknown"
      }
    }
    return "unsupported"
  }
  private func persistPassword(_ password: String) throws {
    let url = dataRoot.appendingPathComponent("lan-password")
    try Data(password.utf8).write(to: url, options: .atomic)
    try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
  }
  private func loadPassword() -> String? {
    if let data = try? Data(contentsOf: dataRoot.appendingPathComponent("lan-password")),
       let text = String(data: data, encoding: .utf8), !text.isEmpty { return text }
    var query: [String: Any] = [
      kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.ghostagent.dsh-workflow-launcher",
      kSecAttrAccount as String: "lan-password", kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne,
      kSecUseAuthenticationUI as String: kSecUseAuthenticationUISkip,
    ]
    if testRoot != nil {
      // Ordinary Debug profiles never search the current user's keychains.
      // CI migration reads only the explicitly owned temporary keychain.
      #if DEBUG
      let environment = ProcessInfo.processInfo.environment
      guard environment["GITHUB_ACTIONS"] == "true", environment["DSH_LAUNCHER_LEGACY_KEYCHAIN_CI"] == "1",
            let runner = environment["RUNNER_TEMP"], let root = testRoot,
            root.standardizedFileURL.path.hasPrefix(URL(fileURLWithPath: runner).standardizedFileURL.path + "/"),
            let path = environment["DSH_LAUNCHER_TEST_LEGACY_KEYCHAIN"] else { return nil }
      let keychainURL = URL(fileURLWithPath: path).resolvingSymlinksInPath().standardizedFileURL
      let ownedRoot = root.deletingLastPathComponent().resolvingSymlinksInPath().standardizedFileURL
      guard keychainURL.path.hasPrefix(ownedRoot.path + "/"), keychainURL.lastPathComponent == "legacy.keychain-db",
            let attributes = try? FileManager.default.attributesOfItem(atPath: keychainURL.path),
            (attributes[.ownerAccountID] as? NSNumber)?.uint32Value == getuid() else { return nil }
      var keychain: SecKeychain?
      guard SecKeychainOpen(keychainURL.path, &keychain) == errSecSuccess, let keychain else { return nil }
      query[kSecMatchSearchList as String] = [keychain]
      #else
      return nil
      #endif
    }
    var value: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &value)
    guard status == errSecSuccess, let data = value as? Data,
          let text = String(data: data, encoding: .utf8), !text.isEmpty else { return nil }
    try? persistPassword(text)
    return text
  }

  @objc private func showWindow() {
    let window = mainFlutterWindow ?? NSApp.windows.first { $0 is MainFlutterWindow }
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
  @objc private func openGlobal() { channel?.invokeMethod("openGlobal", arguments: nil) }
  @objc private func requestQuit() { NSApp.terminate(nil) }
  override func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    if quitApproved || channel == nil { return .terminateNow }
    if !quitRequested {
      quitRequested = true
      let traceEnabled = ownQuitTraceEnabled
      if traceEnabled {
        FileHandle.standardError.write(Data("OWN_QUIT_TRACE phase=native-first-dispatch\n".utf8))
      }
      channel?.invokeMethod("quitRequested", arguments: traceEnabled ? ["ownQuitTraceEnabled": true] : nil)
    }
    return .terminateCancel
  }
  override func applicationWillTerminate(_ notification: Notification) {
    if let observer = reopenObserver { DistributedNotificationCenter.default().removeObserver(observer) }
    if instanceLock >= 0 { close(instanceLock); instanceLock = -1 }
    super.applicationWillTerminate(notification)
  }
  override func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
    showWindow()
    return false
  }
  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }
  override func application(_ application: NSApplication, open urls: [URL]) {
    if urls.contains(where: { $0.scheme == "dsh-workflow" && $0.host == "open-global" }) { openGlobal() }
  }
}
