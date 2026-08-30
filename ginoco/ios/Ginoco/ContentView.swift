import SwiftUI

// Vollflächige Ansicht mit der Ginoco-Webansicht.
struct ContentView: View {
    // Die Live-Adresse der Fahrschul-Buchung.
    private let startURL = URL(string: "https://ginoco.de")!

    var body: some View {
        WebView(url: startURL)
            .ignoresSafeArea(.container, edges: .bottom)
            .background(Color(.systemBackground))
    }
}

#Preview {
    ContentView()
}
