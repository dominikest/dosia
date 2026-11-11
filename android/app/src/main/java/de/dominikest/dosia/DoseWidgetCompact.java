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

import java.util.Set;

/**
 * Kleinstes Startbildschirm-Widget (1x1): Dosia-Symbol plus Medikament der nächsten offenen Einnahme von heute.
 * Ein Tipp auf das Widget verbucht genau diese Einnahme (gleiche Warteschlange wie das große Widget).
 * Ist nichts mehr offen, zeigt es ✓ über einem hellen Schleier; ohne Tagesstand öffnet ein Tipp die App.
 * Die Daten kommen aus demselben Tagesstand wie beim großen Widget (DoseWidget.save).
 */
public class DoseWidgetCompact extends AppWidgetProvider {

    private static final int REQ_OPEN = 9400;
    private static final int REQ_TAKE = 9500;
    private static final int NAME_MAX = 6;   // Zeichen des Medikamentennamens auf dem Label

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
        boolean de = DoseAlarmStore.isGerman();

        String today = DoseWidget.todayKey();
        JSONObject data = DoseWidget.readData(c);
        boolean stale = data == null || !today.equals(data.optString("date"));

        JSONObject next = null;   // früheste offene Einnahme (Array ist nach Uhrzeit sortiert)
        int open = 0, total = 0;
        if (!stale) {
            Set<String> pending = DoseWidget.pending(c, today);
            JSONArray arr = data.optJSONArray("doses");
            if (arr != null) {
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject d = arr.optJSONObject(i);
                    if (d == null) continue;
                    total++;
                    boolean isDone = d.optBoolean("done") || pending.contains(DoseWidget.ident(d));
                    if (!isDone) {
                        open++;
                        if (next == null) next = d;
                    }
                }
            }
        }

        if (stale) {
            setLabel(v, de ? "Öffnen" : "Open", de ? "Dosia öffnen für den Tagesplan" : "Open Dosia for today's plan");
            v.setViewVisibility(R.id.compact_done, View.GONE);
            v.setOnClickPendingIntent(R.id.widget_compact_root, DoseWidget.openPi(c, REQ_OPEN));
        } else if (total == 0) {
            setLabel(v, de ? "Frei" : "Free", de ? "Heute nichts einzunehmen" : "Nothing to take today");
            v.setViewVisibility(R.id.compact_done, View.GONE);
            v.setOnClickPendingIntent(R.id.widget_compact_root, DoseWidget.openPi(c, REQ_OPEN));
        } else if (next == null) {
            setLabel(v, "✓", de ? "Heute alles erledigt" : "Today all done");
            v.setViewVisibility(R.id.compact_done, View.VISIBLE);
            v.setOnClickPendingIntent(R.id.widget_compact_root, DoseWidget.openPi(c, REQ_OPEN));
        } else {
            String text = shortName(next.optString("name"));
            if (open > 1) text += " +" + (open - 1);
            String state = de ? "tippen zum Abhaken" : "tap to tick off";
            setLabel(v, text, next.optString("name") + " · " + next.optString("time") + " · " + state);
            v.setViewVisibility(R.id.compact_done, View.GONE);
            v.setOnClickPendingIntent(R.id.widget_compact_root, takePi(c, next));
        }

        mgr.updateAppWidget(widgetId, v);
    }

    private static void setLabel(RemoteViews v, String text, String description) {
        v.setTextViewText(R.id.compact_label, text);
        v.setContentDescription(R.id.widget_compact_root, description);
    }

    /** Verbucht die Einnahme über DoseWidget.onReceive (wie die Knöpfe des großen Widgets). */
    private static PendingIntent takePi(Context c, JSONObject dose) {
        Intent i = new Intent(c, DoseWidget.class)
            .setAction(DoseWidget.ACTION_TAKE)
            .putExtra(DoseWidget.EXTRA_DOSE, dose.toString());
        return PendingIntent.getBroadcast(c, REQ_TAKE, i,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Erstes Wort des Namens, gekürzt: "Ibuprofen 400" → "Ibupro". */
    static String shortName(String name) {
        String n = name == null ? "" : name.trim();
        if (n.isEmpty()) return "?";
        String first = n.split("\\s+")[0];
        return first.length() > NAME_MAX ? first.substring(0, NAME_MAX) : first;
    }
}
