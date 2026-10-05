import AppKit
import ServiceManagement
import SwiftUI
import Darwin
import Security

private enum LanPasswordStore {
    // Stored as a 0600 file in the app-support directory instead of the keychain: every
    // re-signed build is a new keychain identity, so updates would lock the password away
    // and force re-entry after each upgrade. The keychain remains a read-only fallback
    // that migrates passwords saved by older builds.
    static var fileURL: URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("DSH Workflow", isDirectory: true)
            .appendingPathComponent("lan-password")
    }

    static func load() -> String? {
        if let url = fileURL, let data = try? Data(contentsOf: url),
           let password = String(data: data, encoding: .utf8), !password.isEmpty { return password }
        var item: CFTypeRef?
        // Skip the approval UI: a fresh ad-hoc build is a new code identity, and a blocking
        // dialog here would freeze the app at launch.
        let status = SecItemCopyMatching([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: "com.ghostagent.dsh-workflow-launcher",
            kSecAttrAccount: "lan-password",
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
            kSecUseAuthenticationUI: kSecUseAuthenticationUISkip,
        ] as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data,
              let password = String(data: data, encoding: .utf8), !password.isEmpty else { return nil }
        try? persist(password)
        return password
    }

    static func save(_ password: String) throws {
        try persist(password)
    }

    private static func persist(_ password: String) throws {
        guard let url = fileURL else {
            throw NSError(domain: NSCocoaErrorDomain, code: NSFileWriteInvalidFileNameError,
                          userInfo: [NSLocalizedDescriptionKey: "无法定位应用数据目录。"])
        }
        try FileManager.default.createDirectory(at: url.deletingLastPathComponent(),
                                                withIntermediateDirectories: true)
        try Data(password.utf8).write(to: url, options: .atomic)
        try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: url.path)
    }
}

private struct ReadyEvent: Decodable {
    let port: Int
    let url: URL
    let logPath: String?
    let lanUrls: [URL]?
    let localUrl: URL?
}

private struct PluginVersionReport: Decodable {
    let checkedAt: String
    let rows: [PluginVersionRow]
}

private struct PluginUpdateReport: Decodable {
    let updated: [UpdatedPlugin]
    let failedChecks: Int
    let error: String?
}

private struct UpdatedPlugin: Decodable {
    let name: String
    let from: String?
    let to: String
}

private struct DshRuntimeInfo: Decodable {
    let version: String
}

struct GlobalConnectionState: Decodable {
    let state: String
    let error: String
    let webPort: Int?
    let gatePort: Int?
    let url: String?

    var stateText: String {
        switch state {
        case "running": return "已连接"
        case "starting": return "正在连接"
        default: return "未连接"
        }
    }
}

private struct GlobalStateEvent: Decodable {
    let global: GlobalConnectionState
}

private struct ControlReply: Decodable {
    let requestId: Int
    let ok: Bool
    let global: GlobalConnectionState?
    let url: String?
    let error: String?
}

struct PluginVersionRow: Decodable, Identifiable {
    let source: String
    let name: String
    let current: String?
    let latest: String?
    let supportedDsh: String?
    let latestSupportedDsh: String?
    let status: String
    let note: String
    let updatable: Bool?

    var id: String { "\(source):\(name)" }
    var isUpdatable: Bool { updatable == true }
    var statusText: String {
        switch status {
        case "newer": return "有新版本"
        case "current": return "已是最新"
        case "ahead": return "当前版本高于 latest"
        case "bundled": return "随 App 更新"
        case "coupled": return "随 DSH 更新"
        case "local": return "本地依赖"
        case "error": return "检查失败"
        case "unsupported": return "暂不支持查询"
        default: return "无法比较"
        }
    }
}

@MainActor
final class LauncherModel: ObservableObject {
    static let shared = LauncherModel()

    @Published var fullAccess: Bool {
        didSet { UserDefaults.standard.set(fullAccess, forKey: "fullAccess") }
    }
    @Published var allowLanSettings: Bool {
        didSet { UserDefaults.standard.set(allowLanSettings, forKey: "allowLanSettings") }
    }
    @Published var passwordDraft = ""
    @Published private(set) var hasLanPassword = false
    @Published var showPasswordSetupPrompt = false
    @Published private(set) var status = "已停止"
    @Published private(set) var lastError = ""
    @Published private(set) var browserURL: URL?
    @Published private(set) var lanURLs: [URL] = []
    @Published private(set) var localURL: URL?
    @Published private(set) var logPath: String?
    @Published private(set) var launchAtLogin = false
    @Published private(set) var updateStatus = "尚未检查更新"
    @Published private(set) var updatePage: URL?
    @Published private(set) var isCheckingUpdates = false
    @Published private(set) var pluginRows: [PluginVersionRow] = []
    @Published private(set) var pluginCheckStatus = "尚未检查插件版本"
    @Published private(set) var isCheckingPlugins = false
    @Published private(set) var pluginUpdateStatus = "在插件管理窗口逐个选择要更新的插件"
    @Published private(set) var isUpdatingPlugins = false
    @Published private(set) var updatingPackages: Set<String> = []
    @Published private(set) var pluginRestartAvailable = false
    @Published var showPluginRestartPrompt = false
    @Published private(set) var globalConnection: GlobalConnectionState?
    private(set) var appVersionText = ""

