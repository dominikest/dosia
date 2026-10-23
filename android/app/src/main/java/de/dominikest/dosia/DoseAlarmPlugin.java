package de.dominikest.dosia;

import android.Manifest;
import android.app.ActivityManager;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.usage.UsageStatsManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.lang.ref.WeakReference;
import java.util.ArrayList;
import java.util.List;

/**
 * Brücke zur App für
 * - den Wecker-Modus (planen, absagen, verbuchte Aktionen abholen) und
 * - den Zuverlässigkeits-Check (Status der Android-Einstellungen, passende Einstellungsseite öffnen).
 */
@CapacitorPlugin(name = "DoseAlarm")
public class DoseAlarmPlugin extends Plugin {

    private static WeakReference<DoseAlarmPlugin> instance = new WeakReference<>(null);

    @Override
    public void load() {
        instance = new WeakReference<>(this);
    }

    /** Vom Receiver aufgerufen: neue verbuchte Aktionen liegen bereit. */
    static void queueChanged() {
        DoseAlarmPlugin p = instance.get();
        if (p != null) p.notifyListeners("alarmQueue", new JSObject(), true);
    }

    private Context ctx() { return getContext(); }

    /* ---------------- Wecker ---------------- */

    /** Ersetzt alle geplanten Wecker. alarms: [{id, at, title, body, takeLabel, snoozeLabel, extra:{…}}] */
    @PluginMethod
    public void schedule(PluginCall call) {
        try {
            JSArray arr = call.getArray("alarms", new JSArray());
            List<JSONObject> list = new ArrayList<>();
            for (int i = 0; i < arr.length(); i++) list.add(arr.getJSONObject(i));
            DoseAlarmStore.ensureChannel(ctx());
            DoseAlarmStore.replaceAll(ctx(), list);
            JSObject r = new JSObject();
            r.put("count", DoseAlarmStore.load(ctx()).size());
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Wecker konnten nicht geplant werden: " + e.getMessage());
        }
    }

    /** Angezeigte Wecker-Benachrichtigungen entfernen (z. B. Dosis in der App abgehakt). */
    @PluginMethod
    public void dismiss(PluginCall call) {
        try {
            JSArray ids = call.getArray("ids", new JSArray());
            java.util.Set<Integer> wanted = new java.util.HashSet<>();
            for (int i = 0; i < ids.length(); i++) wanted.add(ids.optInt(i));
            // Nur Wecker anfassen, die gerade wirklich angezeigt werden – nicht für jede Nummer neue Android-Einträge anlegen
            NotificationManager nm = DoseAlarmReceiver.nm(ctx());
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                for (android.service.notification.StatusBarNotification sbn : nm.getActiveNotifications()) {
                    int id = sbn.getId();
                    if (!wanted.contains(id) || sbn.getNotification().extras.getString("dosiaAlarm") == null) continue;
                    nm.cancel(id);
                    DoseAlarmStore.cancelQuiet(ctx(), id);
                    DoseAlarmReceiver.finishScreen(ctx(), id);
                }
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("dismiss: " + e.getMessage());
        }
    }

    /** Verbuchte Aktionen ("Genommen"/"Später" ohne geöffnete App) abholen – danach ist die Liste leer. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSONArray q = DoseAlarmStore.takeQueue(ctx());
        JSObject r = new JSObject();
        try { r.put("actions", new JSArray(q.toString())); } catch (Exception e) { r.put("actions", new JSArray()); }
        call.resolve(r);
    }

    /* ---------------- Zuverlässigkeits-Check ---------------- */

    @PluginMethod
    public void getStatus(PluginCall call) {
        Context c = ctx();
        JSObject r = new JSObject();
        r.put("sdk", Build.VERSION.SDK_INT);
        r.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase());

