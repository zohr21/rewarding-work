package app.rewardingwork;

import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;

/**
 * Reads notifications once you allow it in Android's Notification access screen, and hands
 * each one to BankInbox, which keeps only those from the banks you picked on the Budget page.
 * Android runs it whenever access is on, so alerts that come while the app is closed wait in
 * the inbox until a page takes them.
 */
public class BankListener extends NotificationListenerService {
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
    public void onNotificationPosted(StatusBarNotification sbn) {
        BankInbox.take(this, sbn);
    }
}
