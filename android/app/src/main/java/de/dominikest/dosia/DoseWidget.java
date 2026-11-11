package de.dominikest.dosia;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Startbildschirm-Widget "Heute": zeigt die offenen Einnahmen von heute.
 * Ein Tipp auf ✓ verbucht die Einnahme über dieselbe Warteschlange wie "Genommen" in der
 * Benachrichtigung – die App übernimmt sie beim nächsten Öffnen (bzw. sofort, wenn sie läuft).
 * Der Tagesstand kommt aus der App (DoseAlarmPlugin.setWidgetData) und wird hier nur angezeigt.
 */
public class DoseWidget extends AppWidgetProvider {

    static final String ACTION_TAKE = "de.dominikest.dosia.WIDGET_TAKE";
    static final String PREFS = "dosia_widget";
    static final String KEY_DATA = "data";
    static final String KEY_PENDING = "pending";
    static final String EXTRA_DOSE = "dose";
    static final int ROWS = 4;
    private static final int REQ_OPEN = 9100;
    private static final int REQ_TAKE = 9200;

    private static final int[] ROW_IDS = {R.id.row_0, R.id.row_1, R.id.row_2, R.id.row_3};
    private static final int[] TEXT_IDS = {R.id.row_text_0, R.id.row_text_1, R.id.row_text_2, R.id.row_text_3};
    private static final int[] BTN_IDS = {R.id.row_btn_0, R.id.row_btn_1, R.id.row_btn_2, R.id.row_btn_3};

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateOne(c, mgr, id);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (!ACTION_TAKE.equals(intent.getAction())) return;
        String doseJson = intent.getStringExtra(EXTRA_DOSE);
        if (doseJson == null) return;
        try {
            JSONObject dose = new JSONObject(doseJson);
            String ident = ident(dose);
            if (ident.isEmpty()) return;
            markPending(c, ident);
            // Medikamenten-ID unverändert übernehmen (Typ wie in der App), damit die App sie wiederfindet
            JSONObject extra = new JSONObject()
                .put("key", dose.opt("key")).put("medId", dose.opt("medId")).put("time", dose.opt("time"));
            // Wie "Genommen" in der Benachrichtigung: Nachhaken und angezeigte Erinnerungen dieser Einnahme sofort entfernen
            DoseAlarmStore.cancelDose(c, ident);
            DoseAlarmReceiver.cancelShownOfDose(c, new JSONObject().put("extra", extra), -1);
            DoseAlarmStore.enqueue(c, "take", new JSONObject().put("id", 0).put("extra", extra));
        } catch (JSONException ignored) {
            return;
        }
        refreshAll(c);
        DoseAlarmPlugin.queueChanged();                       // läuft die App, verbucht sie es sofort
    }

    /** Vom Plugin aufgerufen: neuer Tagesstand (JSON {date, doses:[…]}). */
    static void save(Context c, String json) {
        prefs(c).edit().putString(KEY_DATA, json).apply();
        refreshAll(c);
    }

    static void refreshAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        for (int id : mgr.getAppWidgetIds(new ComponentName(c, DoseWidget.class))) updateOne(c, mgr, id);
    }

    static void updateOne(Context c, AppWidgetManager mgr, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.dosia_widget);
        v.setOnClickPendingIntent(R.id.widget_root, openPi(c, REQ_OPEN));

        String today = todayKey();
        JSONObject data = readData(c);
        boolean stale = data == null || !today.equals(data.optString("date"));
        List<JSONObject> open = new ArrayList<>();
        int total = 0, done = 0;
        if (!stale) {
            Set<String> pending = pending(c, today);
            JSONArray arr = data.optJSONArray("doses");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject d = arr.optJSONObject(i);
                    if (d == null) continue;
                    total++;
                    if (d.optBoolean("done") || pending.contains(ident(d))) done++;
                    else open.add(d);
                }
            }
        }

        if (stale) {
            v.setTextViewText(R.id.widget_header, isGerman() ? "Heute" : "Today");
            v.setTextViewText(R.id.widget_message, isGerman()
                ? "Dosia öffnen, um den Tagesplan zu laden"
                : "Open Dosia to load today's schedule");
            v.setViewVisibility(R.id.widget_message, View.VISIBLE);
        } else if (total == 0) {
            v.setTextViewText(R.id.widget_header, isGerman() ? "Heute" : "Today");
            v.setTextViewText(R.id.widget_message, isGerman()
                ? "Heute ist nichts einzunehmen"
                : "Nothing to take today");
            v.setViewVisibility(R.id.widget_message, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_message, View.GONE);
            if (open.isEmpty()) {
                v.setTextViewText(R.id.widget_header, isGerman()
                    ? "Heute alles erledigt ✓" : "Today all done ✓");
            } else {
                v.setTextViewText(R.id.widget_header, isGerman()
                    ? "Heute · " + open.size() + " offen · " + done + "/" + total + " erledigt"
                    : "Today · " + open.size() + " open · " + done + "/" + total + " done");
            }
        }

        for (int i = 0; i < ROWS; i++) {
            if (i >= open.size()) {
                v.setViewVisibility(ROW_IDS[i], View.GONE);
                continue;
            }
            JSONObject d = open.get(i);
            String strength = d.optString("strength", "");
            String text = d.optString("time") + "  " + d.optString("name")
                + (strength.isEmpty() ? "" : " · " + strength);
            v.setTextViewText(TEXT_IDS[i], text);
            v.setOnClickPendingIntent(TEXT_IDS[i], openPi(c, REQ_OPEN + 1 + i));
            v.setOnClickPendingIntent(BTN_IDS[i], takePi(c, i, d));
            v.setViewVisibility(ROW_IDS[i], View.VISIBLE);
        }

        if (open.size() > ROWS) {
            int more = open.size() - ROWS;
            v.setTextViewText(R.id.widget_more, isGerman()
                ? "+" + more + " weitere · Dosia öffnen"
                : "+" + more + " more · open Dosia");
            v.setViewVisibility(R.id.widget_more, View.VISIBLE);
        } else {
            v.setViewVisibility(R.id.widget_more, View.GONE);
        }

        mgr.updateAppWidget(widgetId, v);
    }

    /* ---------- Speicher ---------- */

    private static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static JSONObject readData(Context c) {
        try {
            String s = prefs(c).getString(KEY_DATA, null);
            return s == null ? null : new JSONObject(s);
        } catch (JSONException e) {
            return null;
        }
    }

    /** Heute bereits verbuchte Einnahmen (Ident "YYYY-MM-DD|medId|HH:MM"), bis die App den Stand neu schickt. */
    private static Set<String> pending(Context c, String today) {
        Set<String> out = new HashSet<>();
        for (String s : readPending(c)) if (s.startsWith(today + "|")) out.add(s);
        return out;
    }

    private static void markPending(Context c, String ident) {
        String today = todayKey();
        Set<String> keep = new HashSet<>();
        for (String s : readPending(c)) if (s.startsWith(today + "|")) keep.add(s);
        keep.add(ident);
        JSONArray a = new JSONArray();
        for (String s : keep) a.put(s);
        prefs(c).edit().putString(KEY_PENDING, a.toString()).apply();
    }

    private static List<String> readPending(Context c) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(prefs(c).getString(KEY_PENDING, "[]"));
            for (int i = 0; i < a.length(); i++) out.add(a.optString(i));
        } catch (JSONException ignored) {}
        return out;
    }

    /* ---------- Hilfsfunktionen ---------- */

    static String ident(JSONObject d) {
        String key = d.optString("key"), medId = d.optString("medId"), time = d.optString("time");
        return key.isEmpty() ? "" : key + "|" + medId + "|" + time;
    }

    private static String todayKey() {
        Calendar cal = Calendar.getInstance();
        return String.format(Locale.US, "%04d-%02d-%02d",
            cal.get(Calendar.YEAR), cal.get(Calendar.MONTH) + 1, cal.get(Calendar.DAY_OF_MONTH));
    }

    private static PendingIntent takePi(Context c, int row, JSONObject dose) {
        Intent i = new Intent(c, DoseWidget.class).setAction(ACTION_TAKE).putExtra(EXTRA_DOSE, dose.toString());
        return PendingIntent.getBroadcast(c, REQ_TAKE + row, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Öffnet Dosia mit der Ansicht "Heute" (wie das Antippen einer Erinnerung). */
    private static PendingIntent openPi(Context c, int requestCode) {
        Intent i = new Intent(c, MainActivity.class)
            .setAction("de.dominikest.dosia.OPEN_REMINDER")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP)
            .putExtra(DoseAlarmStore.EXTRA_TAP, "today");
        return PendingIntent.getActivity(c, requestCode, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static boolean isGerman() {
        return DoseAlarmStore.isGerman();
    }
}
