package app.rewardingwork;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The timer outside the app. While a phase runs there is one quiet, ongoing notification
 * that counts down by itself. A page can't run in the background, so each coming phase
 * end is also set as an alarm: it posts "Focus session done" (or "Break over") on time
 * and moves the ongoing notification on to the next phase.
 */
final class TimerNotices {
    private static final String CHANNEL_TIMER = "timer";
    private static final String CHANNEL_ALERTS = "alerts";
    private static final int ID_ONGOING = 1;
    private static final int ID_ALERT = 2;
    /** A focus session, its break, and room to spare. */
    private static final int MAX_ALERTS = 4;
    private static final int ACCENT = 0xFF2E7A50;
    static final String EXTRA_ALERT = "alert";

    private TimerNotices() {}

    /** Replace everything: `ongoingJson` null clears the notification, and old alarms always go. */
    static void apply(Context context, String ongoingJson, String alertsJson) {
        cancelAlarms(context);
        try {
            if (ongoingJson == null) {
                NotificationManagerCompat.from(context).cancel(ID_ONGOING);
            } else {
                postOngoing(context, new JSONObject(ongoingJson));
            }
            JSONArray alerts = new JSONArray(alertsJson);
            for (int i = 0; i < Math.min(alerts.length(), MAX_ALERTS); i++) schedule(context, i, alerts.getJSONObject(i));
        } catch (JSONException e) {
            // Nothing to show for data we can't read.
        }
    }

    /** An alarm went off: say so (unless the app is on screen and says it itself), then move on. */
    static void onAlert(Context context, String alertJson) {
        try {
            JSONObject alert = new JSONObject(alertJson);
            if (!DevicePlugin.foreground) {
                post(
                    context,
                    ID_ALERT,
                    new NotificationCompat.Builder(context, CHANNEL_ALERTS)
                        .setSmallIcon(R.drawable.ic_stat_coin)
                        .setColor(ACCENT)
                        .setContentTitle(alert.optString("title"))
                        .setContentText(alert.optString("text"))
                        .setCategory(NotificationCompat.CATEGORY_ALARM)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setAutoCancel(true)
                        .setContentIntent(Routes.open(context, "timer"))
                );
            }
            JSONObject then = alert.optJSONObject("then");
            if (then == null) NotificationManagerCompat.from(context).cancel(ID_ONGOING);
            else postOngoing(context, then);
        } catch (JSONException e) {
            NotificationManagerCompat.from(context).cancel(ID_ONGOING);
        }
    }

    /** `endAt` counts down to that moment, `since` counts up from it; with neither it is a still line (paused). */
    private static void postOngoing(Context context, JSONObject ongoing) {
        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_TIMER)
            .setSmallIcon(R.drawable.ic_stat_coin)
            .setColor(ACCENT)
            .setContentTitle(ongoing.optString("title"))
            .setContentText(ongoing.optString("text"))
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setContentIntent(Routes.open(context, "timer"));
        long endAt = ongoing.optLong("endAt", 0);
        long since = ongoing.optLong("since", 0);
        if (endAt > 0) {
            builder.setWhen(endAt).setShowWhen(true).setUsesChronometer(true).setChronometerCountDown(true);
        } else if (since > 0) {
            builder.setWhen(since).setShowWhen(true).setUsesChronometer(true);
        }
        post(context, ID_ONGOING, builder);
    }

    private static void post(Context context, int id, NotificationCompat.Builder builder) {
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        channels(context);
        NotificationManagerCompat.from(context).notify(id, builder.build());
    }

    private static void channels(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        NotificationChannel timer = new NotificationChannel(CHANNEL_TIMER, context.getString(R.string.channel_timer), NotificationManager.IMPORTANCE_LOW);
        timer.setDescription(context.getString(R.string.channel_timer_about));
        timer.setShowBadge(false);
        NotificationChannel alerts = new NotificationChannel(CHANNEL_ALERTS, context.getString(R.string.channel_alerts), NotificationManager.IMPORTANCE_HIGH);
        alerts.setDescription(context.getString(R.string.channel_alerts_about));
        manager.createNotificationChannel(timer);
        manager.createNotificationChannel(alerts);
    }

    private static Intent alarmIntent(Context context, int index) {
        return new Intent(context, TimerAlarmReceiver.class).setAction("app.rewardingwork.TIMER_ALERT_" + index);
    }

    private static void schedule(Context context, int index, JSONObject alert) {
        long at = alert.optLong("at", 0);
        if (at <= 0) return;
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent intent = PendingIntent.getBroadcast(
            context,
            index,
            alarmIntent(context, index).putExtra(EXTRA_ALERT, alert.toString()),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        // On time where the phone allows it; otherwise as close as it will let us.
        if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        } else {
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        }
    }

    private static void cancelAlarms(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        for (int i = 0; i < MAX_ALERTS; i++) {
            PendingIntent intent = PendingIntent.getBroadcast(context, i, alarmIntent(context, i), PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
            if (intent == null) continue;
            alarms.cancel(intent);
            intent.cancel();
        }
    }
}