        r.put("notificationsEnabled", NotificationManagerCompat.from(c).areNotificationsEnabled());
        NotificationManager nm = DoseAlarmReceiver.nm(c);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel rem = nm.getNotificationChannel("dosia-reminders");
            r.put("reminderChannel", rem == null ? -1 : rem.getImportance());
            NotificationChannel al = nm.getNotificationChannel(DoseAlarmStore.CHANNEL_ID);
            r.put("alarmChannel", al == null ? -1 : al.getImportance());
        } else {
            r.put("reminderChannel", -1);
            r.put("alarmChannel", -1);
        }
        r.put("exactAlarms", DoseAlarmStore.canExact(c));

        PowerManager pm = (PowerManager) c.getSystemService(Context.POWER_SERVICE);
        r.put("batteryUnrestricted", Build.VERSION.SDK_INT < Build.VERSION_CODES.M
            || pm.isIgnoringBatteryOptimizations(c.getPackageName()));

        boolean bgRestricted = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            ActivityManager am = (ActivityManager) c.getSystemService(Context.ACTIVITY_SERVICE);
            bgRestricted = am.isBackgroundRestricted();
        }
        r.put("backgroundRestricted", bgRestricted);

        int bucket = 10;   // STANDBY_BUCKET_ACTIVE
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            UsageStatsManager us = (UsageStatsManager) c.getSystemService(Context.USAGE_STATS_SERVICE);
            try { bucket = us.getAppStandbyBucket(); } catch (Exception ignored) {}
        }
        r.put("standbyBucket", bucket);

        r.put("fullScreen", Build.VERSION.SDK_INT < 34 || nm.canUseFullScreenIntent());
        r.put("dnd", Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            && nm.getCurrentInterruptionFilter() > NotificationManager.INTERRUPTION_FILTER_ALL);
        r.put("alarmsPlanned", DoseAlarmStore.load(c).size());
        call.resolve(r);
    }

    /** Öffnet die passende Android-Einstellung. target: app | notifications | channel | exact | battery | fullscreen */
    @PluginMethod
    public void openSettings(PluginCall call) {
        Context c = ctx();
        String target = call.getString("target", "app");
        String pkg = c.getPackageName();
        Intent i;
        switch (target) {
            case "notifications":
                i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                    : appDetails(pkg);
                break;
            case "channel":
                i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    ? new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS)
                        .putExtra(Settings.EXTRA_APP_PACKAGE, pkg)
                        .putExtra(Settings.EXTRA_CHANNEL_ID, call.getString("channel", "dosia-reminders"))
                    : appDetails(pkg);
                break;
            case "exact":
                i = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    ? new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + pkg))
                    : appDetails(pkg);
                break;
            case "battery":
                // Direkte Rückfrage "Akku-Optimierung beenden?" – nur wenn die Berechtigung vorhanden ist (Homepage-Variante)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && c.checkSelfPermission(Manifest.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS) == PackageManager.PERMISSION_GRANTED) {
                    i = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + pkg));
                } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                } else {
                    i = appDetails(pkg);
                }
                break;
            case "fullscreen":
                i = Build.VERSION.SDK_INT >= 34
                    ? new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + pkg))
                    : appDetails(pkg);
                break;
            default:
                i = appDetails(pkg);
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            c.startActivity(i);
        } catch (Exception e) {
            // Manche Hersteller kennen einzelne Seiten nicht – dann die App-Infos öffnen
            try { c.startActivity(appDetails(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private static Intent appDetails(String pkg) {
        return new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg));
    }

    /** Test: in wenigen Sekunden einen Wecker auslösen (zum Ausprobieren in den Einstellungen). */
    @PluginMethod
    public void test(PluginCall call) {
        try {
            JSONObject o = new JSONObject();
            o.put("id", 999000001);
            o.put("at", System.currentTimeMillis() + call.getInt("seconds", 10) * 1000L);
            o.put("title", call.getString("title", "Dosia"));
            o.put("body", call.getString("body", ""));
            o.put("takeLabel", call.getString("takeLabel", "✓"));
            o.put("snoozeLabel", call.getString("snoozeLabel", "⏰"));
            o.put("extra", new JSONObject().put("test", true));
            DoseAlarmStore.ensureChannel(ctx());
            List<JSONObject> list = DoseAlarmStore.load(ctx());
            List<JSONObject> keep = new ArrayList<>();
            for (JSONObject x : list) if (x.optInt("id") != 999000001) keep.add(x);
            keep.add(o);
            DoseAlarmStore.save(ctx(), keep);
            DoseAlarmStore.scheduleOne(ctx(), o);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage());
        }
    }
}
