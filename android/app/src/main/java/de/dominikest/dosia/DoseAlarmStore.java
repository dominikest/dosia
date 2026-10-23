package de.dominikest.dosia;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Wecker-Modus: Ablage und Planung der Wecker-Erinnerungen.
 * Die App übergibt die komplette Liste (ersetzt die alte); sie wird in den SharedPreferences
 * gespeichert, damit sie einen Neustart des Handys oder ein App-Update übersteht.
 * Geplant wird mit AlarmManager.setAlarmClock – das ist der zuverlässigste Weg, den Android
 * bietet (wie ein echter Wecker, auch im Ruhemodus).
 */
final class DoseAlarmStore {

    static final String PREFS = "dosia_alarms";
    static final String KEY_LIST = "alarms";
    static final String CHANNEL_ID = "dosia-alarm";
    static final String ACTION_FIRE = "de.dominikest.dosia.ALARM_FIRE";
    static final String ACTION_QUIET = "de.dominikest.dosia.ALARM_QUIET";
    static final String ACTION_FINISH = "de.dominikest.dosia.ALARM_FINISH";
    static final String ACTION_USER = "de.dominikest.dosia.ALARM_ACTION";
    static final String EXTRA_ID = "alarmId";
    static final String EXTRA_ACTION = "alarmActionId";
    /** So lange klingelt ein Wecker höchstens, danach bleibt er als stille Benachrichtigung stehen. */
    static final long RING_MS = 5 * 60 * 1000L;

