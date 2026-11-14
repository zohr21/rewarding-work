package app.grovyn;

import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.content.ContextCompat;
import androidx.core.splashscreen.SplashScreen;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    /** Where a notification or widget asked to go ("timer?task=…", "progress"); the page picks it up. */
    private static String pendingRoute;

    /** The longest the splash waits for the page, so a page that never loads cannot hide the app. */
    private static final long SPLASH_MAX_MS = 4000;

    /** The first page has something drawn (or failed to load): the splash can go. */
    private volatile boolean pageShown;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // The splash stays until the page has drawn, so a cold start never shows an empty web view.
        SplashScreen splash = SplashScreen.installSplashScreen(this);
        splash.setKeepOnScreenCondition(() -> !pageShown);
        new Handler(Looper.getMainLooper()).postDelayed(() -> pageShown = true, SPLASH_MAX_MS);

        registerPlugin(DevicePlugin.class);
        super.onCreate(savedInstanceState);
        // Dark behind the page too, for the moments a page is between loads.
        getBridge().getWebView().setBackgroundColor(ContextCompat.getColor(this, R.color.ic_launcher_background));
        getBridge().addWebViewListener(new WebViewListener() {
            @Override
            public void onPageCommitVisible(WebView view, String url) {
                pageShown = true;
            }

            @Override
            public void onReceivedError(WebView view) {
                pageShown = true;
            }
        });
        keepRoute(getIntent());
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                goBack();
            }
        });
    }

    /**
     * Back first closes a sheet or dialog open over the page (the page's own grovynBack,
     * src/scripts/device-sync.ts), then goes back a page, and from the first page puts the app
     * in the background, so a running timer's page stays alive.
     */
    private void goBack() {
        WebView web = getBridge() == null ? null : getBridge().getWebView();
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript("typeof window.grovynBack === 'function' ? window.grovynBack() : false", handled -> {
            if ("true".equals(handled)) return;
            if (web.canGoBack()) web.goBack();
            else moveTaskToBack(true);
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keepRoute(intent);
    }

    /** Android's link to why the app wants health data, which must lead to the privacy page. */
    private static final String HEALTH_RATIONALE = "android.intent.action.VIEW_PERMISSION_USAGE";

    private static void keepRoute(Intent intent) {
        if (intent != null && HEALTH_RATIONALE.equals(intent.getAction())) {
            pendingRoute = "privacy";
            return;
        }
        String route = intent == null ? null : intent.getStringExtra(Routes.EXTRA);
        if (route == null) return;
        pendingRoute = route;
        intent.removeExtra(Routes.EXTRA);
    }

    static String takeRoute() {
        String route = pendingRoute;
        pendingRoute = null;
        return route;
    }
}
