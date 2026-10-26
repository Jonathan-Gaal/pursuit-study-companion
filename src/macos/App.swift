import AppKit
import WebKit

final class LocalAuthTransport: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) {
        completionHandler(nil)
    }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var dashboardURL: URL {
        let port = Bundle.main.object(forInfoDictionaryKey: "PursuitDashboardPort") as? String ?? "4782"
        return URL(string: "http://127.0.0.1:\(port)")!
    }
    private var window: NSWindow!
    private var webView: WKWebView!
    private var serverProcess: Process?
    private var readinessTimer: Timer?
    private var attempts = 0
    private var signInWindow: NSWindow?
    private var signInView: WKWebView?
    private var savingToken = false
    private var signInOnReady = ProcessInfo.processInfo.arguments.contains("--sign-in")

    private var projectRoot: URL {
        let path = Bundle.main.object(forInfoDictionaryKey: "PursuitProjectRoot") as? String
        return URL(fileURLWithPath: path ?? Bundle.main.bundleURL.deletingLastPathComponent().path)
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        if let iconURL = Bundle.main.url(forResource: "AppIcon", withExtension: "icns"),
           let icon = NSImage(contentsOf: iconURL) {
            NSApp.applicationIconImage = icon
        }
        makeWindow()
        if !dashboardIsAvailable() { startDashboardServer() }
        waitForDashboard()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window.makeKeyAndOrderFront(nil)
        openSignIn()
        return true
    }

    private func makeWindow() {
        let rect = NSRect(x: 0, y: 0, width: 1120, height: 820)
        window = NSWindow(contentRect: rect, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Pursuit Study Companion"
        window.center()
        window.minSize = NSSize(width: 720, height: 560)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(self, name: "connectPursuit")
        webView = WKWebView(frame: rect, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        window.contentView = webView
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func isDashboardURL(_ url: URL) -> Bool {
        url.scheme == dashboardURL.scheme && url.host == dashboardURL.host && url.port == dashboardURL.port
    }

    private func openExternalLink(_ url: URL) {
        guard ["https", "http"].contains(url.scheme?.lowercased() ?? ""),
              url.host != nil, url.user == nil, url.password == nil else { return }
        if !NSWorkspace.shared.open(url) {
            showError("Could not open the link in your default browser.")
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if webView === signInView {
            decisionHandler(url.scheme == "https" ? .allow : .cancel)
            return
        }
        if isDashboardURL(url) {
            decisionHandler(.allow)
        } else {
            openExternalLink(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        guard navigationAction.targetFrame == nil, let url = navigationAction.request.url else { return nil }
        if webView === signInView {
            if url.scheme == "https" { webView.load(URLRequest(url: url)) }
            return nil
        }
        if isDashboardURL(url) {
            webView.load(URLRequest(url: url))
        } else {
            openExternalLink(url)
        }
        return nil
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame else { return }
        let origin = message.frameInfo.securityOrigin
        if message.name == "connectPursuit", message.webView === webView,
           origin.protocol == "http", origin.host == "127.0.0.1", origin.port == dashboardURL.port {
            openSignIn()
            return
        }
        guard message.name == "pursuitToken", message.webView === signInView,
              origin.protocol == "https", origin.host == "platform.pursuit.org", origin.port == 443 || origin.port == 0,
              let token = message.body as? String, token.count <= 16384,
              token.range(of: #"^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$"#, options: .regularExpression) != nil,
              !savingToken else { return }
        savingToken = true
        var request = URLRequest(url: dashboardURL.appendingPathComponent("api/auth/token"), timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token])
        let session = URLSession(configuration: .ephemeral, delegate: LocalAuthTransport(), delegateQueue: nil)
        session.dataTask(with: request) { [weak self] _, response, _ in
            session.finishTasksAndInvalidate()
            let success = (response as? HTTPURLResponse)?.statusCode == 200
            Task { @MainActor in
                guard let self else { return }
                self.savingToken = false
                if success {
                    self.signInWindow?.close()
                    self.signInView?.configuration.userContentController.removeScriptMessageHandler(forName: "pursuitToken")
                    self.signInView = nil
                    self.signInWindow = nil
                    self.webView.evaluateJavaScript("window.dispatchEvent(new Event('pursuit-auth-updated'))", completionHandler: nil)
                } else {
                    self.showError("Could not verify the new Pursuit session. Check your connection, then close and reopen Sign in to Pursuit to try again.")
                }
            }
        }.resume()
    }

    private func openSignIn() {
        if let signInWindow, signInWindow.isVisible {
            signInWindow.makeKeyAndOrderFront(nil)
            return
        }
        guard let script = try? String(contentsOf: projectRoot.appendingPathComponent("src/pursuit/captureToken.js"), encoding: .utf8) else {
            showError("The Pursuit sign-in helper is missing. Rebuild the app.")
            return
        }
        signInView?.configuration.userContentController.removeScriptMessageHandler(forName: "pursuitToken")
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()
        configuration.userContentController.add(self, name: "pursuitToken")
        configuration.userContentController.addUserScript(WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1000, height: 760), configuration: configuration)
        view.navigationDelegate = self
        view.uiDelegate = self
        let login = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        login.title = "Sign in to Pursuit — session connects automatically"
        login.isReleasedWhenClosed = false
        login.contentView = view
        login.center()
        signInView = view
        signInWindow = login
        login.makeKeyAndOrderFront(nil)
        view.load(URLRequest(url: URL(string: "https://platform.pursuit.org/learning")!))
    }

    private func dashboardIsAvailable() -> Bool {
        var request = URLRequest(url: dashboardURL.appendingPathComponent("api/status"), timeoutInterval: 1)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        let semaphore = DispatchSemaphore(value: 0)
        var available = false
        URLSession.shared.dataTask(with: request) { data, response, _ in
            if let data, let status = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                available = (response as? HTTPURLResponse)?.statusCode == 200 && status["app"] as? String == "pursuit-study-companion"
            }
            semaphore.signal()
        }.resume()
        _ = semaphore.wait(timeout: .now() + 1.2)
        return available
    }

    private func startDashboardServer() {
        let node = URL(fileURLWithPath: Bundle.main.object(forInfoDictionaryKey: "PursuitNodePath") as? String ?? "/usr/local/bin/node")
        let entry = projectRoot.appendingPathComponent("src/dashboard/server.ts")
        let runtime = projectRoot.appendingPathComponent(".runtime")
        try? FileManager.default.createDirectory(at: runtime, withIntermediateDirectories: true)
        let log = runtime.appendingPathComponent("dashboard.log")
        if !FileManager.default.fileExists(atPath: log.path) {
            FileManager.default.createFile(atPath: log.path, contents: nil, attributes: [.posixPermissions: 0o600])
        }
        let handle = FileHandle(forWritingAtPath: log.path)
        handle?.seekToEndOfFile()
        let process = Process()
        process.executableURL = node
        process.arguments = ["--import", "tsx", entry.path]
        process.currentDirectoryURL = projectRoot
        process.environment = ProcessInfo.processInfo.environment
        process.environment?["PURSUIT_DASHBOARD_PORT"] = String(dashboardURL.port!)
        process.standardOutput = handle
        process.standardError = handle
        do {
            try process.run()
            serverProcess = process
        } catch {
            showError("Could not start the local dashboard service. Check that Homebrew Node.js is installed and the project folder is available.")
        }
    }

    private func waitForDashboard() {
        if dashboardIsAvailable() {
            readinessTimer?.invalidate()
            webView.load(URLRequest(url: dashboardURL, cachePolicy: .reloadIgnoringLocalCacheData))
            if signInOnReady { signInOnReady = false; openSignIn() }
            return
        }
        attempts += 1
        if attempts >= 30 {
            readinessTimer?.invalidate()
            showError("The dashboard did not start. Check .runtime/dashboard.log for details.")
            return
        }
        readinessTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: false) { [weak self] _ in
            Task { @MainActor in self?.waitForDashboard() }
        }
    }

    private func showError(_ message: String) {
        let alert = NSAlert()
        alert.messageText = "Pursuit Study Companion"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window)
    }
}

@main
struct PursuitLearningAgentMain {
    @MainActor
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.run()
    }
}