    private var child: Process?
    private var output: Pipe?
    private var control: Pipe?
    private var outputBuffer = Data()
    private var restartPending = false

    var isActive: Bool { child != nil }
    var isReady: Bool { browserURL != nil && child?.isRunning == true }

    private init() {
        let defaults = UserDefaults.standard
        fullAccess = defaults.object(forKey: "fullAccess") as? Bool ?? true
        allowLanSettings = defaults.object(forKey: "allowLanSettings") as? Bool ?? false
        hasLanPassword = LanPasswordStore.load()?.isEmpty == false
        launchAtLogin = SMAppService.mainApp.status == .enabled
        let app = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "未知"
        appVersionText = app
        if let url = Bundle.main.resourceURL?.appendingPathComponent("workflow/dsh-runtime.json"),
           let info = try? JSONDecoder().decode(DshRuntimeInfo.self, from: Data(contentsOf: url)) {
            appVersionText += "（DSH \(info.version)）"
        }
    }

    func start() {
        guard child == nil else { return }
        guard let lanPassword = LanPasswordStore.load(), !lanPassword.isEmpty else {
            lastError = "请先在管理窗口设置内网访问密码。"
            showPasswordSetupPrompt = true
            return
        }
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            lastError = "无法定位应用数据目录。"
            return
        }
        let dataRoot = support.appendingPathComponent("DSH Workflow", isDirectory: true)
        guard let resources = Bundle.main.resourceURL else {
            lastError = "应用资源目录不可用。"
            return
        }
        let node = resources.appendingPathComponent("node")
        let launcher = resources.appendingPathComponent("workflow/macos-launcher/runtime/global-supervisor.mjs")
        guard FileManager.default.isExecutableFile(atPath: node.path),
              FileManager.default.fileExists(atPath: launcher.path) else {
            lastError = "包内 DSH 运行时不完整，请重新构建应用。"
            return
        }
        browserURL = nil
        lanURLs = []
        localURL = nil
        logPath = nil
        lastError = ""
        status = "正在启动"
        outputBuffer = Data()

