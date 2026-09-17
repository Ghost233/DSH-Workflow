import Foundation

@main
struct UpdatePolicyTests {
    static func main() throws {
        let releases = """
        [
          {"tag_name":"v9.0.0","draft":false,"prerelease":false},
          {"tag_name":"macos-v1.2.0","draft":true,"prerelease":false},
          {"tag_name":"macos-v1.3.0","draft":false,"prerelease":true},
          {"tag_name":"macos-v1.1.9","draft":false,"prerelease":false},
          {"tag_name":"macos-v1.2.0","draft":false,"prerelease":false},
          {"tag_name":"macos-v01.9.0","draft":false,"prerelease":false}
        ]
        """.data(using: .utf8)!
        let candidate = try UpdatePolicy.newerRelease(in: releases, than: "1.1.10")
        precondition(candidate?.version == "1.2.0")
        precondition(candidate?.page.absoluteString == "https://github.com/Ghost233/DSH-Workflow/releases/tag/macos-v1.2.0")
        let current = try UpdatePolicy.newerRelease(in: releases, than: "1.2.0")
        let empty = try UpdatePolicy.newerRelease(in: Data("[]".utf8), than: "1.0.0")
        precondition(current == nil)
        precondition(empty == nil)
        precondition(LauncherVersion("1.10.0")! > LauncherVersion("1.9.9")!)
        precondition(LauncherVersion("01.2.0") == nil)
        print("UpdatePolicy tests passed")
    }
}
