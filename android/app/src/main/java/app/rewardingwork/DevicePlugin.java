package app.rewardingwork;

import android.Manifest;
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

/**
 * What the pages ask of the phone (src/lib/device.ts): the timer's notifications,
 * the home-screen widgets' data, where a notification or widget wanted to go, and
 * Google's account picker for signing in.
 * The pages own all the data; nothing here changes it.
 */
@CapacitorPlugin(
    name = "RewardDevice",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
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

    @PluginMethod
    public void takeRoute(PluginCall call) {
        JSObject result = new JSObject();
        result.put("route", MainActivity.takeRoute());
        call.resolve(result);
    }
}
