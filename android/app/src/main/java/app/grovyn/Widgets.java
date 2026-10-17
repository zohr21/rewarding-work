package app.grovyn;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.Calendar;
import java.util.HashSet;
import java.util.Locale;
import java.util.Set;

/**
 * The two home-screen widgets, drawn from what the pages last sent (DevicePlugin.setWidgets):
 * the task that is first up, and the chain. The chain's week and count are worked out
 * here from its marked days, so the widget is right after midnight without the app opening.
 */
final class Widgets {
    private static final String PREFS = "widgets";
    private static final String KEY = "data";
    private static final int[] DOTS = { R.id.ch_d0, R.id.ch_d1, R.id.ch_d2, R.id.ch_d3, R.id.ch_d4, R.id.ch_d5, R.id.ch_d6 };

    private Widgets() {}

    static void save(Context context, String json) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, json).apply();
        updateAll(context);
    }

    static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        manager.updateAppWidget(new ComponentName(context, FirstUpWidget.class), firstUp(context));
        manager.updateAppWidget(new ComponentName(context, ChainWidget.class), chain(context));
    }

    private static JSONObject data(Context context) {
        try {
            return new JSONObject(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static RemoteViews firstUp(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_first_up);
        JSONObject task = data(context).optJSONObject("firstUp");
        String route = "timer";
        if (task == null) {
            views.setTextViewText(R.id.fu_title, context.getString(R.string.widget_first_up_empty));
            views.setTextViewText(R.id.fu_meta, context.getString(R.string.widget_first_up_empty_hint));
            views.setTextViewText(R.id.fu_count, "+");
            views.setViewVisibility(R.id.fu_progress, View.GONE);
        } else {
            int total = task.optInt("total");
            int done = task.optInt("done");
            String next = task.optString("next");
            views.setTextViewText(R.id.fu_title, task.optString("title"));
            views.setTextViewText(
                R.id.fu_meta,
                !next.isEmpty()
                    ? context.getString(R.string.widget_next_step, next)
                    : total > 0 ? context.getString(R.string.widget_steps, done, total) : context.getString(R.string.widget_no_steps)
            );
            views.setTextViewText(R.id.fu_count, total > 0 ? done + "/" + total : "+");
            views.setViewVisibility(R.id.fu_progress, total > 0 ? View.VISIBLE : View.GONE);
            views.setProgressBar(R.id.fu_progress, Math.max(1, total), done, false);
            String id = task.optString("id");
            if (!id.isEmpty()) route = "timer?task=" + id;
        }
        views.setOnClickPendingIntent(R.id.fu_root, Routes.open(context, "tasks"));
        views.setOnClickPendingIntent(R.id.fu_play, Routes.open(context, route));
        return views;
    }

    static RemoteViews chain(Context context) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_chain);
        JSONObject chain = data(context).optJSONObject("chain");
        Set<String> marked = new HashSet<>();
        JSONArray days = chain == null ? null : chain.optJSONArray("days");
        for (int i = 0; days != null && i < days.length(); i++) marked.add(days.optString(i));

        Calendar today = Calendar.getInstance();
        String todayKey = key(today);

        // The run that ends today, or yesterday: an unmarked today isn't a broken chain yet.
        Calendar cursor = (Calendar) today.clone();
        if (!marked.contains(todayKey)) cursor.add(Calendar.DAY_OF_MONTH, -1);
        int current = 0;
        while (marked.contains(key(cursor))) {
            current++;
            cursor.add(Calendar.DAY_OF_MONTH, -1);
        }

        String habit = chain == null ? "" : chain.optString("habit");
        views.setTextViewText(R.id.ch_label, habit.isEmpty() ? context.getString(R.string.widget_chain_label) : habit);
        views.setTextViewText(
            R.id.ch_days,
            chain == null ? context.getString(R.string.widget_chain_empty) : context.getResources().getQuantityString(R.plurals.widget_days, current, current)
        );

        // This week, Monday first.
        Calendar day = (Calendar) today.clone();
        day.add(Calendar.DAY_OF_MONTH, -((today.get(Calendar.DAY_OF_WEEK) + 5) % 7));
        for (int dot : DOTS) {
            String k = key(day);
            views.setImageViewResource(dot, marked.contains(k) ? R.drawable.widget_dot_on : k.equals(todayKey) ? R.drawable.widget_dot_today : R.drawable.widget_dot_off);
            day.add(Calendar.DAY_OF_MONTH, 1);
        }
        views.setOnClickPendingIntent(R.id.ch_root, Routes.open(context, "progress"));
        return views;
    }

    /** The same local YYYY-MM-DD keys the pages use (src/lib/dates.ts). */
    private static String key(Calendar day) {
        return String.format(Locale.US, "%04d-%02d-%02d", day.get(Calendar.YEAR), day.get(Calendar.MONTH) + 1, day.get(Calendar.DAY_OF_MONTH));
    }
}
