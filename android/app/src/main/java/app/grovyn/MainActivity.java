package app.grovyn;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Where a notification or widget asked to go ("timer?task=…", "progress"); the page picks it up. */
    private static String pendingRoute;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DevicePlugin.class);
        super.onCreate(savedInstanceState);
        keepRoute(getIntent());
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
