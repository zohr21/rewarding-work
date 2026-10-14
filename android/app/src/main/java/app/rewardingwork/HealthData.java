package app.rewardingwork;

import android.content.Context;
import android.health.connect.AggregateRecordsGroupedByPeriodResponse;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.LocalTimeRangeFilter;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.DistanceRecord;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.TotalCaloriesBurnedRecord;
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
import java.util.function.Function;

/**
 * Reads daily totals from Health Connect for the Health page (DevicePlugin.healthRead):
 * sleep, steps, exercise, resting heart rate, calories burned and distance. Read only; nothing is ever written.
 * Uses the Health Connect that is part of Android 14 and later.
 */
@RequiresApi(34)
final class HealthData {
    static final String SLEEP = "sleep";
    static final String STEPS = "steps";
    static final String EXERCISE = "exercise";
    static final String HEART = "heart";
    static final String CALORIES = "calories";
    static final String ACTIVE_CALORIES = "activeCalories";
    static final String DISTANCE = "distance";

    /** A night belongs to the day you woke up on, so sleep is counted from 18:00 to 18:00. */
    private static final int NIGHT_STARTS = 18;
    private static final long MINUTE = 60_000;
    private static final Function<Long, Object> COUNT = n -> n;
    private static final Function<Long, Object> MINUTES = ms -> ms / MINUTE;

    private HealthData() {}

    /**
     * One object per day for the last `days` days, oldest first: `day` ("2026-10-13") and,
     * where Health Connect has something, `sleepMin`, `steps`, `activeMin`, `restingHr`,
     * `totalKcal`, `activeKcal` and `distanceM` (metres).
     * Only the `kinds` the user allowed are asked for. Beside `days` comes `failed`: the fields
     * Health Connect would not answer for (it only answers while the app is on screen), each with why.
     */
    static void read(Context context, int days, List<String> kinds, Consumer<JSObject> done) {
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
        JSObject failed = new JSObject();
        int[] waiting = { kinds.size() };
        Runnable finished = () -> {
            if (--waiting[0] > 0) return;
            JSArray list = new JSArray();
            for (JSObject entry : byDay.values()) list.put(entry);
            JSObject result = new JSObject();
            result.put("days", list);
            result.put("failed", failed);
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
                    totals(manager, main, SleepSessionRecord.SLEEP_DURATION_TOTAL, first.minusDays(1).atTime(NIGHT_STARTS, 0), end.isBefore(now) ? end : now, 1, "sleepMin", MINUTES, byDay, failed, finished);
                    break;
                }
                case STEPS:
                    totals(manager, main, StepsRecord.STEPS_COUNT_TOTAL, midnight, now, 0, "steps", COUNT, byDay, failed, finished);
                    break;
                case EXERCISE:
                    totals(manager, main, ExerciseSessionRecord.EXERCISE_DURATION_TOTAL, midnight, now, 0, "activeMin", MINUTES, byDay, failed, finished);
                    break;
                case HEART:
                    totals(manager, main, RestingHeartRateRecord.BPM_AVG, midnight, now, 0, "restingHr", COUNT, byDay, failed, finished);
                    break;
                case CALORIES:
                    // Health Connect fills in the resting part from the body's basal rate where no app recorded a total.
                    totals(manager, main, TotalCaloriesBurnedRecord.ENERGY_TOTAL, midnight, now, 0, "totalKcal", e -> Math.round(e.getInCalories() / 1000), byDay, failed, finished);
                    break;
                case ACTIVE_CALORIES:
                    totals(manager, main, ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL, midnight, now, 0, "activeKcal", e -> Math.round(e.getInCalories() / 1000), byDay, failed, finished);
                    break;
                case DISTANCE:
                    totals(manager, main, DistanceRecord.DISTANCE_TOTAL, midnight, now, 0, "distanceM", l -> Math.round(l.getInMeters()), byDay, failed, finished);
                    break;
                default:
                    finished.run();
            }
        }
    }

    /** One number per day between `start` and `end`, put on the day `shiftDays` after each one starts. */
    private static <T> void totals(
        HealthConnectManager manager,
        Executor executor,
        AggregationType<T> type,
        LocalDateTime start,
        LocalDateTime end,
        int shiftDays,
        String field,
        Function<T, Object> number,
        Map<String, JSObject> byDay,
        JSObject failed,
        Runnable finished
    ) {
        AggregateRecordsRequest<T> request = new AggregateRecordsRequest.Builder<T>(
            new LocalTimeRangeFilter.Builder().setStartTime(start).setEndTime(end).build()
        )
            .addAggregationType(type)
            .build();
        try {
            manager.aggregateGroupByPeriod(
                request,
                Period.ofDays(1),
                executor,
                new OutcomeReceiver<List<AggregateRecordsGroupedByPeriodResponse<T>>, HealthConnectException>() {
                    @Override
                    public void onResult(List<AggregateRecordsGroupedByPeriodResponse<T>> groups) {
                        for (AggregateRecordsGroupedByPeriodResponse<T> group : groups) {
                            T value = group.get(type);
                            if (value == null) continue;
                            JSObject entry = byDay.get(group.getStartTime().toLocalDate().plusDays(shiftDays).toString());
                            if (entry != null) entry.put(field, number.apply(value));
                        }
                        finished.run();
                    }

                    @Override
                    public void onError(@NonNull HealthConnectException e) {
                        failed.put(field, e.getErrorCode() + ": " + e.getMessage());
                        finished.run();
                    }
                }
            );
        } catch (RuntimeException e) {
            // Permission taken away between the check and the read: that kind is left out.
            failed.put(field, String.valueOf(e.getMessage()));
            finished.run();
        }
    }
}