        let process = Process()
        process.executableURL = node
        process.arguments = [launcher.path, dataRoot.path]
        process.currentDirectoryURL = resources
        var environment = ProcessInfo.processInfo.environment
        environment["DSH_PERMISSION_MODE"] = fullAccess ? "danger-full-access" : "workspace-write"
        environment["DSH_ALLOW_LAN_SETTINGS"] = allowLanSettings ? "1" : "0"
        environment["DSH_LAUNCH_PASSWORD"] = lanPassword
        process.environment = environment
        let pipe = Pipe()
        let controlPipe = Pipe()
        process.standardInput = controlPipe
        process.standardOutput = pipe
        process.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes = handle.availableData
            if bytes.isEmpty { handle.readabilityHandler = nil; return }
            Task { @MainActor [weak self] in self?.consume(bytes) }
        }
        process.terminationHandler = { [weak self] ended in
            Task { @MainActor [weak self] in self?.finished(ended) }
        }
        child = process
        output = pipe
        control = controlPipe
        do {
            try process.run()
            pluginRestartAvailable = false
            showPluginRestartPrompt = false
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            child = nil
            output = nil
            control = nil
            status = "启动失败"
            lastError = error.localizedDescription
        }
    }

    func stop() {
        restartPending = false
        guard let child else { return }
        status = "正在停止"
        child.terminate()
        forceStopIfNeeded(child)
    }

    func restart() {
        pendingGlobalOpen = globalConnection?.state == "running" || globalConnection?.state == "starting"
        guard let child else { start(); return }
        restartPending = true
        status = "正在重启"
        child.terminate()
        forceStopIfNeeded(child)
    }

    func openBrowser() {
        if let browserURL { NSWorkspace.shared.open(browserURL) }
    }

    func saveLanPassword() {
        guard !passwordDraft.isEmpty else {
            lastError = "内网访问密码不能为空。"
            return
        }
        guard passwordDraft.utf8.count <= 1024 else {
            lastError = "内网访问密码不能超过 1024 字节。"
            return
        }
        do { try LanPasswordStore.save(passwordDraft) }
        catch { lastError = error.localizedDescription; return }
        hasLanPassword = true
        if let child, child.isRunning, let control {
            do {
                let command = try JSONSerialization.data(withJSONObject: ["type": "set-password", "password": passwordDraft])
                try control.fileHandleForWriting.write(contentsOf: command + Data([10]))
            } catch {
                lastError = "密码已保存，但通知运行中的服务失败：\(error.localizedDescription)；请重启服务。"
                passwordDraft = ""
                return
            }
        }
        passwordDraft = ""
        lastError = ""
    }

    func showLog() {
        if let logPath {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: logPath)])
        }
    }

    // MARK: Global engine management over the supervisor control channel

    private var controlSequence = 0

    private func sendControl(_ fields: [String: Any]) {
        guard let control, let child, child.isRunning else { return }
        controlSequence += 1
        var command = fields
        command["requestId"] = controlSequence
        guard let data = try? JSONSerialization.data(withJSONObject: command) else { return }
        do { try control.fileHandleForWriting.write(contentsOf: data + Data([10])) }
        catch { lastError = "发送管理指令失败：\(error.localizedDescription)" }
    }

    func refreshGlobalState() {
        sendControl(["type": "status"])
    }

    private var pendingGlobalOpen = false

    func requestGlobalOpen() {
        if isReady { openGlobal() }
        else { pendingGlobalOpen = true; if !isActive { start() } }
    }

    func openGlobal(connectWeb: Bool = true) {
        guard let desktop = Bundle.main.resourceURL?.appendingPathComponent("desktop/DeepSeek Harness.app"),
              FileManager.default.fileExists(atPath: desktop.path) else {
            lastError = "应用内缺少官方桌面端，请完成桌面端源码构建后重新打包。"
            return
        }
        guard let resources = Bundle.main.resourceURL,
              let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first,
              let info = NSDictionary(contentsOf: desktop.appendingPathComponent("Contents/Info.plist")),
              let executable = info["CFBundleExecutable"] as? String else {
            lastError = "官方桌面端资源不完整。"
            return
        }
        if let bundleID = info["CFBundleIdentifier"] as? String,
           let running = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID).first(where: { !$0.isTerminated }) {
            running.activate(options: [.activateAllWindows])
            if connectWeb { sendControl(["type": "open-global"]) }
            return
        }
        let globalRoot = support.appendingPathComponent("DSH Workflow/global").path
        let sourceRuntime = desktop.appendingPathComponent("Contents/Resources/dsh-source-runtime.json")
        let descriptor = (try? Data(contentsOf: sourceRuntime)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: String] }
        let runtimeRoot = descriptor?["runtimeRoot"] ?? desktop.appendingPathComponent("Contents/Resources/app/dsh").path
        let electron = desktop.appendingPathComponent("Contents/MacOS/Electron")
        let nodeExecutable = FileManager.default.isExecutableFile(atPath: electron.path)
            ? electron : desktop.appendingPathComponent("Contents/MacOS/" + executable)
        let helper = resources.appendingPathComponent("workflow/macos-launcher/runtime/prepare-desktop.mjs").path
        let permissionMode = fullAccess ? "danger-full-access" : "workspace-write"
        Task { [self] in
            let failure = await Task.detached { () -> String? in
                let prepare = Process()
                prepare.executableURL = nodeExecutable
                prepare.arguments = [helper, resources.path, globalRoot, runtimeRoot]
                var environment = ProcessInfo.processInfo.environment
                environment["ELECTRON_RUN_AS_NODE"] = "1"
                environment["DSH_PERMISSION_MODE"] = permissionMode
                prepare.environment = environment
                prepare.standardOutput = FileHandle.nullDevice
                let diagnostics = Pipe()
                prepare.standardError = diagnostics
                var diagnostic = ""
                do {
                    try prepare.run()
                    diagnostic = String(decoding: diagnostics.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
                    prepare.waitUntilExit()
                }
                catch { return error.localizedDescription }
                let clean = diagnostic.replacingOccurrences(of: "token=[^&\\s]+", with: "token=[redacted]", options: .regularExpression)
                return prepare.terminationStatus == 0 ? nil : "插件装配失败（\(prepare.terminationStatus)）：\(clean.suffix(600))"
            }.value
            if let failure { lastError = failure; return }
            NSWorkspace.shared.openApplication(at: desktop, configuration: NSWorkspace.OpenConfiguration()) { [weak self] _, error in
                Task { @MainActor in
                    if let error { self?.lastError = "桌面端启动失败：\(error.localizedDescription)" }
                    else if connectWeb { self?.sendControl(["type": "open-global"]) }
                }
            }
        }
    }

    func checkForUpdates() {
        guard !isCheckingUpdates else { return }
        isCheckingUpdates = true
        updateStatus = "正在检查更新…"
        Task {
            defer { isCheckingUpdates = false }
            do {
                var request = URLRequest(url: UpdatePolicy.apiURL)
                request.timeoutInterval = 10
                request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
                request.setValue("DSH-Workflow-macOS", forHTTPHeaderField: "User-Agent")
                let (data, response) = try await URLSession.shared.data(for: request)
                guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                    throw NSError(domain: "DSH Workflow", code: (response as? HTTPURLResponse)?.statusCode ?? -1,
                                  userInfo: [NSLocalizedDescriptionKey: "GitHub 发布接口暂时不可用"])
                }
                let installed = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
                if let candidate = try UpdatePolicy.newerRelease(in: data, than: installed) {
                    updatePage = candidate.page
                    updateStatus = "发现新版本 \(candidate.version)"
                } else {
                    updatePage = nil
                    updateStatus = "暂无新版本"
                }
            } catch {
                updateStatus = "检查更新失败：\(error.localizedDescription)"
            }
        }
    }

    func openUpdatePage() {
        if let updatePage { NSWorkspace.shared.open(updatePage) }
    }

    func checkPluginVersions() {
        guard !isCheckingPlugins && !isUpdatingPlugins else { return }
        guard let resources = Bundle.main.resourceURL else {
            pluginCheckStatus = "应用资源目录不可用。"
            return
        }
        let nodePath = resources.appendingPathComponent("node").path
        let scriptPath = resources.appendingPathComponent("workflow/macos-launcher/runtime/plugin-versions.mjs").path
        guard FileManager.default.isExecutableFile(atPath: nodePath),
              FileManager.default.fileExists(atPath: scriptPath) else {
            pluginCheckStatus = "包内缺少插件检查器，请重新构建应用。"
            return
        }
        isCheckingPlugins = true
        pluginCheckStatus = "正在检查 npm 最新版本…"
        Task {
            let resourcesPath = resources.path
            let result = await Task.detached(priority: .userInitiated) { () -> (Int32, Data) in
                let process = Process()
                process.executableURL = URL(fileURLWithPath: nodePath)
                process.arguments = [scriptPath, resourcesPath]
                let output = Pipe()
                process.standardOutput = output
                process.standardError = FileHandle.nullDevice
                do { try process.run() }
                catch { return (-1, Data()) }
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                return (process.terminationStatus, data)
            }.value
            defer { isCheckingPlugins = false }
            guard result.0 == 0, let report = try? JSONDecoder().decode(PluginVersionReport.self, from: result.1) else {
                pluginCheckStatus = "插件检查失败；清单或网络不可用。未修改任何插件。"
                return
            }
            pluginRows = report.rows
            let newer = report.rows.filter { $0.status == "newer" }.count
            let errors = report.rows.filter { $0.status == "error" || $0.status == "unknown" || $0.status == "unsupported" }.count
            pluginCheckStatus = "检查完成：\(newer) 个新版本，\(errors) 个无法确认；共 \(report.rows.count) 项。"
        }
    }

    func updatePlugins(_ names: [String] = []) {
        guard !isUpdatingPlugins && !isCheckingPlugins else { return }
        guard let resources = Bundle.main.resourceURL else {
            pluginUpdateStatus = "应用资源目录不可用，无法更新插件。"
            return
        }
        let nodePath = resources.appendingPathComponent("node").path
        let scriptPath = resources.appendingPathComponent("workflow/macos-launcher/runtime/plugin-update.mjs").path
        guard FileManager.default.isExecutableFile(atPath: nodePath),
              FileManager.default.fileExists(atPath: scriptPath) else {
            pluginUpdateStatus = "包内缺少插件更新器，请重新构建应用。"
            return
        }
        isUpdatingPlugins = true
        updatingPackages = Set(names)
        pluginUpdateStatus = names.isEmpty ? "正在检查并更新全部可更新的 Web profile 插件…"
            : "正在更新 \(names.joined(separator: "、"))…"
        Task {
            let resourcesPath = resources.path
            let arguments = names.isEmpty ? [scriptPath, resourcesPath]
                : [scriptPath, resourcesPath, "--only", names.joined(separator: ",")]
            let result = await Task.detached(priority: .utility) { () -> (Int32, Data) in
                let process = Process()
                process.executableURL = URL(fileURLWithPath: nodePath)
                process.arguments = arguments
                let output = Pipe()
                process.standardOutput = output
                process.standardError = output
                do { try process.run() }
                catch { return (-1, Data(error.localizedDescription.utf8)) }
                let data = output.fileHandleForReading.readDataToEndOfFile()
                process.waitUntilExit()
                return (process.terminationStatus, data)
            }.value
            isUpdatingPlugins = false
            updatingPackages = []
            guard result.0 == 0, let report = try? JSONDecoder().decode(PluginUpdateReport.self, from: result.1) else {
                pluginUpdateStatus = "插件更新失败：\(String(decoding: result.1.suffix(400), as: UTF8.self))"
                return
            }
            if report.updated.isEmpty {
                if let error = report.error {
                    pluginUpdateStatus = "插件更新失败：\(error)"
                } else {
                    pluginUpdateStatus = report.failedChecks == 0 ? "插件已是最新，未修改 DSH 或自研插件。"
                        : "没有可更新的插件；\(report.failedChecks) 项版本检查失败。"
                }
                return
            }
            let versions = Dictionary(uniqueKeysWithValues: report.updated.map { ($0.name, $0.to) })
            pluginRows = pluginRows.map { row in
                guard let version = versions[row.name], ["DSH Web profile", "DSH Desktop profile"].contains(row.source) else { return row }
                return PluginVersionRow(source: row.source, name: row.name, current: version,
                                        latest: version, supportedDsh: nil, latestSupportedDsh: nil, status: "current",
                                        note: "已更新；重启后运行中的引擎才会加载", updatable: false)
            }
            pluginUpdateStatus = report.error.map { "已更新 \(report.updated.count) 个插件，但其余更新失败：\($0)" }
                ?? "已更新 \(report.updated.count) 个 Web profile 插件；运行中的 DSH 尚未切换版本。"
            pluginRestartAvailable = isActive
            showPluginRestartPrompt = isActive
            checkPluginVersions()
        }
    }

    func restartAfterPluginUpdate() {
        showPluginRestartPrompt = false
        pluginRestartAvailable = false
        restart()
    }

    func postponePluginRestart() {
        showPluginRestartPrompt = false
    }

    func setLaunchAtLogin(_ enabled: Bool) {
        do {
            if enabled { try SMAppService.mainApp.register() }
            else { try SMAppService.mainApp.unregister() }
            launchAtLogin = SMAppService.mainApp.status == .enabled
            lastError = ""
        } catch {
            launchAtLogin = SMAppService.mainApp.status == .enabled
            lastError = "登录启动设置失败：\(error.localizedDescription)"
        }
    }

    private func consume(_ data: Data) {
        guard !data.isEmpty else { return }
        outputBuffer.append(data)
        while let newline = outputBuffer.firstIndex(of: 10) {
            let line = String(decoding: outputBuffer.prefix(upTo: newline), as: UTF8.self)
            outputBuffer.removeSubrange(...newline)
            if line.hasPrefix("DSH_WORKFLOW_READY\t"),
               let payload = line.split(separator: "\t", maxSplits: 1).last?.data(using: .utf8),
               let ready = try? JSONDecoder().decode(ReadyEvent.self, from: payload) {
                browserURL = ready.url
                lanURLs = ready.lanUrls ?? []
                localURL = ready.localUrl
                logPath = ready.logPath
                status = "Web 入口已就绪 · 端口 \(ready.port)"
                refreshGlobalState()
                if pendingGlobalOpen { pendingGlobalOpen = false; openGlobal() }
            } else if line.hasPrefix("DSH_WORKFLOW_DESKTOP_NEEDED\t") {
                openGlobal(connectWeb: false)
            } else if line.hasPrefix("DSH_WORKFLOW_STATE\t"),
               let payload = line.split(separator: "\t", maxSplits: 1).last?.data(using: .utf8),
               let event = try? JSONDecoder().decode(GlobalStateEvent.self, from: payload) {
                globalConnection = event.global
            } else if line.hasPrefix("DSH_WORKFLOW_REPLY\t"),
               let payload = line.split(separator: "\t", maxSplits: 1).last?.data(using: .utf8),
               let reply = try? JSONDecoder().decode(ControlReply.self, from: payload) {
                if let global = reply.global { globalConnection = global }
                if !reply.ok {
                    lastError = reply.error ?? "管理指令失败。"
                }
            } else if !line.isEmpty {
                let clean = line.replacingOccurrences(of: "token=[^&\\s]+", with: "token=[redacted]", options: .regularExpression)
                if lastError.isEmpty { lastError = String(clean.suffix(600)) }
            }
        }
        if outputBuffer.count > 65_536 { outputBuffer.removeFirst(outputBuffer.count - 65_536) }
    }

    private func finished(_ ended: Process) {
        guard child === ended else { return }
        output?.fileHandleForReading.readabilityHandler = nil
        output = nil
        control?.fileHandleForWriting.closeFile()
        control = nil
        child = nil
        browserURL = nil
        lanURLs = []
        localURL = nil
        logPath = nil
        globalConnection = nil
        if restartPending {
            restartPending = false
            start()
        } else {
            status = ended.terminationStatus == 0 ? "已停止" : "异常退出（\(ended.terminationStatus)）"
        }
    }

    private func forceStopIfNeeded(_ process: Process) {
        Task { @MainActor [weak self] in
            try? await Task.sleep(for: .seconds(3))
            guard self?.child === process, process.isRunning else { return }
            kill(process.processIdentifier, SIGKILL)
        }
    }
}

