package app.rewardingwork;

import android.Manifest;
import android.content.ComponentName;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.health.connect.HealthConnectManager;
import android.os.Build;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import androidx.credentials.Credential;
import androidx.credentials.CredentialManager;
import androidx.credentials.CredentialManagerCallback;
import androidx.credentials.CustomCredential;
import androidx.credentials.GetCredentialRequest;
import androidx.credentials.GetCredentialResponse;
import androidx.credentials.exceptions.GetCredentialCancellationException;
import androidx.credentials.exceptions.GetCredentialException;

import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption;
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.List;

/**
 * What the pages ask of the phone (src/lib/device.ts): the timer's notifications,
 * the home-screen widgets' data, where a notification or widget wanted to go,
 * Google's account picker for signing in, reading from Health Connect, and bank alerts
 * read from notifications (BankInbox.java). The pages own all the data; nothing here changes it.
 */
@CapacitorPlugin(
    name = "RewardDevice",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        // Only for importing past bank SMS once, when you ask for it on the Budget page.
        @Permission(strings = { Manifest.permission.READ_SMS }, alias = "sms"),
        // Health Connect, one per kind of data so each can be allowed on its own (HealthData.java).
        @Permission(strings = { "android.permission.health.READ_SLEEP" }, alias = HealthData.SLEEP),
        @Permission(strings = { "android.permission.health.READ_STEPS" }, alias = HealthData.STEPS),
        @Permission(strings = { "android.permission.health.READ_EXERCISE" }, alias = HealthData.EXERCISE),
        @Permission(strings = { "android.permission.health.READ_RESTING_HEART_RATE" }, alias = HealthData.HEART),
        @Permission(strings = { "android.permission.health.READ_TOTAL_CALORIES_BURNED" }, alias = HealthData.CALORIES),
        @Permission(strings = { "android.permission.health.READ_ACTIVE_CALORIES_BURNED" }, alias = HealthData.ACTIVE_CALORIES),
        @Permission(strings = { "android.permission.health.READ_DISTANCE" }, alias = HealthData.DISTANCE)
    }
)
public class DevicePlugin extends Plugin {
    /** True while the app is on screen: the page then announces a finished session itself. */
    static volatile boolean foreground = false;
    /** The plugin of the open app, for passing on bank alerts as they come; null while it is closed. */
    private static volatile DevicePlugin open;

    @Override
    public void load() {
        foreground = true;
        open = this;
    }

    @Override
    protected void handleOnDestroy() {
        if (open == this) open = null;
    }

    @Override
    protected void handleOnResume() {
        foreground = true;
    }

    @Override
    protected void handleOnPause() {
        foreground = false;
    }

    /** The running timer: an ongoing notification now, and an alert at each coming phase end. */
    @PluginMethod
    public void showTimer(PluginCall call) {
        JSObject ongoing = call.getObject("ongoing");
        JSArray alerts = call.getArray("alerts");
        TimerNotices.apply(getContext(), ongoing == null ? null : ongoing.toString(), alerts == null ? "[]" : alerts.toString());
        call.resolve();
    }

    @PluginMethod
    public void clearTimer(PluginCall call) {
        TimerNotices.apply(getContext(), null, "[]");
        call.resolve();
    }

    @PluginMethod
    public void notificationState(PluginCall call) {
        call.resolve(granted());
    }

