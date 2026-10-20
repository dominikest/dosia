package de.dominikest.dosia;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.service.notification.StatusBarNotification;

import androidx.core.app.NotificationCompat;

import org.json.JSONObject;

/**
 * Wecker-Modus:
 * - löst einen Wecker aus: Benachrichtigung mit Wecker-Ton (wiederholt sich, bis reagiert wird) und
 *   bildschirmfüllender Anzeige (DoseAlarmActivity), auch auf dem Sperrbildschirm;
 * - nach RING_MS verstummt der Ton, die Erinnerung bleibt still in der Leiste stehen;
 * - verbucht "Genommen" / "Später" ohne Entsperren (die App übernimmt es beim nächsten Öffnen);
 * - meldet nach Neustart, App-Update oder Zeitumstellung alle Wecker neu an.
 */
public class DoseAlarmReceiver extends BroadcastReceiver {

    static final int SNOOZE_MIN = 10;

    @Override
    public void onReceive(Context c, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;
        int id = intent.getIntExtra(DoseAlarmStore.EXTRA_ID, 0);
        if (action.startsWith(DoseAlarmStore.ACTION_USER)) {
            JSONObject o = activeAlarm(c, id);
            if (o != null) handleUser(c, o, intent.getStringExtra(DoseAlarmStore.EXTRA_ACTION));
            return;
        }
        switch (action) {
            case Intent.ACTION_BOOT_COMPLETED:
            case Intent.ACTION_MY_PACKAGE_REPLACED:
            case Intent.ACTION_TIME_CHANGED:
            case Intent.ACTION_TIMEZONE_CHANGED:
            case AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED:
                DoseAlarmStore.restore(c);
                return;
            case DoseAlarmStore.ACTION_FIRE: {
                JSONObject o = DoseAlarmStore.find(c, id);
                if (o == null) return;                       // inzwischen abgesagt (z. B. schon genommen)
                DoseAlarmStore.remove(c, id);
                ring(c, o);
                return;
            }
            case DoseAlarmStore.ACTION_QUIET:
                quiet(c, id);
                return;
            default:
        }
    }

    static void ring(Context c, JSONObject o) {
        DoseAlarmStore.ensureChannel(c);
        int id = o.optInt("id");
        nm(c).notify(id, build(c, o, true));

        // Nach einigen Minuten verstummen, falls niemand reagiert
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        long at = System.currentTimeMillis() + DoseAlarmStore.RING_MS;
        PendingIntent q = DoseAlarmStore.quietPi(c, id);
        if (DoseAlarmStore.canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, q);
        else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, q);

        // Ältere Android-Versionen: Bildschirm direkt öffnen (ab Android 10 übernimmt das die Benachrichtigung)
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            try { c.startActivity(DoseAlarmActivity.intent(c, o).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
            catch (Exception ignored) {}
        }
    }

    /** Ton aus, Erinnerung bleibt als stille Benachrichtigung mit Knöpfen stehen. */
    static void quiet(Context c, int id) {
        finishScreen(c, id);
        JSONObject o = activeAlarm(c, id);
        if (o != null) nm(c).notify(id, build(c, o, false));
    }

    /** "Genommen" oder "Später" – vom Wecker-Bildschirm oder aus der Benachrichtigung. */
    static void handleUser(Context c, JSONObject o, String actionId) {
        int id = o.optInt("id");
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        am.cancel(DoseAlarmStore.quietPi(c, id));
        nm(c).cancel(id);
        finishScreen(c, id);
        if ("take".equals(actionId)) {
            // Weitere Wecker dieser Dosis (Nachhaken) sofort absagen
            DoseAlarmStore.cancelDose(c, DoseAlarmStore.doseIdent(o));
        } else if ("snooze".equals(actionId)) {
            try {
                JSONObject again = new JSONObject(o.toString());
                again.put("at", System.currentTimeMillis() + SNOOZE_MIN * 60 * 1000L);
                java.util.List<JSONObject> list = DoseAlarmStore.load(c);
                list.add(again);
                DoseAlarmStore.save(c, list);
                DoseAlarmStore.scheduleOne(c, again);
            } catch (Exception ignored) {}
        } else {
            return;
        }
        DoseAlarmStore.enqueue(c, actionId, o);
        DoseAlarmPlugin.queueChanged();                       // läuft die App gerade, verbucht sie es sofort
    }

    static void finishScreen(Context c, int id) {
        c.sendBroadcast(new Intent(DoseAlarmStore.ACTION_FINISH).setPackage(c.getPackageName())
            .putExtra(DoseAlarmStore.EXTRA_ID, id));
    }

    /** Daten eines gerade angezeigten Weckers (aus der Benachrichtigung). */
    static JSONObject activeAlarm(Context c, int id) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return null;
        for (StatusBarNotification sbn : nm(c).getActiveNotifications()) {
            if (sbn.getId() != id) continue;
            String json = sbn.getNotification().extras.getString("dosiaAlarm");
            if (json == null) return null;
            try { return new JSONObject(json); } catch (Exception e) { return null; }
        }
        return null;
    }

    static NotificationManager nm(Context c) {
        return (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
    }

    static Notification build(Context c, JSONObject o, boolean ringing) {
        int id = o.optInt("id");
        String title = o.optString("title", "Dosia");
        String body = o.optString("body", "");

        PendingIntent full = PendingIntent.getActivity(c, id, DoseAlarmActivity.intent(c, o),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(c, DoseAlarmStore.CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(ringing)
            .setContentIntent(full)
            .addAction(0, o.optString("takeLabel", "✓"), DoseAlarmStore.userActionPi(c, id, "take"))
            .addAction(0, o.optString("snoozeLabel", "⏰"), DoseAlarmStore.userActionPi(c, id, "snooze"));
        Bundle ex = new Bundle();
        ex.putString("dosiaAlarm", o.toString());
        b.addExtras(ex);
        if (ringing) b.setFullScreenIntent(full, true);
        else b.setSilent(true).setOnlyAlertOnce(true);
        Notification n = b.build();
        if (ringing) n.flags |= Notification.FLAG_INSISTENT;   // Ton wiederholt sich bis zur Reaktion
        return n;
    }
}
