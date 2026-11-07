package de.dominikest.dosia;

import static org.junit.Assert.*;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import java.util.Arrays;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 28)
public class DoseAlarmReceiverTest {
    private Context context;
    private NotificationManager notifications;

    @Before
    public void setUp() {
        context = RuntimeEnvironment.getApplication();
        notifications = DoseAlarmReceiver.nm(context);
        notifications.cancelAll();
        DoseAlarmStore.prefs(context).edit().clear().commit();
    }

    private JSONObject alarm(int id, String med, String day, String time, boolean plain) throws Exception {
        return new JSONObject().put("id", id).put("plain", plain)
            .put("title", "Dosia").put("body", "Reminder")
            .put("at", System.currentTimeMillis() + 600000)
            .put("extra", new JSONObject().put("medId", med).put("key", day).put("time", time));
    }

    @Test
    public void repeatedFollowUpsLeaveOnlyLatestNotification() throws Exception {
        for (int id = 100; id <= 110; id++) {
            DoseAlarmReceiver.fire(context, alarm(id, "a", "2026-11-07", "08:00", true));
            assertEquals(1, notifications.getActiveNotifications().length);
            assertNotNull(DoseAlarmReceiver.activeAlarm(context, id));
        }
    }

    @Test
    public void nextReminderRemovesAlreadyAccumulatedNotifications() throws Exception {
        // Simulate notifications left by a previous app version.
        for (int id = 100; id < 110; id++) {
            DoseAlarmReceiver.show(context, alarm(id, "a", "2026-11-07", "08:00", true));
        }
        DoseAlarmReceiver.fire(context, alarm(110, "a", "2026-11-07", "08:00", true));
        assertEquals(1, notifications.getActiveNotifications().length);
        assertNotNull(DoseAlarmReceiver.activeAlarm(context, 110));
    }

    @Test
    public void differentDosesAndUnrelatedNotificationsRemainVisible() throws Exception {
        DoseAlarmReceiver.fire(context, alarm(100, "a", "2026-11-07", "08:00", true));
        DoseAlarmReceiver.fire(context, alarm(101, "b", "2026-11-07", "08:00", true));
        DoseAlarmReceiver.fire(context, alarm(102, "a", "2026-11-07", "12:00", true));
        DoseAlarmReceiver.fire(context, alarm(103, "a", "2026-11-08", "08:00", true));
        notifications.notify(104, new Notification.Builder(context, DoseAlarmStore.PLAIN_CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("Restock").build());
        DoseAlarmReceiver.fire(context, alarm(105, "a", "2026-11-07", "08:00", true));
        assertEquals(5, notifications.getActiveNotifications().length);
        assertNull(DoseAlarmReceiver.activeAlarm(context, 100));
        for (int id : new int[] {101, 102, 103, 105}) {
            assertNotNull(DoseAlarmReceiver.activeAlarm(context, id));
        }
    }

    @Test
    public void alarmFollowUpReplacesQuietAlarmWithoutRevivingIt() throws Exception {
        DoseAlarmReceiver.fire(context, alarm(100, "a", "2026-11-07", "08:00", false));
        DoseAlarmReceiver.quiet(context, 100);
        DoseAlarmReceiver.fire(context, alarm(101, "a", "2026-11-07", "08:00", false));
        // A late quiet broadcast for the old alarm must not restore its notification.
        DoseAlarmReceiver.quiet(context, 100);
        assertEquals(1, notifications.getActiveNotifications().length);
        assertNotNull(DoseAlarmReceiver.activeAlarm(context, 101));
    }

    @Test
    public void takingLatestReminderCancelsRemainingFollowUps() throws Exception {
        JSONObject first = alarm(100, "a", "2026-11-07", "08:00", true);
        JSONObject latest = alarm(101, "a", "2026-11-07", "08:00", true);
        JSONObject future = alarm(102, "a", "2026-11-07", "08:00", true);
        JSONObject other = alarm(103, "b", "2026-11-07", "08:00", true);
        DoseAlarmStore.replaceAll(context, Arrays.asList(future, other), new int[0]);
        DoseAlarmReceiver.fire(context, first);
        DoseAlarmReceiver.fire(context, latest);
        DoseAlarmReceiver.handleUser(context, latest, "take");
        assertEquals(0, notifications.getActiveNotifications().length);
        assertNull(DoseAlarmStore.find(context, 102));
        assertNotNull(DoseAlarmStore.find(context, 103));
        assertEquals("take", DoseAlarmStore.takeQueue(context).getJSONObject(0).getString("actionId"));
    }

    @Test
    public void snoozedReminderReplacesFollowUpAndKeepsActions() throws Exception {
        DoseAlarmReceiver.fire(context, alarm(100, "a", "2026-11-07", "08:00", true));
        JSONObject snoozed = alarm(101, "a", "2026-11-07", "08:00", true);
        DoseAlarmReceiver.fire(context, snoozed);
        DoseAlarmReceiver.handleUser(context, snoozed, "snooze");
        assertEquals(0, notifications.getActiveNotifications().length);
        assertNotNull(DoseAlarmStore.find(context, 101));
        assertEquals("snooze", DoseAlarmStore.takeQueue(context).getJSONObject(0).getString("actionId"));
        DoseAlarmReceiver.fire(context, DoseAlarmStore.find(context, 101));
        assertEquals(1, notifications.getActiveNotifications().length);
    }

    @Test
    public void remindersWithoutDoseMetadataDoNotRemoveEachOther() throws Exception {
        for (int id = 100; id < 102; id++) {
            JSONObject test = alarm(id, "a", "2026-11-07", "08:00", true);
            test.remove("extra");
            DoseAlarmReceiver.fire(context, test);
        }
        assertEquals(2, notifications.getActiveNotifications().length);
    }
}
