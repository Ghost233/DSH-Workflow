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
  #endif
  private var instanceLock: Int32 = -1
  private var instanceClaimed = false
  private var quitApproved = false
  private var quitRequested = false
  private var reopenObserver: NSObjectProtocol?
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
    instanceLock = open(dataRoot.appendingPathComponent("launcher-instance.lock").path, O_CREAT | O_RDWR, 0o600)
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
          case "minimum":
            if let window = self.mainFlutterWindow { window.setFrame(NSRect(origin: window.frame.origin, size: window.minSize), display: true) }
          default: throw self.failure("无效窗口测试动作")
          }
          result(nil)
        #endif
        case "setEntryManaged":
          guard let managed = call.arguments as? Bool, let item = self.statusItem else { throw self.failure("菜单入口尚未就绪") }
          item.isVisible = !managed
          result(item.isVisible == !managed)
        case "savePreferences":
          guard let values = call.arguments as? [String: Any], let access = values["fullAccess"] as? Bool,
                let lan = values["allowLanSettings"] as? Bool else { throw self.failure("无效设置") }
          try self.savePreferences(["fullAccess": access, "allowLanSettings": lan])
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
        case "openDesktop":
          guard let path = call.arguments as? String else { throw self.failure("无效 Desktop 路径") }
          let app = URL(fileURLWithPath: path)
          NSWorkspace.shared.openApplication(at: app, configuration: NSWorkspace.OpenConfiguration()) { _, error in
            DispatchQueue.main.async {
              if let error { result(FlutterError(code: "open-failed", message: error.localizedDescription, details: nil)) }
              else { result(nil) }
            }
          }
        case "finishQuit": self.quitApproved = true; result(nil); NSApp.terminate(nil)
        default: result(FlutterMethodNotImplemented)
        }
      } catch { result(FlutterError(code: "native-error", message: error.localizedDescription, details: nil)) }
    }
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
            "allowLanSettings": defaults.object(forKey: "allowLanSettings") ?? false]
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
    if testRoot != nil { return nil }
    var value: CFTypeRef?
    let status = SecItemCopyMatching([
      kSecClass: kSecClassGenericPassword, kSecAttrService: "com.ghostagent.dsh-workflow-launcher",
      kSecAttrAccount: "lan-password", kSecReturnData: true, kSecMatchLimit: kSecMatchLimitOne,
      kSecUseAuthenticationUI: kSecUseAuthenticationUISkip,
    ] as CFDictionary, &value)
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
      channel?.invokeMethod("quitRequested", arguments: nil)
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
