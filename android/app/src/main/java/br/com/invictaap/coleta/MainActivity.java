package br.com.invictaap.coleta;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Barras do sistema × conteúdo do app (Android 15+).
 *
 * Do Android 15 (API 35) em diante o sistema FORÇA o modo edge-to-edge: a
 * WebView ocupa a tela inteira e o cabeçalho do app fica POR BAIXO do relógio/
 * sinal/bateria. O que NÃO resolveu (testado no emulador Android 17):
 *   1. `overlaysWebView: false` do plugin StatusBar — ignorado com targetSdk>=35;
 *   2. `windowOptOutEdgeToEdgeEnforcement` no tema — saída temporária, já sem
 *      efeito nas versões novas;
 *   3. padding na WebView — a tela do app é `position: fixed`, que se ancora no
 *      VIEWPORT e por isso ignora o padding do container.
 *
 * O que funciona: publicar os insets REAIS como variáveis CSS no documento
 * (--inset-top/right/bottom/left). O app usa `var(--inset-top, env(safe-area-
 * inset-top))`, então no navegador/iOS continua valendo o env() padrão e aqui
 * passa a valer o valor nativo — sem número fixo, servindo a qualquer aparelho
 * (inclusive com recorte de câmera e barra de gestos).
 */
public class MainActivity extends BridgeActivity {

    private static final int COR_FUNDO = Color.parseColor("#061525");

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        final WebView webView = getBridge().getWebView();
        if (webView == null) return;

        webView.setBackgroundColor(COR_FUNDO);
        getWindow().getDecorView().setBackgroundColor(COR_FUNDO);

        ViewCompat.setOnApplyWindowInsetsListener(webView, (v, windowInsets) -> {
            Insets b = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                            | WindowInsetsCompat.Type.displayCutout());

            // Os insets vêm em pixels FÍSICOS; o CSS trabalha em px lógicos.
            final float d = v.getResources().getDisplayMetrics().density;
            final int top = Math.round(b.top / d);
            final int right = Math.round(b.right / d);
            final int bottom = Math.round(b.bottom / d);
            final int left = Math.round(b.left / d);

            final String js =
                    "(function(){var s=document.documentElement.style;"
                            + "s.setProperty('--inset-top','" + top + "px');"
                            + "s.setProperty('--inset-right','" + right + "px');"
                            + "s.setProperty('--inset-bottom','" + bottom + "px');"
                            + "s.setProperty('--inset-left','" + left + "px');})()";
            v.post(() -> webView.evaluateJavascript(js, null));

            return windowInsets;   // não consome: outros componentes ainda veem
        });
    }
}
