import AppKit
import Foundation

private let fileManager = FileManager.default
private let application = NSApplication.shared
private let supportURL = fileManager.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Application Support/DaltiDataStudio", isDirectory: true)
private let logDirectoryURL = fileManager.homeDirectoryForCurrentUser
    .appendingPathComponent("Library/Logs/DaltiDataStudio", isDirectory: true)
private let launcherLogURL = logDirectoryURL.appendingPathComponent("launcher.log")
private let bookmarkURL = supportURL.appendingPathComponent("project-bookmark")

private func logNative(_ level: String, _ message: String) {
    try? fileManager.createDirectory(
        at: logDirectoryURL,
        withIntermediateDirectories: true
    )
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    let line = "[\(formatter.string(from: Date()))] [\(level)] component=native-launcher \(message)\n"
    guard let data = line.data(using: .utf8) else {
        return
    }

    if !fileManager.fileExists(atPath: launcherLogURL.path) {
        fileManager.createFile(atPath: launcherLogURL.path, contents: nil)
    }
    guard let handle = try? FileHandle(forWritingTo: launcherLogURL) else {
        return
    }
    defer { try? handle.close() }
    do {
        try handle.seekToEnd()
        try handle.write(contentsOf: data)
    } catch {
        return
    }
}

private func dataStudioRoot(from startURL: URL) -> URL? {
    var candidate = startURL.standardizedFileURL
    for _ in 0..<12 {
        let server = candidate.appendingPathComponent("server.mjs")
        let package = candidate.appendingPathComponent("package.json")
        if fileManager.fileExists(atPath: server.path),
           fileManager.fileExists(atPath: package.path) {
            return candidate
        }
        let parent = candidate.deletingLastPathComponent()
        if parent.path == candidate.path {
            break
        }
        candidate = parent
    }
    return nil
}

private func dataStudioAncestor(from startURL: URL) -> URL? {
    var candidate = startURL.standardizedFileURL
    for _ in 0..<12 {
        if candidate.lastPathComponent == "data-studio" {
            return candidate
        }
        let parent = candidate.deletingLastPathComponent()
        if parent.path == candidate.path {
            break
        }
        candidate = parent
    }
    return nil
}

private func projectRoot(fromSelection selectedURL: URL) -> URL? {
    if let root = dataStudioRoot(from: selectedURL) {
        return root
    }
    let child = selectedURL.appendingPathComponent("data-studio", isDirectory: true)
    if fileManager.fileExists(atPath: child.appendingPathComponent("server.mjs").path),
       fileManager.fileExists(atPath: child.appendingPathComponent("package.json").path) {
        return child
    }
    return nil
}

private func canReadProject(at rootURL: URL) -> Bool {
    let serverURL = rootURL.appendingPathComponent("server.mjs")
    do {
        _ = try Data(contentsOf: serverURL, options: [.mappedIfSafe])
        logNative("INFO", "project access verified root=\(rootURL.path)")
        return true
    } catch {
        logNative(
            "ERROR",
            "project access denied root=\(rootURL.path) error=\(error.localizedDescription)"
        )
        return false
    }
}

private func loadBookmarkedProject() -> URL? {
    guard let bookmarkData = try? Data(contentsOf: bookmarkURL) else {
        logNative("INFO", "project bookmark not found")
        return nil
    }

    do {
        var isStale = false
        let resolvedURL = try URL(
            resolvingBookmarkData: bookmarkData,
            options: [.withSecurityScope, .withoutUI],
            relativeTo: nil,
            bookmarkDataIsStale: &isStale
        )
        guard !isStale, resolvedURL.startAccessingSecurityScopedResource() else {
            logNative("WARN", "project bookmark stale or inaccessible")
            return nil
        }
        logNative("INFO", "project bookmark resolved root=\(resolvedURL.path)")
        return resolvedURL
    } catch {
        logNative("WARN", "project bookmark resolution failed error=\(error.localizedDescription)")
        return nil
    }
}

private func saveProjectBookmark(for rootURL: URL) {
    do {
        try fileManager.createDirectory(at: supportURL, withIntermediateDirectories: true)
        let bookmarkData = try rootURL.bookmarkData(
            options: [.withSecurityScope],
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        )
        try bookmarkData.write(to: bookmarkURL, options: [.atomic])
        logNative("INFO", "project bookmark saved root=\(rootURL.path)")
    } catch {
        logNative("WARN", "project bookmark save failed error=\(error.localizedDescription)")
    }
}

