package de.dominikest.dosia;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Konfiguration beim Hinzufügen des Widgets "Heute mini": fragt, welches Medikament diese Widget-Instanz zeigt.
 * Zur Auswahl stehen die Medikamente aus dem gespeicherten Tagesstand plus "alle" (nächste offene Einnahme).
 * Jede Instanz bekommt so ihr eigenes Medikament, mehrere Widgets auf dem Desktop sind also möglich.
 */
public class DoseWidgetCompactConfigActivity extends Activity {

    private final List<String> medIds = new ArrayList<>();   // parallel zur Liste; "" = alle
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        setResult(RESULT_CANCELED);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        boolean de = DoseAlarmStore.isGerman();

        List<String> labels = new ArrayList<>();
        labels.add(de ? "Alle – nächste offene Einnahme" : "All – next open dose");
        medIds.add("");

        JSONObject data = DoseWidget.readData(this);
        JSONArray arr = data == null ? null : data.optJSONArray("doses");
        if (arr != null) {
            for (int i = 0; i < arr.length(); i++) {
                JSONObject d = arr.optJSONObject(i);
                if (d == null) continue;
                String medId = d.optString("medId");
                if (medId.isEmpty() || medIds.contains(medId)) continue;
                medIds.add(medId);
                String strength = d.optString("strength", "");
                labels.add(d.optString("name") + (strength.isEmpty() ? "" : " · " + strength));
            }
        }

        TextView hint = new TextView(this);
        hint.setTextSize(15);
        hint.setPadding(pad(), pad(), pad(), pad());
        boolean onlyAll = medIds.size() == 1;
        hint.setText(onlyAll
            ? (de ? "Öffne Dosia einmal, damit deine Medikamente hier erscheinen. Bis dahin zeigt das Widget die nächste offene Einnahme."
                  : "Open Dosia once so your medications appear here. Until then the widget shows the next open dose.")
            : (de ? "Welches Medikament soll dieses Widget zeigen?" : "Which medication should this widget show?"));

        ListView list = new ListView(this);
        list.setAdapter(new ArrayAdapter<>(this, android.R.layout.simple_list_item_1, labels));
        list.setOnItemClickListener((parent, view, position, id) -> choose(medIds.get(position)));

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.addView(hint, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        root.addView(list, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);
        setTitle(de ? "Dosia · Heute mini" : "Dosia · Today mini");
    }

    /** Speichert die Auswahl, aktualisiert diese Instanz und schließt die Konfiguration mit OK. */
    private void choose(String medId) {
        DoseWidgetCompact.saveMed(this, widgetId, medId);
        DoseWidgetCompact.updateOne(this, AppWidgetManager.getInstance(this), widgetId);
        setResult(RESULT_OK, new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId));
        finish();
    }

    private int pad() {
        return Math.round(16 * getResources().getDisplayMetrics().density);
    }
}
