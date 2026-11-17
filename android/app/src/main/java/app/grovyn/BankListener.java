package app.grovyn;

import android.content.ComponentName;
import android.content.Context;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationManagerCompat;

/**
 * Reads notifications once you allow it in Android's Notification access screen, and hands
 * each one to BankInbox, which keeps only those from the banks you picked on the Budget page.
 * Android runs it whenever access is on, so alerts that come while the app is closed wait in
 * the inbox until a page takes them.
 *
 * Android can drop the connection while access stays on (after an update, when the app is
 * killed, or when Samsung puts it to sleep) and does not bring it back by itself, so alerts
 * stop with nothing to show for it. The listener asks to be bound again when it is dropped,
 * and the app asks again each time it comes to the front (DevicePlugin.handleOnResume).
 */
public class BankListener extends NotificationListenerService {
    /** Ask Android to connect the listener again; nothing happens while access is off or it is already connected. */
    static void rebind(Context context) {
        if (!NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.getPackageName())) return;
        try {
            requestRebind(new ComponentName(context, BankListener.class));
        } catch (RuntimeException e) {
            /* Access was turned off in between. */
        }
    }

    @Override
    public void onListenerConnected() {
        // Alerts still showing that came while the listener was not connected (after an update or a reboot).
        try {
            StatusBarNotification[] showing = getActiveNotifications();
            if (showing != null) for (StatusBarNotification sbn : showing) BankInbox.take(this, sbn);
        } catch (RuntimeException e) {
            /* Not connected after all: nothing to catch up on. */
        }
    }

    @Override
    public void onListenerDisconnected() {
        rebind(this);
    }

    @Override
    public void onNotificationPosted(StatusBarNotification sbn) {
        BankInbox.take(this, sbn);
    }
}
