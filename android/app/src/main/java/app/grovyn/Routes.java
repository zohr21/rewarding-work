package app.grovyn;

import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;

/** Opening the app at a page from outside it: a notification or a widget. */
final class Routes {
    static final String EXTRA = "route";

    private Routes() {}

    /** Opens the app; MainActivity keeps `route` for the page to pick up (src/scripts/device-sync.ts). */
    static PendingIntent open(Context context, String route) {
        Intent intent = new Intent(context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(EXTRA, route);
        // One PendingIntent per route: the request code keeps their extras apart.
        return PendingIntent.getActivity(context, route.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