private func requestProjectAccess(suggestedRoot: URL?) -> URL? {
    application.setActivationPolicy(.regular)
    application.activate(ignoringOtherApps: true)

    let panel = NSOpenPanel()
    panel.title = "Dalti Data Studio 외장하드 접근"
    panel.message = "현재 저장소의 data-studio 폴더를 선택해 주세요. 외장하드 경로가 바뀌면 새 위치를 다시 선택할 수 있습니다."
    panel.prompt = "접근 허용"
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.allowsMultipleSelection = false
    panel.canCreateDirectories = false
    panel.directoryURL = suggestedRoot

    guard panel.runModal() == .OK, let selectedURL = panel.url else {
        logNative("WARN", "project access panel cancelled")
        return nil
    }
    logNative("INFO", "project access selected path=\(selectedURL.path)")
    return projectRoot(fromSelection: selectedURL)
}

private func showFatalError(_ message: String) {
    application.setActivationPolicy(.regular)
    application.activate(ignoringOtherApps: true)
    let alert = NSAlert()
    alert.alertStyle = .critical
    alert.messageText = "Dalti Data Studio"
    alert.informativeText = message
    alert.runModal()
}

private func runLauncher() -> Int32 {
    logNative("INFO", "native launcher start bundle=\(Bundle.main.bundlePath)")
    guard let resourcesURL = Bundle.main.resourceURL else {
        logNative("ERROR", "bundle resources unavailable")
        showFatalError(
            "앱 Resources 폴더를 찾지 못했습니다.\n\n" +
            "실패 단계: native-discover-project\n" +
            "진단 로그: ~/Library/Logs/DaltiDataStudio/launcher.log"
        )
        return 1
    }

    let discoveredRoot = dataStudioAncestor(from: resourcesURL)
    let savedRoot: URL? = {
        let rootFileURL = supportURL.appendingPathComponent("studio-root")
        guard let value = try? String(contentsOf: rootFileURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !value.isEmpty else {
            return nil
        }
        return URL(fileURLWithPath: value, isDirectory: true)
    }()
    let selectedRoot: URL
    if let bookmarkedRoot = loadBookmarkedProject(),
       (discoveredRoot == nil ||
        bookmarkedRoot.standardizedFileURL.path == discoveredRoot?.standardizedFileURL.path),
       canReadProject(at: bookmarkedRoot) {
        selectedRoot = bookmarkedRoot
    } else if let approvedRoot = requestProjectAccess(suggestedRoot: discoveredRoot ?? savedRoot),
              canReadProject(at: approvedRoot) {
        selectedRoot = approvedRoot
        saveProjectBookmark(for: approvedRoot)
    } else {
        logNative("ERROR", "no readable Data Studio project was selected")
        showFatalError(
            "외장하드의 data-studio 폴더 접근 권한이 필요합니다.\n\n" +
            "실패 단계: native-project-access\n" +
            "진단 로그: ~/Library/Logs/DaltiDataStudio/launcher.log"
        )
        return 1
    }

    let launcherURL = resourcesURL.appendingPathComponent("launcher.zsh")
    guard fileManager.isExecutableFile(atPath: launcherURL.path) else {
        logNative("ERROR", "launcher script unavailable path=\(launcherURL.path)")
        showFatalError(
            "실행기를 찾지 못했습니다: \(launcherURL.path)\n\n" +
            "실패 단계: native-launcher-resource\n" +
            "진단 로그: ~/Library/Logs/DaltiDataStudio/launcher.log"
        )
        return 1
    }

    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/bin/zsh")
    process.arguments = [launcherURL.path]
    var environment = ProcessInfo.processInfo.environment
    environment["DALTI_DATA_STUDIO_ROOT"] = selectedRoot.path
    process.environment = environment
    process.standardInput = FileHandle.nullDevice
    process.standardOutput = FileHandle.nullDevice
    process.standardError = FileHandle.nullDevice

    do {
        logNative("INFO", "shell launcher start root=\(selectedRoot.path)")
        try process.run()
        process.waitUntilExit()
        logNative("INFO", "shell launcher exit status=\(process.terminationStatus)")
        return process.terminationStatus
    } catch {
        logNative("ERROR", "shell launcher failed error=\(error.localizedDescription)")
        showFatalError(
            "런처 실행에 실패했습니다: \(error.localizedDescription)\n\n" +
            "실패 단계: native-shell-launch\n" +
            "진단 로그: ~/Library/Logs/DaltiDataStudio/launcher.log"
        )
        return 1
    }
}

private final class LauncherDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApplication.shared.activate(ignoringOtherApps: true)
        DispatchQueue.main.async {
            let status = runLauncher()
            NSApplication.shared.terminate(nil)
            exit(status)
        }
    }
}

private let launcherDelegate = LauncherDelegate()
application.delegate = launcherDelegate
application.setActivationPolicy(.regular)
application.run()
