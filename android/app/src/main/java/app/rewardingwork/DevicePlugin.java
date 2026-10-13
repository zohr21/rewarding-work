package app.rewardingwork;

import android.Manifest;
import android.content.Intent;
import android.health.connect.HealthConnectManager;
import android.os.Build;

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

import java.util.ArrayList;
import java.util.List;

/**
 * What the pages ask of the phone (src/lib/device.ts): the timer's notifications,
 * the home-screen widgets' data, where a notification or widget wanted to go,
 * Google's account picker for signing in, and reading from Health Connect.
 * The pages own all the data; nothing here changes it.
 */
@CapacitorPlugin(
    name = "RewardDevice",
    permissions = {
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications"),
        // Health Connect, one per kind of data so each can be allowed on its own (HealthData.java).
        @Permission(strings = { "android.permission.health.READ_SLEEP" }, alias = HealthData.SLEEP),
        @Permission(strings = { "android.permission.health.READ_STEPS" }, alias = HealthData.STEPS),
        @Permission(strings = { "android.permission.health.READ_EXERCISE" }, alias = HealthData.EXERCISE),
        @Permission(strings = { "android.permission.health.READ_RESTING_HEART_RATE" }, alias = HealthData.HEART)
    }
)
public class DevicePlugin extends Plugin {
    /** True while the app is on screen: the page then announces a finished session itself. */
    static volatile boolean foreground = false;

    @Override
    public void load() {
        foreground = true;
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
    private static final String[] HEALTH_KINDS = { HealthData.SLEEP, HealthData.STEPS, HealthData.EXERCISE, HealthData.HEART };
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
        JSObject result = new JSObject();
        if (!HEALTH) {
            result.put("days", new JSArray());
            call.resolve(result);
            return;
        }
        List<String> allowed = new ArrayList<>();
        for (String kind : HEALTH_KINDS) {
            if (getPermissionState(kind) == PermissionState.GRANTED) allowed.add(kind);
        }
        int days = Math.max(1, Math.min(HEALTH_DAYS_MAX, call.getInt("days", 30)));
        HealthData.read(getContext(), days, allowed, list -> {
            result.put("days", list);
            call.resolve(result);
        });
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
}
