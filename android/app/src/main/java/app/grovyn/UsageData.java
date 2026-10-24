package app.grovyn;

import android.app.AppOpsManager;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.os.Build;
import android.os.Process;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Phone time from Android's usage events, for screen time (src/lib/screen.ts):
 * minutes per app per day, and which apps were opened during a focus session.
 * Read only. Needs Usage access, which the user switches on in Settings; there is no dialog for it.
 *
 * Android's own daily totals (queryUsageStats) are often off, so the time an app was on
 * screen is worked out here from its resume and pause events. Grovyn itself, the home
 * screen and anything without an icon in the app drawer (the system UI) are left out.
 */
final class UsageData {
    private static final long MINUTE = 60_000;
    /** An app already open when the window starts: look back this far for when it came up. */
    private static final long LOOK_BACK = 3 * 60 * MINUTE;
    /** Two stretches in other apps this close together count as one time you picked the phone up. */
    private static final long SAME_PICKUP = 30_000;

    private UsageData() {}

    static boolean access(Context context) {
        AppOpsManager ops = context.getSystemService(AppOpsManager.class);
        if (ops == null) return false;
        int mode = Build.VERSION.SDK_INT >= 29
            ? ops.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName())
            : ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.getPackageName());
        return mode == AppOpsManager.MODE_ALLOWED;
    }

    /** One time an app was on screen. */
    private static final class Span {
        final String pkg;
        final long start;
        final long end;

        Span(String pkg, long start, long end) {
            this.pkg = pkg;
            this.start = start;
            this.end = end;
        }
    }

    /**
     * One object per day for the last `days` days, oldest first: `day` ("2026-10-24"),
     * `totalMin`, and `apps` ({ pkg, label, min }, most used first). Android keeps the events
     * for about a week, so older days come back empty; the page keeps its own history.
     */
    static JSObject days(Context context, int days) {
        ZoneId zone = ZoneId.systemDefault();
        LocalDate first = LocalDate.now().minusDays(days - 1);
        long from = first.atStartOfDay(zone).toInstant().toEpochMilli();
        long now = System.currentTimeMillis();

        List<Map<String, Long>> byDay = new ArrayList<>();
        long[] bounds = new long[days + 1];
        for (int i = 0; i <= days; i++) bounds[i] = first.plusDays(i).atStartOfDay(zone).toInstant().toEpochMilli();
        for (int i = 0; i < days; i++) byDay.add(new HashMap<>());

        for (Span span : spans(context, from, now)) {
            // A stretch that runs past midnight is split between the two days.
            for (int i = 0; i < days; i++) {
                long start = Math.max(span.start, bounds[i]);
                long end = Math.min(span.end, bounds[i + 1]);
                if (end <= start) continue;
                Map<String, Long> day = byDay.get(i);
                Long had = day.get(span.pkg);
                day.put(span.pkg, (had == null ? 0 : had) + (end - start));
            }
        }

        PackageManager pm = context.getPackageManager();
        Map<String, String> labels = new HashMap<>();
        JSArray list = new JSArray();
        for (int i = 0; i < days; i++) {
            JSObject entry = new JSObject();
            entry.put("day", first.plusDays(i).toString());
            List<Map.Entry<String, Long>> apps = new ArrayList<>(byDay.get(i).entrySet());
            apps.sort((a, b) -> Long.compare(b.getValue(), a.getValue()));
            long total = 0;
            JSArray appList = new JSArray();
            for (Map.Entry<String, Long> app : apps) {
                total += app.getValue();
                long min = app.getValue() / MINUTE;
                if (min < 1) continue;
                JSObject a = new JSObject();
                a.put("pkg", app.getKey());
                a.put("label", label(pm, labels, app.getKey()));
                a.put("min", min);
                appList.put(a);
            }
            entry.put("totalMin", total / MINUTE);
            entry.put("apps", appList);
            list.put(entry);
        }
        JSObject result = new JSObject();
        result.put("days", list);
        return result;
    }

    /**
     * Other apps between `start` and `end` (a focus session): `ms` in all, `pickups` (times
     * you went into another app), `apps` ({ pkg, label, ms }, most used first) and `spans`
     * ({ start, end }, epoch ms) for drawing them on the session's timeline.
     */
    static JSObject between(Context context, long start, long end) {
        List<Span> spans = spans(context, start, Math.min(end, System.currentTimeMillis()));
        Map<String, Long> perApp = new HashMap<>();
        JSArray spanList = new JSArray();
        long total = 0;
        int pickups = 0;
        long lastEnd = Long.MIN_VALUE;
        for (Span span : spans) {
            total += span.end - span.start;
            Long had = perApp.get(span.pkg);
            perApp.put(span.pkg, (had == null ? 0 : had) + (span.end - span.start));
            if (span.start - lastEnd > SAME_PICKUP) pickups++;
            lastEnd = span.end;
            JSObject s = new JSObject();
            s.put("start", span.start);
            s.put("end", span.end);
            spanList.put(s);
        }
        List<Map.Entry<String, Long>> apps = new ArrayList<>(perApp.entrySet());
        apps.sort((a, b) -> Long.compare(b.getValue(), a.getValue()));
        PackageManager pm = context.getPackageManager();
        Map<String, String> labels = new HashMap<>();
        JSArray appList = new JSArray();
        for (Map.Entry<String, Long> app : apps) {
            JSObject a = new JSObject();
            a.put("pkg", app.getKey());
            a.put("label", label(pm, labels, app.getKey()));
            a.put("ms", app.getValue());
            appList.put(a);
        }
        JSObject result = new JSObject();
        result.put("ms", total);
        result.put("pickups", pickups);
        result.put("apps", appList);
        result.put("spans", spanList);
        return result;
    }

    /** Every stretch an app the user opens was on screen between `from` and `to`, in order, clipped to the window. */
    private static List<Span> spans(Context context, long from, long to) {
        List<Span> out = new ArrayList<>();
        UsageStatsManager usm = context.getSystemService(UsageStatsManager.class);
        if (usm == null || to <= from) return out;
        Set<String> skip = skipped(context);
        PackageManager pm = context.getPackageManager();
        Map<String, Boolean> counted = new HashMap<>();

        UsageEvents events = usm.queryEvents(from - LOOK_BACK, to);
        if (events == null) return out;
        UsageEvents.Event e = new UsageEvents.Event();
        String current = null;
        long since = 0;
        while (events.hasNextEvent()) {
            events.getNextEvent(e);
            int type = e.getEventType();
            long t = e.getTimeStamp();
            String pkg = e.getPackageName();
            if (type == UsageEvents.Event.ACTIVITY_RESUMED) {
                if (pkg.equals(current)) continue;
                if (current != null) add(out, current, since, t, from, to);
                current = null;
                if (skip.contains(pkg)) continue;
                Boolean ok = counted.get(pkg);
                if (ok == null) {
                    ok = pm.getLaunchIntentForPackage(pkg) != null;
                    counted.put(pkg, ok);
                }
                if (!ok) continue;
                current = pkg;
                since = t;
            } else if ((type == UsageEvents.Event.ACTIVITY_PAUSED || type == UsageEvents.Event.ACTIVITY_STOPPED) && pkg.equals(current)) {
                add(out, current, since, t, from, to);
                current = null;
            } else if (type == UsageEvents.Event.SCREEN_NON_INTERACTIVE || type == UsageEvents.Event.DEVICE_SHUTDOWN) {
                if (current != null) add(out, current, since, t, from, to);
                current = null;
            }
        }
        // Still on screen at the end of the window.
        if (current != null) add(out, current, since, to, from, to);
        return out;
    }

    private static void add(List<Span> out, String pkg, long start, long end, long from, long to) {
        long s = Math.max(start, from);
        long t = Math.min(end, to);
        if (t > s) out.add(new Span(pkg, s, t));
    }

    /** Grovyn, the home screens and the system UI: being on them isn't time in another app. */
    private static Set<String> skipped(Context context) {
        Set<String> skip = new HashSet<>();
        skip.add(context.getPackageName());
        skip.add("com.android.systemui");
        PackageManager pm = context.getPackageManager();
        Intent home = new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME);
        for (ResolveInfo info : pm.queryIntentActivities(home, 0)) skip.add(info.activityInfo.packageName);
        return skip;
    }

    private static String label(PackageManager pm, Map<String, String> cache, String pkg) {
        String had = cache.get(pkg);
        if (had != null) return had;
        String name;
        try {
            name = pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString();
        } catch (PackageManager.NameNotFoundException e) {
            name = pkg;
        }
        cache.put(pkg, name);
        return name;
    }
}
