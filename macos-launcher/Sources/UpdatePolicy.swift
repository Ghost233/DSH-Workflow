import Foundation

struct LauncherVersion: Comparable {
    let major: Int
    let minor: Int
    let patch: Int

    init?(_ value: String) {
        let parts = value.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 3,
              let major = Int(parts[0]), let minor = Int(parts[1]), let patch = Int(parts[2]),
              major >= 0, minor >= 0, patch >= 0,
              String(major) == parts[0], String(minor) == parts[1], String(patch) == parts[2] else {
            return nil
        }
        self.major = major
        self.minor = minor
        self.patch = patch
    }

    static func < (lhs: Self, rhs: Self) -> Bool {
        if lhs.major != rhs.major { return lhs.major < rhs.major }
        if lhs.minor != rhs.minor { return lhs.minor < rhs.minor }
        return lhs.patch < rhs.patch
    }
}

struct UpdateCandidate {
    let version: String
    let page: URL
}

private struct GitHubRelease: Decodable {
    let tagName: String
    let draft: Bool
    let prerelease: Bool

    enum CodingKeys: String, CodingKey {
        case tagName = "tag_name"
        case draft
        case prerelease
    }
}

enum UpdatePolicy {
    static let apiURL = URL(string: "https://api.github.com/repos/Ghost233/DSH-Workflow/releases?per_page=100")!

    static func newerRelease(in data: Data, than installed: String) throws -> UpdateCandidate? {
        guard let current = LauncherVersion(installed) else { return nil }
        let releases = try JSONDecoder().decode([GitHubRelease].self, from: data)
        let available = releases.compactMap { release -> (String, LauncherVersion)? in
            guard !release.draft, !release.prerelease,
                  release.tagName.hasPrefix("macos-v"),
                  let version = LauncherVersion(String(release.tagName.dropFirst("macos-v".count))),
                  version > current else { return nil }
            return (release.tagName, version)
        }
        guard let newest = available.max(by: { $0.1 < $1.1 }),
              let page = URL(string: "https://github.com/Ghost233/DSH-Workflow/releases/tag/\(newest.0)") else {
            return nil
        }
        return UpdateCandidate(version: String(newest.0.dropFirst("macos-v".count)), page: page)
    }
}
