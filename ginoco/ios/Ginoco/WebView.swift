import SwiftUI
import WebKit

// Native Hülle um ginoco.de. Verhält sich wie eine echte App:
//  - kein Browser-Rahmen (keine Adressleiste, keine Tabs)
//  - Anmeldung bleibt bestehen (persistenter Cookie-Speicher)
//  - Wischen von links = zurück
//  - Nach unten ziehen = neu laden
//  - tel:/mailto:/sms: und fremde Domains öffnen im System (Telefon, Mail, Safari)
//  - schlägt das Laden fehl, erscheint eine freundliche Fehlerseite mit „Erneut versuchen"
struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.websiteDataStore = .default() // persistent -> Sitzung bleibt erhalten
        // Offizieller Weg, die App-Kennung an den User-Agent anzuhängen.
        config.applicationNameForUserAgent = "GinocoApp/1.0"

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .always
        web.isOpaque = true
        web.backgroundColor = .systemBackground

        // Nach unten ziehen zum Aktualisieren.
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh(_:)), for: .valueChanged)
        web.scrollView.refreshControl = refresh

        context.coordinator.web = web
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
        weak var web: WKWebView?
        let startURL: URL

        init(url: URL) { self.startURL = url }

        @objc func handleRefresh(_ sender: UIRefreshControl) {
            reload()
        }

        func reload() {
            if let web, web.url != nil {
                web.reload()
            } else {
                web?.load(URLRequest(url: startURL))
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        // Fehler NACH dem Verbindungsaufbau.
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            showError(webView, error)
        }

        // Fehler BEIM Verbindungsaufbau (offline, DNS, TLS) – das war vorher unsichtbar.
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            showError(webView, error)
        }

        private func showError(_ webView: WKWebView, _ error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
            let ns = error as NSError
            // Abbruch durch neue Navigation ist kein echter Fehler.
            if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return }
            if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
            let msg = ns.localizedDescription
            let html = """
            <!doctype html><html lang="de"><head><meta charset="utf-8">
            <meta name="viewport" content="width=device-width,initial-scale=1">
            <style>
              :root{color-scheme:light dark}
              body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;
                   font:-apple-system-body;font-family:-apple-system,system-ui,sans-serif;
                   background:#fff;color:#111}
              @media (prefers-color-scheme:dark){body{background:#000;color:#eee}}
              .box{max-width:22rem;text-align:center;padding:2rem}
              h1{font-size:1.25rem;margin:.2rem 0 .6rem}
              p{opacity:.7;font-size:.95rem;line-height:1.4}
              button{margin-top:1.3rem;padding:.8rem 1.6rem;border:0;border-radius:12px;
                     background:#d48b2e;color:#fff;font-size:1rem;font-weight:600}
            </style></head><body><div class="box">
              <h1>Keine Verbindung</h1>
              <p>Ginoco konnte nicht geladen werden.<br>Bitte prüfe deine Internetverbindung.</p>
              <p style="font-size:.75rem;opacity:.45">\(msg)</p>
              <button onclick="window.webkit.messageHandlers.retry.postMessage(1)">Erneut versuchen</button>
            </div></body></html>
            """
            // Handler für den Knopf registrieren (idempotent).
            let ucc = webView.configuration.userContentController
            ucc.removeScriptMessageHandler(forName: "retry")
            ucc.add(self, name: "retry")
            webView.loadHTMLString(html, baseURL: nil)
        }

        // „Erneut versuchen" gedrückt.
        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            if message.name == "retry" {
                web?.load(URLRequest(url: startURL))
            }
        }

        // target="_blank"-Links im selben Fenster öffnen statt zu blockieren.
        func webView(_ webView: WKWebView,
                     createWebViewWith configuration: WKWebViewConfiguration,
                     for navigationAction: WKNavigationAction,
                     windowFeatures: WKWindowFeatures) -> WKWebView? {
            if let u = navigationAction.request.url {
                webView.load(URLRequest(url: u))
            }
            return nil
        }

        // Telefon/Mail/SMS und fremde Domains an das Betriebssystem geben.
        func webView(_ webView: WKWebView,
                     decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let u = navigationAction.request.url else {
                decisionHandler(.allow); return
            }
            let scheme = (u.scheme ?? "").lowercased()
            if scheme == "tel" || scheme == "mailto" || scheme == "sms" {
                UIApplication.shared.open(u)
                decisionHandler(.cancel); return
            }
            if scheme == "http" || scheme == "https" {
                let host = (u.host ?? "").lowercased()
                if host.isEmpty || host == "ginoco.de" || host.hasSuffix(".ginoco.de") {
                    decisionHandler(.allow); return
                }
                UIApplication.shared.open(u)
                decisionHandler(.cancel); return
            }
            // about:blank u. Ä. zulassen (z. B. unsere Fehlerseite).
            decisionHandler(.allow)
        }
    }
}