    /** Asks once on Android 13 and later; earlier versions allow notifications from the start. */
    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationsResult");
        } else {
            call.resolve(granted());
        }
    }

    @PermissionCallback
    private void notificationsResult(PluginCall call) {
        call.resolve(granted());
    }

    private JSObject granted() {
        JSObject result = new JSObject();
        result.put("granted", NotificationManagerCompat.from(getContext()).areNotificationsEnabled());
        return result;
    }

    /** What the widgets show: the first-up task and the chain (Widgets.java reads it back). */
    @PluginMethod
    public void setWidgets(PluginCall call) {
        Widgets.save(getContext(), call.getData().toString());
        call.resolve();
    }

    /**
     * Google's account picker. Gives back an ID token for the page to sign in to Firebase with;
     * `clientId` is the Firebase project's web client, which the token is made out to.
     */
    @PluginMethod
    public void googleSignIn(PluginCall call) {
        String clientId = call.getString("clientId");
        if (clientId == null || clientId.isEmpty() || getActivity() == null) {
            call.reject("Google sign-in isn't set up.", "google/unavailable");
            return;
        }
        GetCredentialRequest request = new GetCredentialRequest.Builder()
            .addCredentialOption(new GetSignInWithGoogleOption.Builder(clientId).build())
            .build();
        CredentialManager.create(getContext()).getCredentialAsync(
            getActivity(),
            request,
            null,
            ContextCompat.getMainExecutor(getContext()),
            new CredentialManagerCallback<GetCredentialResponse, GetCredentialException>() {
                @Override
                public void onResult(GetCredentialResponse response) {
                    Credential credential = response.getCredential();
                    if (!(credential instanceof CustomCredential)
                        || !GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL.equals(credential.getType())) {
                        call.reject("Google didn't answer with a sign-in.", "google/unavailable");
                        return;
                    }
                    JSObject result = new JSObject();
                    result.put("idToken", GoogleIdTokenCredential.createFrom(credential.getData()).getIdToken());
                    call.resolve(result);
                }

                @Override
                public void onError(GetCredentialException e) {
                    boolean cancelled = e instanceof GetCredentialCancellationException;
                    call.reject(e.getMessage(), cancelled ? "google/cancelled" : "google/unavailable", e);
                }
            }
        );
    }

    /** Health Connect is part of Android from version 14; older phones are told it isn't there. */
    private static final boolean HEALTH = Build.VERSION.SDK_INT >= 34;
    private static final String[] HEALTH_KINDS = { HealthData.SLEEP, HealthData.STEPS, HealthData.EXERCISE, HealthData.HEART, HealthData.CALORIES, HealthData.ACTIVE_CALORIES, HealthData.DISTANCE };
    private static final int HEALTH_DAYS_MAX = 60;

    @PluginMethod
    public void healthState(PluginCall call) {
        call.resolve(healthState());
    }

    /** Asks for the `kinds` not yet allowed. Android stops showing the question after two refusals. */
    @PluginMethod
    public void healthConnect(PluginCall call) {
        List<String> wanted = new ArrayList<>();
        try {
            wanted = call.getArray("kinds", new JSArray()).toList();
        } catch (org.json.JSONException e) {
            /* Nothing asked for. */
        }
        List<String> ask = new ArrayList<>();
        for (String kind : HEALTH_KINDS) {
            if (HEALTH && wanted.contains(kind) && getPermissionState(kind) != PermissionState.GRANTED) ask.add(kind);
        }
        if (ask.isEmpty()) {
            call.resolve(healthState());
        } else {
            requestPermissionForAliases(ask.toArray(new String[0]), call, "healthResult");
        }
    }

    @PermissionCallback
    private void healthResult(PluginCall call) {
        call.resolve(healthState());
    }

    /** Daily totals for the last `days` days, for the kinds that are allowed. */
    @PluginMethod
    public void healthRead(PluginCall call) {
        if (!HEALTH) {
            JSObject result = new JSObject();
            result.put("days", new JSArray());
            result.put("failed", new JSObject());
            call.resolve(result);
            return;
        }
        List<String> allowed = new ArrayList<>();
        for (String kind : HEALTH_KINDS) {
            if (getPermissionState(kind) == PermissionState.GRANTED) allowed.add(kind);
        }
        int days = Math.max(1, Math.min(HEALTH_DAYS_MAX, call.getInt("days", 30)));
        HealthData.read(getContext(), days, allowed, call::resolve);
    }

    /** Health Connect's own screen for what this app may read. */
    @PluginMethod
    public void healthSettings(PluginCall call) {
        if (HEALTH && getActivity() != null) {
            try {
                getActivity().startActivity(
                    new Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS).putExtra(Intent.EXTRA_PACKAGE_NAME, getContext().getPackageName())
                );
            } catch (RuntimeException e) {
                /* No such screen on this phone: nothing to open. */
            }
        }
        call.resolve();
    }

    private JSObject healthState() {
        JSObject result = new JSObject();
        result.put("available", HEALTH);
        for (String kind : HEALTH_KINDS) result.put(kind, HEALTH && getPermissionState(kind) == PermissionState.GRANTED);
        return result;
    }

    @PluginMethod
    public void takeRoute(PluginCall call) {
        JSObject result = new JSObject();
        result.put("route", MainActivity.takeRoute());
        call.resolve(result);
    }

    // ---------- Bank alerts (BankInbox.java, src/lib/bank.ts) ----------

    /** A new alert while the app is open: the page takes it at once (it also stays in the inbox until acknowledged). */
    static void bankNotice(org.json.JSONObject item) {
        DevicePlugin plugin = open;
        if (plugin == null) return;
        try {
            plugin.notifyListeners("bankNotice", JSObject.fromJSONObject(item));
        } catch (JSONException e) {
            /* The page picks it up from the inbox instead. */
        }
    }

    /** Whether notification access is on, and which of the `packages` asked about are installed, with their names. */
    @PluginMethod
    public void bankState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("access", NotificationManagerCompat.getEnabledListenerPackages(getContext()).contains(getContext().getPackageName()));
        JSArray installed = new JSArray();
        PackageManager pm = getContext().getPackageManager();
        try {
            for (String pkg : call.getArray("packages", new JSArray()).<String>toList()) {
                try {
                    JSObject app = new JSObject();
                    app.put("pkg", pkg);
                    app.put("label", pm.getApplicationLabel(pm.getApplicationInfo(pkg, 0)).toString());
                    installed.put(app);
                } catch (PackageManager.NameNotFoundException e) {
                    /* Not on this phone. */
                }
            }
        } catch (JSONException e) {
            /* Nothing asked about. */
        }
        result.put("installed", installed);
        call.resolve(result);
    }

    /** Android's Notification access screen, open at this app where the phone allows it. */
    @PluginMethod
    public void bankSettings(PluginCall call) {
        if (getActivity() != null) {
            Intent intent;
            if (Build.VERSION.SDK_INT >= 30) {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS).putExtra(
                    Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    new ComponentName(getContext(), BankListener.class).flattenToString()
                );
            } else {
                intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
            }
            try {
                getActivity().startActivity(intent);
            } catch (RuntimeException e) {
                try {
                    getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
                } catch (RuntimeException ignored) {
                    /* No such screen on this phone. */
                }
            }
        }
        call.resolve();
    }

    /** Which apps and SMS senders to keep alerts from; all empty stops keeping any and clears the inbox. */
    @PluginMethod
    public void bankSources(PluginCall call) {
        org.json.JSONObject sources = new org.json.JSONObject();
        try {
            sources.put("apps", call.getArray("apps", new JSArray()));
            sources.put("sms", call.getArray("sms", new JSArray()));
            sources.put("senders", call.getArray("senders", new JSArray()));
        } catch (JSONException e) {
            call.reject("Bad sources.");
            return;
        }
        BankInbox.setSources(getContext(), sources);
        call.resolve();
    }

    /**
     * Past SMS from the bank `senders`, from `since` (epoch ms) on, oldest first, one-time codes
     * left out. Asks for SMS access the first time; rejects with `sms/denied` if you say no.
     */
    @PluginMethod
    public void bankSmsHistory(PluginCall call) {
        if (getPermissionState("sms") != PermissionState.GRANTED) {
            requestPermissionForAlias("sms", call, "smsResult");
        } else {
            readSms(call);
        }
    }

    @PermissionCallback
    private void smsResult(PluginCall call) {
        if (getPermissionState("sms") == PermissionState.GRANTED) readSms(call);
        else call.reject("SMS access was not allowed.", "sms/denied");
    }

    private void readSms(PluginCall call) {
        JSArray senders = call.getArray("senders", new JSArray());
        long since = call.getLong("since", 0L);
        new Thread(() -> {
            JSArray items = new JSArray();
            String[] columns = { "_id", "address", "body", "date" };
            try (Cursor c = getContext().getContentResolver().query(
                Uri.parse("content://sms/inbox"), columns, "date >= ?", new String[] { String.valueOf(since) }, "date ASC"
            )) {
                while (c != null && c.moveToNext()) {
                    String address = c.getString(1) == null ? "" : c.getString(1).trim();
                    String body = c.getString(2) == null ? "" : BankInbox.mask(c.getString(2).trim());
                    if (!BankInbox.containsName(senders, address) || !BankInbox.worthKeeping(body)) continue;
                    JSObject item = new JSObject();
                    item.put("id", "sms-" + c.getLong(0));
                    item.put("pkg", "sms");
                    item.put("app", "SMS");
                    item.put("sms", true);
                    item.put("title", address);
                    item.put("text", body);
                    item.put("at", c.getLong(3));
                    items.put(item);
                }
            } catch (RuntimeException e) {
                call.reject("Could not read SMS.", "sms/failed", e);
                return;
            }
            JSObject result = new JSObject();
            result.put("items", items);
            call.resolve(result);
        }).start();
    }

    @PluginMethod
    public void bankPending(PluginCall call) {
        JSObject result = new JSObject();
        result.put("items", BankInbox.pending(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void bankAck(PluginCall call) {
        BankInbox.ack(getContext(), call.getArray("ids", new JSArray()));
        call.resolve();
    }
}
