import Cocoa
import FlutterMacOS

class MainFlutterWindow: NSWindow {
  override func awakeFromNib() {
    let flutterViewController = FlutterViewController()
    let windowFrame = self.frame
    self.contentViewController = flutterViewController
    self.setFrame(windowFrame, display: true)

    RegisterGeneratedPlugins(registry: flutterViewController)

    (NSApp.delegate as? AppDelegate)?.installChannel(flutterViewController.engine.binaryMessenger)
    self.setContentSize(NSSize(width: 980, height: 720))
    self.minSize = NSSize(width: 780, height: 560)
    self.isReleasedWhenClosed = false

    super.awakeFromNib()
  }

  override func close() { orderOut(nil) }
}
