import AppKit
import ServiceManagement
import SwiftUI
import Darwin
import Security

private enum LanPasswordStore {
    static let service = "com.ghostagent.dsh-workflow-launcher"
    static let account = "lan-password"

    static func load() -> String? {
        var item: CFTypeRef?
        // Skip the approval UI: a freshly installed ad-hoc build is a new code identity, and a
        // blocking dialog here freezes the app at launch. The management window asks the user
        // to set the password again, and approving the save dialog re-authorizes the build.
        let status = SecItemCopyMatching([
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: account,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
            kSecUseAuthenticationUI: kSecUseAuthenticationUISkip,
        ] as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ password: String) throws {
        let query = [kSecClass: kSecClassGenericPassword,
                     kSecAttrService: service,
                     kSecAttrAccount: account] as CFDictionary
        let bytes = Data(password.utf8)
        let status = SecItemUpdate(query, [kSecValueData: bytes] as CFDictionary)
        if status == errSecSuccess { return }
        guard status == errSecItemNotFound else { throw error(status) }
        let add = [kSecClass: kSecClassGenericPassword,
                   kSecAttrService: service,
                   kSecAttrAccount: account,
                   kSecValueData: bytes] as CFDictionary
        let added = SecItemAdd(add, nil)
        guard added == errSecSuccess else { throw error(added) }
    }

    private static func error(_ status: OSStatus) -> NSError {
        NSError(domain: NSOSStatusErrorDomain, code: Int(status),
                userInfo: [NSLocalizedDescriptionKey: "钥匙串保存失败（\(status)）"])
    }
}

private struct ReadyEvent: Decodable {
    let port: Int
    let url: URL
    let logPath: String?
    let lanUrls: [URL]?
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

struct PluginVersionRow: Decodable, Identifiable {
    let source: String
    let name: String
    let current: String?
    let latest: String?
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

    @Published var fullAccess: Bool
    @Published var passwordDraft = ""
    @Published private(set) var hasLanPassword = false
    @Published private(set) var status = "已停止"
    @Published private(set) var lastError = ""
    @Published private(set) var browserURL: URL?
    @Published private(set) var lanURLs: [URL] = []
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
            return
        }
        guard let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else {
            lastError = "无法定位应用数据目录。"
            return
        }
        let catalogBase = support.appendingPathComponent("DSH Workflow", isDirectory: true)
        guard let resources = Bundle.main.resourceURL else {
            lastError = "应用资源目录不可用。"
            return
        }
        let node = resources.appendingPathComponent("node")
        let launcher = resources.appendingPathComponent("workflow/macos-launcher/runtime/catalog-supervisor.mjs")
        guard FileManager.default.isExecutableFile(atPath: node.path),
              FileManager.default.fileExists(atPath: launcher.path) else {
            lastError = "包内 DSH 运行时不完整，请重新构建应用。"
            return
        }
        UserDefaults.standard.set(fullAccess, forKey: "fullAccess")
        browserURL = nil
        lanURLs = []
        logPath = nil
        lastError = ""
        status = "正在启动"
        outputBuffer = Data()

