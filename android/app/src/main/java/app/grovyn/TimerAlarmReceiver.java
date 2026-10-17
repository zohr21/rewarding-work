package app.grovyn;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** A timer phase ended while the page couldn't say so itself (TimerNotices.java). */
public class TimerAlarmReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        String alert = intent.getStringExtra(TimerNotices.EXTRA_ALERT);
        if (alert != null) TimerNotices.onAlert(context, alert);
    }
}
