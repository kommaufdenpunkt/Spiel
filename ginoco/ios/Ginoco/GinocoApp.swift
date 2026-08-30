import SwiftUI

// Einstiegspunkt der Ginoco-App.
// Die App zeigt die Fahrschul-Buchung von https://ginoco.de in einem
// nativen WKWebView-Fenster (kein Browser-Rahmen). Die Anmeldung bleibt
// bestehen, weil der persistente Cookie-Speicher genutzt wird.
@main
struct GinocoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .ignoresSafeArea(edges: .bottom)
                .statusBar(hidden: false)
                .preferredColorScheme(nil) // folgt dem Systemthema (hell/dunkel)
        }
    }
}
