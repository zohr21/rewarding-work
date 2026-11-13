package app.grovyn;

import android.content.Intent;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Where a notification or widget asked to go ("timer?task=…", "progress"); the page picks it up. */
    private static String pendingRoute;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DevicePlugin.class);
        super.onCreate(savedInstanceState);
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