@MainActor
final class LauncherDelegate: NSObject, NSApplicationDelegate {
    private static let reopen = Notification.Name("com.ghostagent.dsh-workflow-launcher.reopen")
    private var instanceLock: Int32 = -1
    private var reopenObserver: NSObjectProtocol?

    func application(_ application: NSApplication, open urls: [URL]) {
        if urls.contains(where: { $0.scheme == "dsh-workflow" && $0.host == "open-global" }) {
            LauncherModel.shared.requestGlobalOpen()
        }
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard acquireInstanceLock() else {
            DistributedNotificationCenter.default().post(name: Self.reopen, object: nil)
            NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier ?? "com.ghostagent.dsh-workflow-launcher")
                .first(where: { $0.processIdentifier != getpid() && !$0.isTerminated })?
                .activate(options: [])
            NSApp.terminate(nil)
            return
        }
        reopenObserver = DistributedNotificationCenter.default().addObserver(forName: Self.reopen, object: nil, queue: .main) { _ in
            Task { @MainActor in ManagementWindow.shared.show() }
        }
        LauncherModel.shared.start()
        ManagementWindow.shared.show()
        LauncherModel.shared.checkForUpdates()
        LauncherModel.shared.checkPluginVersions()
    }

    func applicationWillTerminate(_ notification: Notification) {
        LauncherModel.shared.stop()
        if let reopenObserver { DistributedNotificationCenter.default().removeObserver(reopenObserver) }
        if instanceLock >= 0 { close(instanceLock); instanceLock = -1 }
    }

    private func acquireInstanceLock() -> Bool {
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("DSH Workflow", isDirectory: true) else { return false }
        do { try FileManager.default.createDirectory(at: support, withIntermediateDirectories: true) }
        catch { return false }
        let handle = open(support.appendingPathComponent("launcher-instance.lock").path, O_CREAT | O_RDWR, 0o600)
        guard handle >= 0 else { return false }
        guard flock(handle, LOCK_EX | LOCK_NB) == 0 else { close(handle); return false }
        instanceLock = handle
        return true
    }
}

