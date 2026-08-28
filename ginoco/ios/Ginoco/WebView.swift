import SwiftUI
import WebKit

// Native Hülle um ginoco.de. Verhält sich wie eine echte App:
//  - kein Browser-Rahmen (keine Adressleiste, keine Tabs)
//  - Anmeldung bleibt bestehen (persistenter Cookie-Speicher)
//  - Wischen von links = zurück
//  - Nach unten ziehen = neu laden
//  - tel:/mailto:/sms: und fremde Domains öffnen im System (Telefon, Mail, Safari)
struct WebView: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.websiteDataStore = .default() // persistent -> Sitzung bleibt erhalten

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        web.allowsBackForwardNavigationGestures = true
        web.scrollView.contentInsetAdjustmentBehavior = .always
        web.isOpaque = true

        // Eigene Kennung, damit der Server die App erkennen kann.
        let base = (web.value(forKey: "userAgent") as? String) ?? ""
        web.customUserAgent = base + " GinocoApp/1.0"

        // Nach unten ziehen zum Aktualisieren.
        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.handleRefresh(_:)), for: .valueChanged)
        web.scrollView.refreshControl = refresh

        context.coordinator.web = web
        web.load(URLRequest(url: url))
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        weak var web: WKWebView?

        @objc func handleRefresh(_ sender: UIRefreshControl) {
            web?.reload()
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
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
            // Innerhalb von ginoco.de bleibt alles in der App; alles andere -> Safari.
            if scheme == "http" || scheme == "https" {
                let host = (u.host ?? "").lowercased()
                if host.isEmpty || host == "ginoco.de" || host.hasSuffix(".ginoco.de") {
                    decisionHandler(.allow); return
                }
                UIApplication.shared.open(u)
                decisionHandler(.cancel); return
            }
            decisionHandler(.allow)
        }
    }
}