    private DoseAlarmStore() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static List<JSONObject> load(Context c) {
        List<JSONObject> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString(KEY_LIST, "[]"));
            for (int i = 0; i < a.length(); i++) out.add(a.getJSONObject(i));
        } catch (JSONException ignored) {}
        return out;
    }

    static void save(Context c, List<JSONObject> list) {
        JSONArray a = new JSONArray();
        for (JSONObject o : list) a.put(o);
        prefs(c).edit().putString(KEY_LIST, a.toString()).apply();
    }

    static JSONObject find(Context c, int id) {
        for (JSONObject o : load(c)) if (o.optInt("id") == id) return o;
        return null;
    }

    static void remove(Context c, int id) {
        List<JSONObject> list = load(c), keep = new ArrayList<>();
        for (JSONObject o : list) if (o.optInt("id") != id) keep.add(o);
        save(c, keep);
    }

    static PendingIntent firePi(Context c, int id) {
        Intent i = new Intent(c, DoseAlarmReceiver.class).setAction(ACTION_FIRE).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static PendingIntent quietPi(Context c, int id) {
        Intent i = new Intent(c, DoseAlarmReceiver.class).setAction(ACTION_QUIET).putExtra(EXTRA_ID, id);
        return PendingIntent.getBroadcast(c, id ^ 0x40000000, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Öffnet Dosia (Startbildschirm-Symbol für den Wecker in der Statusleiste). */
    static PendingIntent showPi(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(c, 7, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Knopf "Genommen" / "Später" in der Benachrichtigung – wird ohne Entsperren direkt verbucht. */
    static PendingIntent userActionPi(Context c, int id, String actionId) {
        Intent i = new Intent(c, DoseAlarmReceiver.class)
            .setAction(ACTION_USER + "." + actionId)
            .putExtra(EXTRA_ID, id).putExtra(EXTRA_ACTION, actionId);
        int req = (id * 7 + actionId.hashCode()) & 0x7fffffff;
        return PendingIntent.getBroadcast(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Ident einer Dosis ("YYYY-MM-DD|medId|HH:MM") aus den Zusatzdaten eines Weckers. */
    static String doseIdent(JSONObject o) {
        JSONObject x = o.optJSONObject("extra");
        if (x == null) return "";
        return x.optString("key") + "|" + x.optString("medId") + "|" + x.optString("time");
    }

    /** Alle geplanten Wecker derselben Dosis absagen (z. B. Nachhaken, nachdem sie genommen wurde). */
    static void cancelDose(Context c, String ident) {
        if (ident.isEmpty()) return;
        List<JSONObject> keep = new ArrayList<>();
        for (JSONObject o : load(c)) {
            if (ident.equals(doseIdent(o))) cancelOne(c, o.optInt("id"));
            else keep.add(o);
        }
        save(c, keep);
    }

    /* ---------- Warteschlange: Aktionen, die die App beim nächsten Öffnen verbucht ---------- */
    static final String KEY_QUEUE = "queue";

    static void enqueue(Context c, String actionId, JSONObject alarm) {
        try {
            JSONArray q = new JSONArray(prefs(c).getString(KEY_QUEUE, "[]"));
            JSONObject e = new JSONObject();
            e.put("actionId", actionId);
            e.put("id", alarm.optInt("id"));
            e.put("extra", alarm.optJSONObject("extra") != null ? alarm.optJSONObject("extra") : new JSONObject());
            e.put("ts", System.currentTimeMillis());
            q.put(e);
            prefs(c).edit().putString(KEY_QUEUE, q.toString()).apply();
        } catch (JSONException ignored) {}
    }

    static JSONArray takeQueue(Context c) {
        JSONArray q;
        try { q = new JSONArray(prefs(c).getString(KEY_QUEUE, "[]")); } catch (JSONException e) { q = new JSONArray(); }
        prefs(c).edit().remove(KEY_QUEUE).apply();
        return q;
    }

    static boolean canExact(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.S || am.canScheduleExactAlarms();
    }

    static void scheduleOne(Context c, JSONObject o) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        int id = o.optInt("id");
        long at = o.optLong("at");
        PendingIntent pi = firePi(c, id);
        try {
            if (canExact(c)) {
                am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi(c)), pi);
            } else {
                // Ohne Erlaubnis für exakte Alarme: so genau wie möglich (kann sich etwas verzögern)
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            }
        } catch (RuntimeException e) {
            // z. B. Android-Grenze von 500 Weckern erreicht – diesen einen auslassen statt die App abstürzen zu lassen
            pi.cancel();
        }
    }

    /**
     * Vorhandenen Verweis (PendingIntent) holen, OHNE einen neuen anzulegen.
     * Wichtig: Jedes getBroadcast() ohne FLAG_NO_CREATE legt bei Android einen Eintrag an; bei Tausenden
     * (Absagen/Aufräumen bei jeder Neuplanung) bricht Android die App ab – bis "Stopp erzwingen".
     */
    private static PendingIntent existing(Context c, String action, int requestCode) {
        Intent i = new Intent(c, DoseAlarmReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(c, requestCode, i, PendingIntent.FLAG_NO_CREATE | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void cancelPi(Context c, PendingIntent pi) {
        if (pi == null) return;
        ((AlarmManager) c.getSystemService(Context.ALARM_SERVICE)).cancel(pi);
        pi.cancel();                                         // Eintrag bei Android freigeben
    }

    /** Geplanten Wecker und ggf. sein "Verstummen" absagen. */
    static void cancelOne(Context c, int id) {
        cancelPi(c, existing(c, ACTION_FIRE, id));
        cancelQuiet(c, id);
    }

    /** Nur das automatische Verstummen eines klingelnden Weckers absagen. */
    static void cancelQuiet(Context c, int id) {
        cancelPi(c, existing(c, ACTION_QUIET, id ^ 0x40000000));
    }

    /** Ersetzt alle geplanten Wecker durch die neue Liste. */
    static final int TEST_ID = 999000001;

    static void replaceAll(Context c, List<JSONObject> fresh) {
        long now = System.currentTimeMillis();
        List<JSONObject> keep = new ArrayList<>();
        for (JSONObject o : load(c)) {
            if (o.optInt("id") == TEST_ID) { keep.add(o); continue; }   // Test-Wecker aus dem Check behalten
            cancelOne(c, o.optInt("id"));
        }
        for (JSONObject o : fresh) {
            if (o.optLong("at") <= now) continue;
            scheduleOne(c, o);
            keep.add(o);
        }
        save(c, keep);
    }

    /** Nach Neustart, App-Update oder Zeitänderung: alles neu beim AlarmManager anmelden. */
    static void restore(Context c) {
        long now = System.currentTimeMillis();
        List<JSONObject> keep = new ArrayList<>();
        for (JSONObject o : load(c)) {
            long at = o.optLong("at");
            if (at > now) { scheduleOne(c, o); keep.add(o); }
            else if (now - at < 60 * 60 * 1000L) {
                // Während das Handy aus war fällig geworden: jetzt sofort klingeln
                DoseAlarmReceiver.ring(c, o);
            }
        }
        save(c, keep);
    }

    static void ensureChannel(Context c) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return;
        String name = isGerman() ? "Wecker für wichtige Medikamente" : "Alarms for important medication";
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, name, NotificationManager.IMPORTANCE_HIGH);
        ch.setDescription(isGerman()
            ? "Klingelt wie ein Wecker, bis die Einnahme bestätigt ist"
            : "Rings like an alarm clock until the dose is confirmed");
        Uri sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (sound == null) sound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        ch.setSound(sound, new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        ch.enableVibration(true);
        ch.setVibrationPattern(new long[]{0, 800, 400, 800, 400, 800});
        ch.setLockscreenVisibility(android.app.Notification.VISIBILITY_PUBLIC);
        nm.createNotificationChannel(ch);
    }

    static boolean isGerman() {
        return java.util.Locale.getDefault().getLanguage().equals("de");
    }
}
