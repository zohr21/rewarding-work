package app.rewardingwork;

import android.content.Context;
import android.health.connect.AggregateRecordsGroupedByPeriodResponse;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.LocalTimeRangeFilter;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.os.OutcomeReceiver;

import androidx.annotation.NonNull;
import androidx.annotation.RequiresApi;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Period;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.Executor;
import java.util.function.Consumer;

/**
 * Reads daily totals from Health Connect for the Health page (DevicePlugin.healthRead):
 * sleep, steps, exercise and resting heart rate. Read only; nothing is ever written.
 * Uses the Health Connect that is part of Android 14 and later.
 */
@RequiresApi(34)
final class HealthData {
    static final String SLEEP = "sleep";
    static final String STEPS = "steps";
    static final String EXERCISE = "exercise";
    static final String HEART = "heart";

    /** A night belongs to the day you woke up on, so sleep is counted from 18:00 to 18:00. */
    private static final int NIGHT_STARTS = 18;
    private static final long MINUTE = 60_000;

    private HealthData() {}

    /**
     * One object per day for the last `days` days, oldest first: `day` ("2026-10-13") and,
     * where Health Connect has something, `sleepMin`, `steps`, `activeMin`, `restingHr`.
     * Only the `kinds` the user allowed are asked for.
     */
    static void read(Context context, int days, List<String> kinds, Consumer<JSArray> done) {
        HealthConnectManager manager = context.getSystemService(HealthConnectManager.class);
        LocalDate today = LocalDate.now();
        LocalDate first = today.minusDays(days - 1);
        LocalDateTime now = LocalDateTime.now();

        Map<String, JSObject> byDay = new TreeMap<>();
        for (int i = 0; i < days; i++) {
            String day = first.plusDays(i).toString();
            JSObject entry = new JSObject();
            entry.put("day", day);
            byDay.put(day, entry);
        }

        // Answers come back on the main thread, one per kind; the last one hands over the days.
        int[] waiting = { kinds.size() };
        Runnable finished = () -> {
            if (--waiting[0] > 0) return;
            JSArray result = new JSArray();
            for (JSObject entry : byDay.values()) result.put(entry);
            done.accept(result);
        };
        if (manager == null || kinds.isEmpty()) {
            waiting[0] = 1;
            finished.run();
            return;
        }

        Executor main = context.getMainExecutor();
        LocalDateTime midnight = first.atStartOfDay();
        for (String kind : kinds) {
            switch (kind) {
                case SLEEP: {
                    LocalDateTime end = today.atTime(NIGHT_STARTS, 0);
                    totals(manager, main, SleepSessionRecord.SLEEP_DURATION_TOTAL, first.minusDays(1).atTime(NIGHT_STARTS, 0), end.isBefore(now) ? end : now, 1, "sleepMin", MINUTE, byDay, finished);
                    break;
                }
                case STEPS:
                    totals(manager, main, StepsRecord.STEPS_COUNT_TOTAL, midnight, now, 0, "steps", 1, byDay, finished);
                    break;
                case EXERCISE:
                    totals(manager, main, ExerciseSessionRecord.EXERCISE_DURATION_TOTAL, midnight, now, 0, "activeMin", MINUTE, byDay, finished);
                    break;
                case HEART:
                    totals(manager, main, RestingHeartRateRecord.BPM_AVG, midnight, now, 0, "restingHr", 1, byDay, finished);
                    break;
                default:
                    finished.run();
            }
        }
    }

    /** One number per day between `start` and `end`, put on the day `shiftDays` after each one starts. */
    private static void totals(
        HealthConnectManager manager,
        Executor executor,
        AggregationType<Long> type,
        LocalDateTime start,
        LocalDateTime end,
        int shiftDays,
        String field,
        long unit,
        Map<String, JSObject> byDay,
        Runnable finished
    ) {
        AggregateRecordsRequest<Long> request = new AggregateRecordsRequest.Builder<Long>(
            new LocalTimeRangeFilter.Builder().setStartTime(start).setEndTime(end).build()
        )
            .addAggregationType(type)
            .build();
        try {
            manager.aggregateGroupByPeriod(
                request,
                Period.ofDays(1),
                executor,
                new OutcomeReceiver<List<AggregateRecordsGroupedByPeriodResponse<Long>>, HealthConnectException>() {
                    @Override
                    public void onResult(List<AggregateRecordsGroupedByPeriodResponse<Long>> groups) {
                        for (AggregateRecordsGroupedByPeriodResponse<Long> group : groups) {
                            Long value = group.get(type);
                            if (value == null) continue;
                            JSObject entry = byDay.get(group.getStartTime().toLocalDate().plusDays(shiftDays).toString());
                            if (entry != null) entry.put(field, value / unit);
                        }
                        finished.run();
                    }

                    @Override
                    public void onError(@NonNull HealthConnectException e) {
                        finished.run();
                    }
                }
            );
        } catch (RuntimeException e) {
            // Permission taken away between the check and the read: that kind is left out.
            finished.run();
        }
    }
}
