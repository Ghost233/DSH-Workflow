import AppKit
import ServiceManagement
import SwiftUI
import Darwin

private struct ReadyEvent: Decodable {
    let port: Int
    let url: URL
    let logPath: String
}

@MainActor
final class LauncherModel: ObservableObject {
    static let shared = LauncherModel()

    @Published var portText: String
    @Published var workspacePath: String
    @Published var fullAccess: Bool
    @Published private(set) var status = "已停止"
    @Published private(set) var lastError = ""
    @Published private(set) var browserURL: URL?
    @Published private(set) var logPath: String?
    @Published private(set) var launchAtLogin = false
    @Published private(set) var updateStatus = "尚未检查更新"
    @Published private(set) var updatePage: URL?
    @Published private(set) var isCheckingUpdates = false

    private var child: Process?
    private var output: Pipe?
    private var outputBuffer = Data()
    private var restartPending = false

    var isActive: Bool { child != nil }
    var isReady: Bool { browserURL != nil && child?.isRunning == true }

    private init() {
        let defaults = UserDefaults.standard
        portText = String(defaults.integer(forKey: "webPort") == 0 ? 3080 : defaults.integer(forKey: "webPort"))
        workspacePath = defaults.string(forKey: "workspacePath") ?? FileManager.default.homeDirectoryForCurrentUser.path
        fullAccess = defaults.object(forKey: "fullAccess") as? Bool ?? true
        launchAtLogin = SMAppService.mainApp.status == .enabled
    }

    func start() {
        guard child == nil else { return }
        guard let port = Int(portText), (1...65535).contains(port) else {
            lastError = "端口必须是 1–65535 之间的整数。"
            return
        }
        var isDirectory: ObjCBool = false
        guard FileManager.default.fileExists(atPath: workspacePath, isDirectory: &isDirectory), isDirectory.boolValue else {
            lastError = "工作目录不存在：\(workspacePath)"
            return
        }
        guard let resources = Bundle.main.resourceURL else {
            lastError = "应用资源目录不可用。"
            return
        }
        let node = resources.appendingPathComponent("node")
        let launcher = resources.appendingPathComponent("workflow/macos-launcher/runtime/web-launch.mjs")
        guard FileManager.default.isExecutableFile(atPath: node.path),
              FileManager.default.fileExists(atPath: launcher.path) else {
            lastError = "包内 DSH 运行时不完整，请重新构建应用。"
            return
        }
        UserDefaults.standard.set(port, forKey: "webPort")
        UserDefaults.standard.set(workspacePath, forKey: "workspacePath")
        UserDefaults.standard.set(fullAccess, forKey: "fullAccess")
        browserURL = nil
        logPath = nil
        lastError = ""
        status = "正在启动"
        outputBuffer = Data()

        let process = Process()
        process.executableURL = node
        process.arguments = [launcher.path, resources.path, workspacePath, String(port)]
        process.currentDirectoryURL = URL(fileURLWithPath: workspacePath, isDirectory: true)
        var environment = ProcessInfo.processInfo.environment
        environment["DSH_PERMISSION_MODE"] = fullAccess ? "danger-full-access" : "workspace-write"
        process.environment = environment
        let pipe = Pipe()
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
        do {
            try process.run()
        } catch {
            pipe.fileHandleForReading.readabilityHandler = nil
            child = nil
            output = nil
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
        guard let child else { start(); return }
        restartPending = true
        status = "正在重启"
        child.terminate()
        forceStopIfNeeded(child)
    }

    func openBrowser() {
        if let browserURL { NSWorkspace.shared.open(browserURL) }
    }

    func showLog() {
        if let logPath {
            NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: logPath)])
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
                logPath = ready.logPath
                status = "运行中 · 127.0.0.1:\(ready.port)"
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
        child = nil
        browserURL = nil
        logPath = nil
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
    func applicationDidFinishLaunching(_ notification: Notification) {
        LauncherModel.shared.start()
        ManagementWindow.shared.show()
        LauncherModel.shared.checkForUpdates()
    }

    func applicationWillTerminate(_ notification: Notification) {
        LauncherModel.shared.stop()
    }
}

private struct ManagementView: View {
    @ObservedObject var model: LauncherModel

    var body: some View {
        Form {
            LabeledContent("服务状态") { Text(model.status) }
            HStack {
                Button("在浏览器中打开") { model.openBrowser() }.disabled(!model.isReady)
                Button("启动") { model.start() }.disabled(model.isActive)
                Button("停止") { model.stop() }.disabled(!model.isActive)
                Button("重启") { model.restart() }.disabled(!model.isActive)
            }
            TextField("端口", text: $model.portText)
            HStack {
                TextField("工作目录", text: $model.workspacePath)
                Button("选择…") {
                    let panel = NSOpenPanel()
                    panel.canChooseDirectories = true
                    panel.canChooseFiles = false
                    if panel.runModal() == .OK, let url = panel.url { model.workspacePath = url.path }
                }
            }
            Toggle("DSH 工具使用完整访问权限", isOn: $model.fullAccess)
            Toggle("登录后启动应用", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
            Text("端口、工作目录和权限在下次启动或重启时生效。第三方插件由 DSH 用户 profile 管理。")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Text(model.updateStatus).font(.caption)
                Spacer()
                Button("检查更新") { model.checkForUpdates() }.disabled(model.isCheckingUpdates)
                Button("查看新版本") { model.openUpdatePage() }.disabled(model.updatePage == nil)
            }
            if !model.lastError.isEmpty {
                Text(model.lastError).font(.caption).foregroundStyle(.red).textSelection(.enabled)
            }
            Button("查看日志") { model.showLog() }.disabled(model.logPath == nil)
        }
        .padding(20)
        .frame(width: 560)
    }
}

@MainActor
private final class ManagementWindow {
    static let shared = ManagementWindow()

    private let window: NSWindow

    private init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 560, height: 380),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "DSH Workflow 管理"
        window.contentViewController = NSHostingController(rootView: ManagementView(model: LauncherModel.shared))
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
        Button("打开 DSH") { model.openBrowser() }.disabled(!model.isReady)
        Divider()
        Button("启动") { model.start() }.disabled(model.isActive)
        Button("停止") { model.stop() }.disabled(!model.isActive)
        Button("重启") { model.restart() }.disabled(!model.isActive)
        Divider()
        Button("管理…") { ManagementWindow.shared.show() }
        Button("查看日志") { model.showLog() }.disabled(model.logPath == nil)
        Button("检查更新") { model.checkForUpdates() }.disabled(model.isCheckingUpdates)
        if model.updatePage != nil {
            Button("查看新版本") { model.openUpdatePage() }
        }
        Divider()
        Button("退出启动器") { NSApp.terminate(nil) }
    }
}
