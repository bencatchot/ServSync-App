import Capacitor
import PDFKit
import UIKit

class ServSyncBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(InvoicePDFPreviewPlugin())
    }
}

@objc(InvoicePDFPreviewPlugin)
final class InvoicePDFPreviewPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "InvoicePDFPreviewPlugin"
    let jsName = "ServSyncPdfPreview"
    let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise)]

    @objc func open(_ call: CAPPluginCall) {
        guard let encoded = call.getString("data"), let data = Data(base64Encoded: encoded),
              let document = PDFDocument(data: data), !document.isLocked, document.pageCount > 0 else {
            call.reject("This PDF could not be opened. Return to the document and try again.")
            return
        }
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController,
                  let scene = presenter.viewIfLoaded?.window?.windowScene,
                  scene.activationState == .foregroundActive,
                  presenter.presentedViewController == nil else {
                call.reject("Return to the document before opening a PDF preview.")
                return
            }
            let reader = InvoicePDFReader()
            reader.title = call.getString("fileName") ?? "PDF preview"
            reader.pdfView.document = document
            let navigation = UINavigationController(rootViewController: reader)
            navigation.modalPresentationStyle = .fullScreen
            presenter.present(navigation, animated: true) { call.resolve() }
        }
    }
}

private final class InvoicePDFReader: UIViewController {
    let pdfView = PDFView()

    override func loadView() {
        view = pdfView
        pdfView.displayMode = .singlePageContinuous
        pdfView.displayDirection = .vertical
        pdfView.autoScales = true
        navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done, target: self, action: #selector(closePreview))
    }

    @objc private func closePreview() {
        dismiss(animated: true) { self.pdfView.document = nil }
    }
}
