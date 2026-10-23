package de.dominikest.dosia;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.text.DateFormat;
import java.util.Date;

/**
 * Bildschirmfüllende Wecker-Anzeige, auch über dem Sperrbildschirm.
 * "Genommen" und "Später" werden ohne Entsperren verbucht.
 * Der Ton kommt von der Benachrichtigung und endet, sobald hier reagiert wird.
 */
public class DoseAlarmActivity extends Activity {

    private JSONObject alarm;
    private int alarmId;

    private final BroadcastReceiver finish = new BroadcastReceiver() {
        @Override public void onReceive(Context c, Intent i) {
            int id = i.getIntExtra(DoseAlarmStore.EXTRA_ID, 0);
            if (id == 0 || id == alarmId) finishAndRemoveTask();
        }
    };

    static Intent intent(Context c, JSONObject o) {
        return new Intent(c, DoseAlarmActivity.class)
            .setAction("dosia.alarm." + o.optInt("id"))
            .putExtra("alarm", o.toString())
            .addFlags(Intent.FLAG_ACTIVITY_NO_USER_ACTION);
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        } else {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        try { alarm = new JSONObject(getIntent().getStringExtra("alarm")); }
        catch (Exception e) { finish(); return; }
        alarmId = alarm.optInt("id");

        // Ist der Wecker schon erledigt (z. B. in der Benachrichtigung bestätigt)? Dann nicht mehr anzeigen.
        if (DoseAlarmReceiver.activeAlarm(this, alarmId) == null) { finish(); return; }

        ContextCompat.registerReceiver(this, finish, new IntentFilter(DoseAlarmStore.ACTION_FINISH),
            ContextCompat.RECEIVER_NOT_EXPORTED);
        setContentView(buildUi());
    }

    private int dp(float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()));
    }

    private LinearLayout buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER);
        root.setPadding(dp(28), dp(48), dp(28), dp(40));
        root.setBackgroundColor(Color.parseColor("#0f1620"));

        TextView icon = new TextView(this);
        icon.setText("⏰");
        icon.setTextSize(64);
        icon.setGravity(Gravity.CENTER);
        root.addView(icon);

        TextView time = new TextView(this);
        time.setText(DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date()));
        time.setTextColor(Color.parseColor("#8de6d3"));
        time.setTextSize(44);
        time.setTypeface(Typeface.DEFAULT_BOLD);
        time.setGravity(Gravity.CENTER);
        time.setPadding(0, dp(6), 0, dp(14));
        root.addView(time);

        TextView title = new TextView(this);
        title.setText(alarm.optString("title", "Dosia"));
        title.setTextColor(Color.WHITE);
        title.setTextSize(26);
        title.setTypeface(Typeface.DEFAULT_BOLD);
        title.setGravity(Gravity.CENTER);
        root.addView(title);

        TextView body = new TextView(this);
        body.setText(alarm.optString("body", ""));
        body.setTextColor(Color.parseColor("#93a3b3"));
        body.setTextSize(18);
        body.setGravity(Gravity.CENTER);
        body.setPadding(0, dp(10), 0, dp(36));
        root.addView(body);

        root.addView(button(alarm.optString("takeLabel", "✓"), "#1f8a70", Color.WHITE, "take"));
        root.addView(button(alarm.optString("snoozeLabel", "⏰"), "#1f2b38", Color.parseColor("#e7edf3"), "snooze"));
        return root;
    }

    private Button button(String label, String bg, int fg, String actionId) {
        Button b = new Button(this);
        b.setText(label);
        b.setAllCaps(false);
        b.setTextSize(20);
        b.setTextColor(fg);
        b.setTypeface(Typeface.DEFAULT_BOLD);
        GradientDrawable d = new GradientDrawable();
        d.setColor(Color.parseColor(bg));
        d.setCornerRadius(dp(18));
        b.setBackground(d);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, dp(64));
        lp.topMargin = dp(12);
        b.setLayoutParams(lp);
        b.setOnClickListener(v -> {
            DoseAlarmReceiver.handleUser(this, alarm, actionId);
            finishAndRemoveTask();
        });
        return b;
    }

    @Override
    public void onBackPressed() {
        // Zurück = Ton aus, Erinnerung bleibt still in der Leiste (wie nach Ablauf der Klingelzeit)
        DoseAlarmReceiver.quiet(this, alarmId);
        DoseAlarmStore.cancelQuiet(this, alarmId);
        finishAndRemoveTask();
    }

    @Override
    protected void onDestroy() {
        try { unregisterReceiver(finish); } catch (Exception ignored) {}
        super.onDestroy();
    }
}
