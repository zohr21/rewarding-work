package app.rewardingwork;

import android.Manifest;
import android.os.Build;

import androidx.core.app.NotificationManagerCompat;

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
 * the home-screen widgets' data, and where a notification or widget wanted to go.
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

    @PluginMethod
    public void takeRoute(PluginCall call) {
        JSObject result = new JSObject();
        result.put("route", MainActivity.takeRoute());
        call.resolve(result);
    }
}
