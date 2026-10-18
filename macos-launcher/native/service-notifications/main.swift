import AppKit
import UserNotifications

let application = NSApplication.shared
let center = UNUserNotificationCenter.current()
let command = CommandLine.arguments.dropFirst().first ?? "status"
let faultId = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : nil
let clock = ISO8601DateFormatter()
var finished = false

func finish(_ report: [String: Any]) {
    DispatchQueue.main.async {
        guard !finished else { return }
        finished = true
        if let data = try? JSONSerialization.data(withJSONObject: report, options: [.sortedKeys]) {
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data([10]))
        }
        application.terminate(nil)
    }
}

func errorReport(_ error: Error) -> [String: Any] {
    let value = error as NSError
    return ["domain": value.domain, "code": value.code, "message": value.localizedDescription]
}

func report(_ settings: UNNotificationSettings) -> [String: Any] {
    let status: String
    switch settings.authorizationStatus {
    case .notDetermined: status = "notDetermined"
    case .denied: status = "denied"
    case .authorized: status = "authorized"
    case .provisional: status = "provisional"
    @unknown default: status = "unknown"
    }
    return ["available": true, "command": command, "faultId": faultId as Any? ?? NSNull(),
        "bundleIdentifier": Bundle.main.bundleIdentifier ?? "", "bundlePath": Bundle.main.bundleURL.path,
        "executablePath": Bundle.main.executableURL?.path ?? "", "pid": ProcessInfo.processInfo.processIdentifier,
        "authorization": ["status": status, "rawValue": settings.authorizationStatus.rawValue,
            "notificationCenterSetting": settings.notificationCenterSetting.rawValue,
            "alertSetting": settings.alertSetting.rawValue, "soundSetting": settings.soundSetting.rawValue,
            "scheduledDeliverySetting": settings.scheduledDeliverySetting.rawValue],
        "authorizationRequest": ["state": "not-requested"], "submission": ["state": "not-attempted"],
        "delivery": ["state": "not-queried"], "observedAt": clock.string(from: Date())]
}

let validId = faultId?.range(of: "^[a-zA-Z0-9-]{1,100}$", options: .regularExpression) != nil
guard ["status", "authorize", "notify", "delivered"].contains(command),
    !["notify", "delivered"].contains(command) || validId else {
    fputs("Invalid service notification command or fault identifier\n", stderr)
    exit(2)
}

func inspect(_ authorizationRequest: [String: Any] = ["state": "not-requested"]) {
    center.getNotificationSettings { settings in
        var value = report(settings)
        value["authorizationRequest"] = authorizationRequest
        if command == "delivered" {
            center.getDeliveredNotifications { notifications in
                let matched = notifications.first { $0.request.identifier == faultId }
                var delivery: [String: Any] = ["state": matched == nil ? "not-observed" : "observed",
                    "queriedAt": clock.string(from: Date())]
                if let notification = matched { delivery["date"] = clock.string(from: notification.date) }
                value["delivery"] = delivery
                finish(value)
            }
            return
        }
        guard command == "notify" else { finish(value); return }
        guard settings.authorizationStatus == .authorized || settings.authorizationStatus == .provisional else {
            value["message"] = settings.authorizationStatus == .denied
                ? "macOS 已拒绝服务通知权限，请在系统设置中检查通知权限。"
                : "macOS 服务通知尚未授权，请通过管理入口启用通知。"
            finish(value)
            return
        }
        let content = UNMutableNotificationContent()
        content.title = "DSH 服务意外退出"
        content.subtitle = "请检查日志后手动启动"
        content.body = "服务已保持停止。请打开 DSH Workflow 查看服务日志，确认原因后手动启动。"
        content.sound = .default
        let request = UNNotificationRequest(identifier: faultId!, content: content, trigger: nil)
        center.add(request) { error in
            if let error = error {
                value["submission"] = ["state": "failed", "error": errorReport(error)]
                value["message"] = "macOS 服务通知提交失败，请查看服务日志。"
            } else {
                value["submission"] = ["state": "submitted", "submittedAt": clock.string(from: Date())]
                value["message"] = "服务通知请求已提交；系统交付尚未查询。"
            }
            finish(value)
        }
    }
}

if command == "authorize" {
    center.requestAuthorization(options: [.alert, .sound]) { granted, error in
        var request: [String: Any] = ["state": granted ? "granted" : "not-granted", "completedAt": clock.string(from: Date())]
        if let error = error { request["error"] = errorReport(error) }
        inspect(request)
    }
} else {
    inspect()
}
Timer.scheduledTimer(withTimeInterval: command == "authorize" ? 110 : 8, repeats: false) { _ in
    finish(["available": false, "command": command, "faultId": faultId as Any? ?? NSNull(),
        "submission": ["state": command == "notify" ? "unknown" : "not-attempted"],
        "delivery": ["state": "unknown"], "message": "macOS 通知助手等待系统响应超时。",
        "observedAt": clock.string(from: Date())])
}
application.run()