private struct ManagementView: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        Form {
            Section {
                LabeledContent("Web 服务") {
                    HStack(spacing: 6) {
                        Circle()
                            .fill(model.isReady ? Color.green : model.isActive ? Color.orange : Color.secondary.opacity(0.5))
                            .frame(width: 8, height: 8)
                        Text(model.status)
                    }
                }
                LabeledContent("应用版本") { Text(model.appVersionText).textSelection(.enabled) }
                Button("打开 DSH") { model.requestGlobalOpen() }
                    .buttonStyle(.borderedProminent)
                if let global = model.globalConnection {
                    connectionStatus(global)
                }
            } header: {
                Text("全局实例 · 官方桌面版")
            } footer: {
                Text("桌面版持有唯一后端，Web 连接同一实例。项目目录在 DSH 内选择。")
            }

            Section {
                HStack {
                    Button("打开 Web 入口") { model.openBrowser() }.disabled(!model.isReady)
                    Spacer()
                    Button("启动 Web 服务") { model.start() }.disabled(model.isActive)
                    Button("停止 Web 服务") { model.stop() }.disabled(!model.isActive)
                    Button("重连 Web") { model.restart() }.disabled(!model.isActive)
                }
                Toggle("DSH 工具使用完整访问权限", isOn: $model.fullAccess)
                Toggle("允许局域网修改 DSH 设置", isOn: $model.allowLanSettings)
                Text("启用后，已登录的局域网浏览器可修改模型 API 密钥等宿主设置；重启服务后生效。")
                    .font(.caption2).foregroundStyle(.secondary)
                HStack {
                    SecureField("内网访问密码", text: $model.passwordDraft, prompt: Text("内网访问密码"))
                        .labelsHidden()
                    Button(model.hasLanPassword ? "修改密码" : "设置密码") { model.saveLanPassword() }
                        .disabled(model.passwordDraft.isEmpty)
                }
                LabeledContent("监听地址") { Text("0.0.0.0（所有 IPv4 网卡）") }
                LabeledContent("Web 端口") { Text("33080") }
                if let local = model.localURL {
                    LabeledContent("本机入口") {
                        VStack(alignment: .trailing) {
                            Text(local.absoluteString).textSelection(.enabled)
                            Text(model.allowLanSettings ? "已允许登录后的局域网客户端修改设置" : "模型和 API Key 等主机设置默认仅在本机入口可用").font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
                if !model.lanURLs.isEmpty {
                    LabeledContent("内网入口") {
                        VStack(alignment: .trailing) {
                            ForEach(model.lanURLs, id: \.absoluteString) { url in
                                Text(url.absoluteString).textSelection(.enabled)
                            }
                        }
                    }
                }
            } header: {
                Text("访问")
            } footer: {
                VStack(alignment: .leading, spacing: 4) {
                    Text("本机与局域网共用一个 Web 端口。网络地址变化无需重启，内网地址会自动更新。完整访问权限变更仍需退出并重新打开桌面版。")
                    Text(model.hasLanPassword ? "密码保存在本机应用数据目录，修改后立即撤销旧的内网登录。" : "设置密码后才能开启内网入口。")
                }
            }

            Section("通用") {
                Toggle("登录后启动应用", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
                HStack {
                    Text(model.updateStatus).font(.caption).foregroundStyle(.secondary)
                    Spacer()
                    Button("检查更新") { model.checkForUpdates() }.disabled(model.isCheckingUpdates)
                    if model.updatePage != nil {
                        Button("查看新版本") { model.openUpdatePage() }
                    }
                }
                Button("查看日志") { model.showLog() }.disabled(model.logPath == nil)
            }

            Section {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.pluginCheckStatus)
                        Text(model.pluginUpdateStatus).font(.caption).foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("插件管理…") { PluginWindow.shared.show() }
                }
                if model.pluginRestartAvailable {
                    HStack {
                        Text("插件已更新，等待重启生效。").font(.caption).foregroundStyle(.orange)
                        Spacer()
                        Button("重启以应用") { model.restartAfterPluginUpdate() }
                    }
                }
            } header: {
                Text("插件")
            } footer: {
                Text("npm 安装的第三方插件可在插件管理窗口逐个更新；DSH、自研插件与内置 Bundle 随应用更新。")
            }

            if !model.lastError.isEmpty {
                Section("错误") {
                    Text(model.lastError).font(.caption).foregroundStyle(.red).textSelection(.enabled)
                }
            }
        }
        .formStyle(.grouped)
        .frame(minWidth: 560, maxWidth: 620, minHeight: 480)
        .alert("启动前需要设置密码", isPresented: $model.showPasswordSetupPrompt) {
            Button("知道了", role: .cancel) {}
        } message: {
            Text("请在管理窗口的“访问”区域设置内网访问密码，然后再点击“启动”。")
        }
    }

