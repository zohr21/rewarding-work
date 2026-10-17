package app.grovyn;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Parcelable;
import android.service.notification.StatusBarNotification;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Iterator;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Bank alerts from notifications (BankListener), waiting for a page to read them (src/lib/bank.ts).
 *
 * Only notifications from the sources the page set are kept: the bank apps you picked, and
 * SMS from the bank senders you picked (the SMS app's notification is titled with the sender).
 * Everything else is never stored. One-time codes are dropped even from a bank, and so is
 * anything without a number in it. The page reads the alerts, works out the expense, and
 * removes them here; until then they stay, so nothing is lost while the app is closed.
 */
final class BankInbox {
    private static final String PREFS = "bank";
    private static final String SOURCES = "sources";
    private static final String QUEUE = "queue";
    private static final String SEEN = "seen";
    /** The oldest go first past this, so a page that never opens can't fill the phone. */
    private static final int QUEUE_MAX = 100;
    private static final int TEXT_MAX = 600;
    /** The same text again within this time is the same alert shown again, not a second payment. */
    private static final long SAME_MS = 10 * 60_000L;

    /** "OTP kod: 638769", "Code: 6257", "121859 is your security code", "şifrəniz 301322", "Bu kodu … 3DS: 1063". */
    private static final Pattern CODE = Pattern.compile(
        "(otp|code|kod|şifr|sifr|parol|пароль|код)\\D{0,25}\\d{4,8}|\\b\\d{4,8}\\b\\D{0,25}(code|kod|код)|\\b3ds\\b|bu kodu",
        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE
    );
    private static final Pattern DIGIT = Pattern.compile("\\d");
    /** A full card or account number (12 digits or more, maybe in groups): only its last 4 are kept. */
    private static final Pattern LONG_NUMBER = Pattern.compile("(?:\\d[ -]?){8,}(\\d{4})\\b");

    private BankInbox() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** `{ apps: [package…], sms: [package…], senders: [name…] }`; empty lists turn reading off. */
    static synchronized void setSources(Context context, JSONObject sources) {
        SharedPreferences.Editor edit = prefs(context).edit().putString(SOURCES, sources.toString());
        if (isEmpty(sources)) edit.remove(QUEUE).remove(SEEN);
        edit.apply();
    }

    private static boolean isEmpty(JSONObject sources) {
        JSONArray apps = sources.optJSONArray("apps");
        JSONArray senders = sources.optJSONArray("senders");
        return (apps == null || apps.length() == 0) && (senders == null || senders.length() == 0);
    }

    private static JSONObject sources(Context context) {
        try {
            return new JSONObject(prefs(context).getString(SOURCES, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
    }

    static synchronized JSONArray pending(Context context) {
        try {
            return new JSONArray(prefs(context).getString(QUEUE, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    /** The page has dealt with these. */
    static synchronized void ack(Context context, JSONArray ids) {
        JSONArray queue = pending(context);
        JSONArray keep = new JSONArray();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item != null && !contains(ids, item.optString("id"))) keep.put(item);
        }
        prefs(context).edit().putString(QUEUE, keep.toString()).apply();
    }

    static synchronized void take(Context context, StatusBarNotification sbn) {
        String pkg = sbn.getPackageName();
        Notification n = sbn.getNotification();
        if (pkg.equals(context.getPackageName()) || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;

        JSONObject sources = sources(context);
        Bundle extras = n.extras;
        String title = mask(str(extras.getCharSequence(Notification.EXTRA_TITLE)));
        boolean fromApp = contains(sources.optJSONArray("apps"), pkg);
        boolean fromSms = contains(sources.optJSONArray("sms"), pkg) && containsName(sources.optJSONArray("senders"), title);
        if (!fromApp && !fromSms) return;

        String text = mask(text(extras));
        // Bank apps put part of the alert in the title (ABB: "Köçürmə: -1.00₼"), so a code there counts too.
        if (!worthKeeping(text) || (fromApp && CODE.matcher(title).find())) return;
        if (text.length() > TEXT_MAX) text = text.substring(0, TEXT_MAX);

        String hash = hash(pkg + "\n" + title + "\n" + text);
        long now = System.currentTimeMillis();
        JSONObject seen = seen(context, now);
        if (now - seen.optLong(hash, 0) < SAME_MS) return;
        try {
            seen.put(hash, now);
        } catch (JSONException e) {
            /* Not remembered: at worst the same alert is read twice, and the page drops the copy. */
        }

        JSONObject item = new JSONObject();
        try {
            item.put("id", hash + "-" + Long.toString(sbn.getPostTime(), 36));
            item.put("pkg", pkg);
            item.put("app", label(context, pkg));
            item.put("sms", fromSms);
            item.put("title", title);
            item.put("text", text);
            item.put("at", sbn.getPostTime());
        } catch (JSONException e) {
            return;
        }
        JSONArray queue = pending(context);
        queue.put(item);
        while (queue.length() > QUEUE_MAX) queue.remove(0);
        prefs(context).edit().putString(QUEUE, queue.toString()).putString(SEEN, seen.toString()).apply();
        DevicePlugin.bankNotice(item);
    }

    /** "CARD 4111111111111111" → "CARD •••• 1111", so full card and account numbers are never stored. */
    static String mask(String text) {
        return LONG_NUMBER.matcher(text).replaceAll("•••• $1");
    }

    /** Has a number in it and is not a one-time code. Used for past SMS too (DevicePlugin.bankSmsHistory). */
    static boolean worthKeeping(String text) {
        return !text.isEmpty() && DIGIT.matcher(text).find() && !CODE.matcher(text).find();
    }

    /** The newest message of a conversation (SMS apps), else the expanded text, else the line shown. */
    @SuppressWarnings("deprecation")
    private static String text(Bundle extras) {
        Parcelable[] messages = extras.getParcelableArray(Notification.EXTRA_MESSAGES);
        if (messages != null && messages.length > 0 && messages[messages.length - 1] instanceof Bundle) {
            String last = str(((Bundle) messages[messages.length - 1]).getCharSequence("text"));
            if (!last.isEmpty()) return last;
        }
        String big = str(extras.getCharSequence(Notification.EXTRA_BIG_TEXT));
        return big.isEmpty() ? str(extras.getCharSequence(Notification.EXTRA_TEXT)) : big;
    }

    /** Hashes of recent alerts, with those older than a day dropped. */
    private static JSONObject seen(Context context, long now) {
        JSONObject seen;
        try {
            seen = new JSONObject(prefs(context).getString(SEEN, "{}"));
        } catch (JSONException e) {
            return new JSONObject();
        }
        for (Iterator<String> keys = seen.keys(); keys.hasNext(); ) {
            if (now - seen.optLong(keys.next(), 0) > 86_400_000L) keys.remove();
        }
        return seen;
    }

    private static String label(Context context, String pkg) {
        try {
            PackageManager pm = context.getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return str(pm.getApplicationLabel(info));
        } catch (PackageManager.NameNotFoundException e) {
            return pkg;
        }
    }

    private static String str(CharSequence s) {
        return s == null ? "" : s.toString().trim();
    }

    private static boolean contains(JSONArray list, String value) {
        if (list == null) return false;
        for (int i = 0; i < list.length(); i++) if (value.equals(list.optString(i))) return true;
        return false;
    }

    /** Sender names as SMS apps show them: case and spaces vary ("Birbank", "Birbank    "). */
    static boolean containsName(JSONArray list, String title) {
        if (list == null) return false;
        String name = norm(title);
        for (int i = 0; i < list.length(); i++) if (!name.isEmpty() && name.equals(norm(list.optString(i)))) return true;
        return false;
    }

    private static String norm(String s) {
        return s.replaceAll("[\\s\\-_.]", "").toLowerCase(Locale.ROOT);
    }

    private static String hash(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            for (int i = 0; i < 8; i++) out.append(String.format(Locale.ROOT, "%02x", d[i]));
            return out.toString();
        } catch (NoSuchAlgorithmException e) {
            return Integer.toHexString(s.hashCode());
        }
    }
}
