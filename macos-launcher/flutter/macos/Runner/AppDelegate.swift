import Cocoa
import FlutterMacOS
import ServiceManagement
import Security
import Darwin

@main
class AppDelegate: FlutterAppDelegate {
  private var statusItem: NSStatusItem?
  private var channel: FlutterMethodChannel?
  private var instanceLock: Int32 = -1
  private var quitApproved = false
  private var quitRequested = false
  private var reopenObserver: NSObjectProtocol?
  private let reopen = Notification.Name("com.ghostagent.dsh-workflow-launcher.reopen")

  private var dataRoot: URL {
    #if DEBUG
    if let root = ProcessInfo.processInfo.environment["DSH_LAUNCHER_TEST_ROOT"] {
      return URL(fileURLWithPath: root, isDirectory: true)
    }
    #endif
    return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
      .appendingPathComponent("DSH Workflow", isDirectory: true)
  }

  override func applicationDidFinishLaunching(_ notification: Notification) {
    NSApp.setActivationPolicy(.accessory)
    do { try FileManager.default.createDirectory(at: dataRoot, withIntermediateDirectories: true) }
    catch { NSApp.terminate(nil); return }
    instanceLock = open(dataRoot.appendingPathComponent("launcher-instance.lock").path, O_CREAT | O_RDWR, 0o600)
    guard instanceLock >= 0, flock(instanceLock, LOCK_EX | LOCK_NB) == 0 else {
      DistributedNotificationCenter.default().post(name: reopen, object: nil)
      quitApproved = true
      NSApp.terminate(nil)
      return
    }
    statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    statusItem?.button?.image = NSImage(systemSymbolName: "bolt.circle", accessibilityDescription: "DSH Workflow")
    let menu = NSMenu()
    menu.addItem(NSMenuItem(title: "打开 DSH", action: #selector(openGlobal), keyEquivalent: ""))
    menu.addItem(NSMenuItem(title: "管理…", action: #selector(showWindow), keyEquivalent: ""))
    menu.addItem(.separator())
    menu.addItem(NSMenuItem(title: "退出启动器", action: #selector(requestQuit), keyEquivalent: "q"))
    for item in menu.items { item.target = self }
    statusItem?.menu = menu
    reopenObserver = DistributedNotificationCenter.default().addObserver(forName: reopen, object: nil, queue: .main) { [weak self] _ in
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
          let defaults = UserDefaults.standard
          result([
            "resources": resources.path, "dataRoot": self.dataRoot.path,
            "home": ProcessInfo.processInfo.environment["DSH_HOME"] ?? NSHomeDirectory() + "/.dsh",
            "appVersion": Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知",
            "fullAccess": defaults.object(forKey: "fullAccess") as? Bool ?? true,
            "allowLanSettings": defaults.object(forKey: "allowLanSettings") as? Bool ?? false,
            "password": self.loadPassword() as Any, "loginStatus": self.loginStatus(),
          ])
        case "showWindow": self.showWindow(); result(nil)
        #if DEBUG
        case "debugState": result(["entryVisible": self.statusItem?.isVisible ?? false,
          "windowVisible": self.mainFlutterWindow?.isVisible ?? false, "dataRoot": self.dataRoot.path])
        #endif
        case "setEntryManaged":
          guard let managed = call.arguments as? Bool, let item = self.statusItem else { throw self.failure("菜单入口尚未就绪") }
          item.isVisible = !managed
          result(item.isVisible == !managed)
        case "savePreferences":
          guard let values = call.arguments as? [String: Any], let access = values["fullAccess"] as? Bool,
                let lan = values["allowLanSettings"] as? Bool else { throw self.failure("无效设置") }
          UserDefaults.standard.set(access, forKey: "fullAccess")
          UserDefaults.standard.set(lan, forKey: "allowLanSettings")
          result(nil)
        case "savePassword":
          guard let password = call.arguments as? String, !password.isEmpty, password.utf8.count <= 1024 else {
            throw self.failure("密码须为 1–1024 字节")
          }
          try self.persistPassword(password); result(nil)
        case "setLoginEnabled":
          guard let enabled = call.arguments as? Bool else { throw self.failure("无效登录启动设置") }
          if #available(macOS 13, *) {
            if enabled { try SMAppService.mainApp.register() } else { try SMAppService.mainApp.unregister() }
            result(self.loginStatus())
          } else { throw self.failure("登录启动需要 macOS 13 或更新版本") }
        case "openUrl":
          guard let text = call.arguments as? String, let url = URL(string: text), ["http", "https"].contains(url.scheme ?? "") else {
            throw self.failure("无效网页地址")
          }
          NSWorkspace.shared.open(url); result(nil)
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
  private func loginStatus() -> String {
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
  override func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
  override func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }
  override func application(_ application: NSApplication, open urls: [URL]) {
    if urls.contains(where: { $0.scheme == "dsh-workflow" && $0.host == "open-global" }) { openGlobal() }
  }
}
