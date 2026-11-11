package de.dominikest.dosia;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Kompaktes Startbildschirm-Widget "Heute": ein Knopf pro Medikament.
 * Ein Tipp auf einen offenen Knopf verbucht die nächste offene Einnahme dieses Medikaments
 * (gleiche Warteschlange wie das große Widget). Erledigte Medikamente sind grau mit ✓.
 * Die Daten kommen aus demselben Tagesstand wie beim großen Widget (DoseWidget.save).
 */
public class DoseWidgetCompact extends AppWidgetProvider {

    static final int MAX_BUTTONS = 4;
    private static final int REQ_OPEN = 9400;   // 9401.. für Knopf-Slots
    private static final int REQ_TAKE = 9500;   // eigene Request-Codes, damit sich die PendingIntents nicht überschreiben

    private static final int[] BTN_IDS = {R.id.compact_btn_0, R.id.compact_btn_1, R.id.compact_btn_2, R.id.compact_btn_3};

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) updateOne(c, mgr, id);
    }

    static void refreshAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        for (int id : mgr.getAppWidgetIds(new ComponentName(c, DoseWidgetCompact.class))) updateOne(c, mgr, id);
    }

    static void updateOne(Context c, AppWidgetManager mgr, int widgetId) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.dosia_widget_compact);
        v.setOnClickPendingIntent(R.id.widget_compact_root, DoseWidget.openPi(c, REQ_OPEN));
        boolean de = DoseAlarmStore.isGerman();

        String today = DoseWidget.todayKey();
        JSONObject data = DoseWidget.readData(c);
        boolean stale = data == null || !today.equals(data.optString("date"));

        Map<String, Med> meds = new LinkedHashMap<>();
        if (!stale) {
            Set<String> pending = DoseWidget.pending(c, today);
            JSONArray arr = data.optJSONArray("doses");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject d = arr.optJSONObject(i);
                    if (d == null) continue;
                    String key = d.optString("medId", "");
                    if (key.isEmpty()) key = d.optString("name");
                    Med med = meds.get(key);
                    if (med == null) {
                        med = new Med(d.optString("name"));
                        meds.put(key, med);
                    }
                    boolean isDone = d.optBoolean("done") || pending.contains(DoseWidget.ident(d));
                    if (!isDone && med.next == null) med.next = d;   // Array ist nach Uhrzeit sortiert
                }
            }
        }

        if (stale) {
            showMessage(v, de ? "Dosia öffnen für den Tagesplan" : "Open Dosia for today's plan");
        } else if (meds.isEmpty()) {
            showMessage(v, de ? "Heute nichts einzunehmen" : "Nothing to take today");
        } else {
            v.setViewVisibility(R.id.compact_message, View.GONE);
            v.setViewVisibility(R.id.compact_row, View.VISIBLE);

            int slot = 0;
            for (Med med : meds.values()) {
                if (slot >= MAX_BUTTONS) break;
                int id = BTN_IDS[slot];
                v.setTextViewText(id, med.next == null ? "✓" : med.initials());
                v.setInt(id, "setBackgroundResource",
                    med.next == null ? R.drawable.dosia_widget_btn_done : R.drawable.dosia_widget_btn);
                v.setOnClickPendingIntent(id, med.next == null
                    ? DoseWidget.openPi(c, REQ_OPEN + 1 + slot)
                    : takePi(c, slot, med.next));
                String state = med.next == null
                    ? (de ? "erledigt" : "done")
                    : (de ? "tippen zum Abhaken" : "tap to tick off");
                v.setContentDescription(id, med.name + " · " + state);
                v.setViewVisibility(id, View.VISIBLE);
                slot++;
            }
            for (int i = slot; i < MAX_BUTTONS; i++) v.setViewVisibility(BTN_IDS[i], View.GONE);

            int more = meds.size() - slot;
            if (more > 0) {
                v.setTextViewText(R.id.compact_more, "+" + more);
                v.setViewVisibility(R.id.compact_more, View.VISIBLE);
            } else {
                v.setViewVisibility(R.id.compact_more, View.GONE);
            }
        }

        mgr.updateAppWidget(widgetId, v);
    }

    private static void showMessage(RemoteViews v, String text) {
        v.setTextViewText(R.id.compact_message, text);
        v.setViewVisibility(R.id.compact_message, View.VISIBLE);
        v.setViewVisibility(R.id.compact_row, View.GONE);
    }

    /** Verbucht die nächste offene Einnahme dieses Medikaments über DoseWidget.onReceive. */
    private static PendingIntent takePi(Context c, int slot, JSONObject dose) {
        Intent i = new Intent(c, DoseWidget.class)
            .setAction(DoseWidget.ACTION_TAKE)
            .putExtra(DoseWidget.EXTRA_DOSE, dose.toString());
        return PendingIntent.getBroadcast(c, REQ_TAKE + slot, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Ein Medikament mit seiner nächsten offenen Einnahme (null, wenn heute alles erledigt ist). */
    private static final class Med {
        final String name;
        JSONObject next;

        Med(String name) {
            this.name = name;
        }

        /** Kürzel für den Knopf: Anfangsbuchstaben der ersten zwei Wörter, z.B. "Ibuprofen 400" → "IB". */
        String initials() {
            String n = name == null ? "" : name.trim();
            if (n.isEmpty()) return "?";
            String[] parts = n.split("\\s+");
            String s = parts.length >= 2
                ? parts[0].substring(0, 1) + parts[1].substring(0, 1)
                : n.substring(0, Math.min(2, n.length()));
            return s.toUpperCase(java.util.Locale.getDefault());
        }
    }
}
