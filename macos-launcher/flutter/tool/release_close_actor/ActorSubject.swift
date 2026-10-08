import AppKit
import CoreGraphics
import Darwin

if CommandLine.arguments.count == 3 && CommandLine.arguments[1] == "--owned-windows" {
  let ownedPid = Int32(CommandLine.arguments[2])!
  let rows = CGWindowListCopyWindowInfo([.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
  let owned = rows.filter { ($0[kCGWindowOwnerPID as String] as? NSNumber)?.int32Value == ownedPid }
  let details = owned.map { row in Dictionary(uniqueKeysWithValues: [kCGWindowNumber, kCGWindowLayer, kCGWindowAlpha, kCGWindowName, kCGWindowBounds].compactMap { key in row[key as String].map { (key as String, $0) } }) }
  print(String(data: try JSONSerialization.data(withJSONObject: details), encoding: .utf8)!)
  exit(0)
}

final class ActorSubject: NSObject, NSApplicationDelegate, NSWindowDelegate {
  private var window: NSWindow?
  func applicationDidFinishLaunching(_ notification: Notification) {
    let owned = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 420, height: 260),
                         styleMask: [.titled, .closable, .miniaturizable, .resizable],
                         backing: .buffered, defer: false)
    owned.title = "Owned T09 actor subject"
    owned.delegate = self
    owned.isReleasedWhenClosed = false
    owned.makeKeyAndOrderFront(nil)
    window = owned
    NSApplication.shared.activate(ignoringOtherApps: true)
  }
  func windowWillClose(_ notification: Notification) {
    FileHandle.standardOutput.write(Data("OWNED_SUBJECT_WINDOW_WILL_CLOSE pid=\(getpid())\n".utf8))
  }
  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { false }
}

let application = NSApplication.shared
let delegate = ActorSubject()
application.delegate = delegate
application.setActivationPolicy(.regular)
application.run()