        let process = Process()
        process.executableURL = node
        process.arguments = [launcher.path, resources.path, catalogBase.path]
        process.currentDirectoryURL = resources
        var environment = ProcessInfo.processInfo.environment
        environment["DSH_PERMISSION_MODE"] = fullAccess ? "danger-full-access" : "workspace-write"
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
                guard let version = versions[row.name], row.source == "DSH Web profile" else { return row }
                return PluginVersionRow(source: row.source, name: row.name, current: version,
                                        latest: version, status: "current", note: "已更新；重启后运行中的引擎才会加载", updatable: false)
            }
            pluginUpdateStatus = report.error.map { "已更新 \(report.updated.count) 个插件，但其余更新失败：\($0)" }
                ?? "已更新 \(report.updated.count) 个 Web profile 插件；运行中的 DSH 尚未切换版本。"
            pluginRestartAvailable = isActive
            showPluginRestartPrompt = isActive
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
                logPath = ready.logPath
                status = "导航页运行中 · 端口 \(ready.port)；DSH 按需启动"
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
        LauncherModel.shared.checkPluginVersions()
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
            LabeledContent("应用版本") { Text(model.appVersionText).textSelection(.enabled) }
            HStack {
                Button("在浏览器中打开") { model.openBrowser() }.disabled(!model.isReady)
                Button("启动") { model.start() }.disabled(model.isActive)
                Button("停止") { model.stop() }.disabled(!model.isActive)
                Button("重启") { model.restart() }.disabled(!model.isActive)
            }
            Text("Catalog 列表、目录及各 DSH 引擎在导航页管理；新 Catalog 会创建独立目录，也可以加入已有目录保留 Registry 绑定。")
                .font(.caption).foregroundStyle(.secondary)
            Toggle("DSH 工具使用完整访问权限", isOn: $model.fullAccess)
            HStack {
                SecureField("内网访问密码", text: $model.passwordDraft)
                Button(model.hasLanPassword ? "修改密码" : "设置密码") { model.saveLanPassword() }
                    .disabled(model.passwordDraft.isEmpty)
            }
            Text(model.hasLanPassword ? "密码保存在 macOS 钥匙串，修改后立即撤销旧的内网登录。" : "设置密码后才能开启内网入口。")
                .font(.caption).foregroundStyle(.secondary)
            if !model.lanURLs.isEmpty {
                LabeledContent("内网入口") {
                    VStack(alignment: .trailing) {
                        ForEach(model.lanURLs, id: \.absoluteString) { url in
                            Text(url.absoluteString).textSelection(.enabled)
                        }
                    }
                }
            }
            Toggle("登录后启动应用", isOn: Binding(get: { model.launchAtLogin }, set: { model.setLaunchAtLogin($0) }))
            Text("权限在下次启动或重启时生效。第三方插件由 DSH 用户 profile 管理。")
                .font(.caption).foregroundStyle(.secondary)
            HStack {
                Text(model.updateStatus).font(.caption)
                Spacer()
                Button("检查更新") { model.checkForUpdates() }.disabled(model.isCheckingUpdates)
                Button("查看新版本") { model.openUpdatePage() }.disabled(model.updatePage == nil)
            }
            Divider()
            HStack {
                Text("插件管理").font(.headline)
                Spacer()
                Button("插件管理…") { PluginWindow.shared.show() }
            }
            Text(model.pluginCheckStatus).font(.caption)
            Text(model.pluginUpdateStatus).font(.caption).foregroundStyle(.secondary)
            if model.pluginRestartAvailable {
                HStack {
                    Text("插件已更新，等待重启生效。").font(.caption).foregroundStyle(.orange)
                    Spacer()
                    Button("重启以应用") { model.restartAfterPluginUpdate() }
                }
            }
            Text("每个插件的当前版本和最新版本逐行显示在插件管理窗口；npm 安装的第三方插件可单独更新。DSH、自研插件与内置 Bundle 随应用构建更新。")
                .font(.caption).foregroundStyle(.secondary)
            if !model.lastError.isEmpty {
                Text(model.lastError).font(.caption).foregroundStyle(.red).textSelection(.enabled)
            }
            Button("查看日志") { model.showLog() }.disabled(model.logPath == nil)
        }
        .padding(20)
        .frame(width: 560)
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
        ("DSH Web profile Bundle", "Profile Bundle"),
        ("项目插件锁定清单（打包快照）", "项目插件（打包时快照）"),
        ("DSH 内置 Bundle", "DSH 内置 Bundle（随 DSH 更新）"),
        ("DSH 版本绑定插件", "DSH 版本绑定插件"),
        ("App 内置自研插件", "自研插件（随 App 更新）"),
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
                                    .gridCellColumns(5)
                            }
                            ForEach(group.rows) { row in
                                GridRow {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(row.name)
                                        if !row.note.isEmpty {
                                            Text(row.note).font(.caption2).foregroundStyle(.secondary)
                                        }
                                    }
                                    .help(row.note)
                                    Text(row.current ?? "未知").frame(width: 88, alignment: .leading)
                                    Text(row.latest ?? "—").frame(width: 88, alignment: .leading)
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
        .frame(minWidth: 500, maxWidth: 800, minHeight: 420)
        .alert("插件已更新", isPresented: $model.showPluginRestartPrompt) {
            Button("重启服务") { model.restartAfterPluginUpdate() }
            Button("稍后") { model.postponePluginRestart() }
        } message: {
            Text("\(model.pluginUpdateStatus) 重启会关闭当前所有 Catalog 引擎，再按需启动；选择稍后时，运行中的引擎继续使用旧版本。")
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

    private let window: NSWindow

    private init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 640, height: 560),
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

@MainActor
private final class PluginWindow {
    static let shared = PluginWindow()

    private let window: NSWindow

    private init() {
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 720, height: 560),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "插件管理"
        window.contentViewController = NSHostingController(rootView: PluginManageView(model: LauncherModel.shared))
        // NSHostingController shrinks the window to the view's fitting size; the table's
        // ideal height collapses without this, leaving no room for the rows.
        window.setContentSize(NSSize(width: 720, height: 560))
        window.contentMinSize = NSSize(width: 500, height: 380)
        window.contentMaxSize = NSSize(width: 800, height: 2000)
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