    @ViewBuilder
    private func connectionStatus(_ connection: GlobalConnectionState) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            LabeledContent("桌面后端的 Web 连接") {
                HStack(spacing: 6) {
                    Circle()
                        .fill(connection.state == "running" ? Color.green : connection.state == "starting" ? Color.orange : Color.secondary.opacity(0.4))
                        .frame(width: 8, height: 8)
                    Text(connection.stateText).font(.caption)
                    if let port = connection.gatePort, connection.state == "running" {
                        Text("端口 \(String(port))").font(.caption2).foregroundStyle(.secondary)
                    }
                }
            }
            if !connection.error.isEmpty {
                Text(connection.error).font(.caption2).foregroundStyle(.red)
            }
        }
    }


}

private struct PluginManageView: View {
    @ObservedObject var model: LauncherModel

    private struct PluginGroup: Identifiable {
        let title: String
        let rows: [PluginVersionRow]
        var id: String { title }
    }

    private static let groupOrder: [(source: String, title: String)] = [
        ("DSH Web profile", "DSH Web profile 插件（npm 安装）"),
        ("DSH Desktop profile", "DSH Desktop profile 插件（npm 安装）"),
        ("DSH Desktop profile Bundle", "Desktop Profile Bundle"),
        ("DSH Web profile Bundle", "Profile Bundle"),
        ("项目插件锁定清单（打包快照）", "项目插件（打包时快照）"),
        ("DSH 内置 Bundle", "DSH 内置 Bundle（随 DSH 更新）"),
        ("DSH 版本绑定插件", "DSH 版本绑定插件"),
        ("App 内置自研插件", "自研插件（随 App 更新）"),
        ("App 内置派生插件", "本地派生插件（随 App 更新）"),
    ]

