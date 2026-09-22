import UIKit
import Capacitor

// Ciclo de vida por CENA (UIScene) — obrigatório a partir do SDK do iOS 26.
// Sem esta adoção o app é morto no lançamento (SIGTRAP em
// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption), que foi o que
// derrubou a build 3.2.0 no iPhone. Arquivo conforme o guia oficial do
// Capacitor 8.5 (https://capacitorjs.com/docs/updating/8-5).
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