    private var pluginGroups: [PluginGroup] {
        var groups = Self.groupOrder.compactMap { entry -> PluginGroup? in
            let rows = model.pluginRows.filter { $0.source == entry.source }
            return rows.isEmpty ? nil : PluginGroup(title: entry.title, rows: rows)
        }
        let known = Set(Self.groupOrder.map(\.source))
        let rest = model.pluginRows.filter { !known.contains($0.source) }
        if !rest.isEmpty { groups.append(PluginGroup(title: "其他", rows: rest)) }
        return groups
    }

    private var updatableNames: [String] { model.pluginRows.filter { $0.isUpdatable }.map(\.name) }
    private var busy: Bool { model.isCheckingPlugins || model.isUpdatingPlugins }

    var body: some View {
        VStack(spacing: 0) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(model.pluginCheckStatus).font(.caption)
                    Text(model.pluginUpdateStatus).font(.caption).foregroundStyle(.secondary)
                    Text("应用版本 \(model.appVersionText)").font(.caption2).foregroundStyle(.secondary)
                }
                Spacer()
                Button("重新检查") { model.checkPluginVersions() }.disabled(busy)
                Button("全部更新") { model.updatePlugins() }
                    .disabled(busy || updatableNames.isEmpty)
                if model.pluginRestartAvailable {
                    Button("重启以应用") { model.restartAfterPluginUpdate() }
                }
            }
            .padding(14)
            Divider()
            if model.pluginRows.isEmpty {
                Spacer()
                if model.isCheckingPlugins {
                    ProgressView()
                } else {
                    Text("还没有插件版本数据。").foregroundStyle(.secondary)
                }
                Spacer()
            } else {
                ScrollView {
                    Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 7) {
                        GridRow {
                            Text("插件").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                            Text("当前版本").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .frame(width: 88, alignment: .leading)
                            Text("最新版本").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .frame(width: 88, alignment: .leading)
                            Text("最新支持 DSH").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .frame(width: 190, alignment: .leading)
                            Text("状态").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .frame(width: 104, alignment: .leading)
                            Text("操作").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                                .frame(width: 68, alignment: .leading)
                        }
                        ForEach(pluginGroups) { group in
                            GridRow {
                                Text("\(group.title)（\(group.rows.count)）")
                                    .font(.callout.weight(.semibold))
                                    .padding(.top, 8)
                                    .gridCellColumns(6)
                            }
                            ForEach(group.rows) { row in
                                GridRow {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name)
                                        if let supportedDsh = row.supportedDsh {
                                            Text("DSH 兼容声明：\(supportedDsh)")
                                                .font(.caption2).foregroundStyle(.secondary)
                                        }
                                        if !row.note.isEmpty {
                                            Text(row.note).font(.caption2).foregroundStyle(.secondary)
                                        }
                                    }
                                    .help(row.note)
                                    Text(row.current ?? "未知").frame(width: 88, alignment: .leading)
                                    Text(row.latest ?? "—").frame(width: 88, alignment: .leading)
                                    Text(row.latestSupportedDsh ?? "—")
                                        .font(.caption2).foregroundStyle(.secondary)
                                        .frame(width: 190, alignment: .leading)
                                        .help(row.latestSupportedDsh ?? "")
                                    Text(row.statusText)
                                        .foregroundStyle(row.status == "newer" ? Color.orange : Color.secondary)
                                        .frame(width: 104, alignment: .leading)
                                    actionCell(for: row).frame(width: 68, alignment: .leading)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 10)
                }
                .frame(maxHeight: 500)
            }
        }
        .frame(minWidth: 820, maxWidth: 1080, minHeight: 420)
        .alert("插件已更新", isPresented: $model.showPluginRestartPrompt) {
            Button("重启服务") { model.restartAfterPluginUpdate() }
            Button("稍后") { model.postponePluginRestart() }
        } message: {
            Text("\(model.pluginUpdateStatus) 重启会重新连接全局实例；选择稍后时，运行中的引擎继续使用旧版本。")
        }
        .task { if model.pluginRows.isEmpty { model.checkPluginVersions() } }
    }

    @ViewBuilder
    private func actionCell(for row: PluginVersionRow) -> some View {
        if model.updatingPackages.contains(row.name) {
            Text("更新中…").foregroundStyle(.secondary)
        } else if row.isUpdatable {
            Button("更新") { model.updatePlugins([row.name]) }.disabled(busy)
        }
    }
}

@MainActor
private final class ManagementWindow {
    static let shared = ManagementWindow()

    fileprivate let window: NSWindow

    private init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 620, height: 680),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "DSH Workflow 管理"
        window.contentViewController = NSHostingController(rootView: ManagementView(model: LauncherModel.shared))
        // The grouped Form wraps content in a scroll container whose ideal height collapses;
        // NSHostingController would otherwise shrink the window to the title bar.
        window.setContentSize(NSSize(width: 620, height: 680))
        window.contentMinSize = NSSize(width: 560, height: 480)
        window.contentMaxSize = NSSize(width: 620, height: 2000)
        window.isReleasedWhenClosed = false
        window.center()
        self.window = window
    }

    func show() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@MainActor
private final class PluginWindow {
    static let shared = PluginWindow()

    private let window: NSWindow

    private init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 950, height: 560),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "插件管理"
        window.contentViewController = NSHostingController(rootView: PluginManageView(model: LauncherModel.shared))
        // NSHostingController shrinks the window to the view's fitting size; the table's
        // ideal height collapses without this, leaving no room for the rows.
        window.setContentSize(NSSize(width: 950, height: 560))
        window.contentMinSize = NSSize(width: 820, height: 380)
        window.contentMaxSize = NSSize(width: 1100, height: 2000)
        window.isReleasedWhenClosed = false
        window.center()
        self.window = window
    }

    func show() {
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

@main
struct DSHWorkflowLauncher: App {
    @NSApplicationDelegateAdaptor(LauncherDelegate.self) private var delegate
    @StateObject private var model = LauncherModel.shared

    var body: some Scene {
        MenuBarExtra("DSH Workflow", systemImage: model.isReady ? "bolt.circle.fill" : "bolt.circle") {
            MenuContent(model: model)
        }
    }
}

private struct MenuContent: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        Text(model.status)
        Button("打开 DSH") { model.requestGlobalOpen() }
        Divider()
        Button("打开 Web 入口") { model.openBrowser() }.disabled(!model.isReady)
        Button("重连 Web") { model.restart() }.disabled(!model.isActive)
        Divider()
        Button("管理…") { ManagementWindow.shared.show() }
        Button("插件管理…") { PluginWindow.shared.show() }
        Button("查看日志") { model.showLog() }.disabled(model.logPath == nil)
        Button("检查应用更新") { model.checkForUpdates() }.disabled(model.isCheckingUpdates)
        if model.pluginRestartAvailable {
            Button("重启以应用插件") { model.restartAfterPluginUpdate() }
        }
        if model.updatePage != nil {
            Button("查看新版本") { model.openUpdatePage() }
        }
        Divider()
        Button("退出启动器") { NSApp.terminate(nil) }
    }
}
