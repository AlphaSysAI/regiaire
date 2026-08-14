package com.regiaire.planning.constraints;

import com.regiaire.planning.domain.Shift;
import java.time.Duration;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public final class ShiftTiming {

    public static final int MIN_REST_MINUTES = 11 * 60;

    private ShiftTiming() {
    }

    public static LocalDateTime getStart(Shift shift) {
        return LocalDateTime.of(shift.getDate(), shift.getStartTime());
    }

    public static LocalDateTime getEnd(Shift shift) {
        LocalTime end = shift.getEndTime();
        LocalTime start = shift.getStartTime();
        if (end.isBefore(start)) {
            return LocalDateTime.of(shift.getDate().plusDays(1), end);
        }
        return LocalDateTime.of(shift.getDate(), end);
    }

    public static long restMinutesBetween(Shift earlier, Shift later) {
        LocalDateTime end = getEnd(earlier);
        LocalDateTime start = getStart(later);
        if (!end.isBefore(start)) {
            return Long.MAX_VALUE;
        }
        return Duration.between(end, start).toMinutes();
    }

    public static boolean violatesMinimumRest(Shift earlier, Shift later) {
        return restMinutesBetween(earlier, later) < MIN_REST_MINUTES;
    }

    /** Jour calendaire où se termine la nuit (typiquement le lendemain du début). */
    public static LocalDate nightRecoveryDay(Shift nightShift) {
        return getEnd(nightShift).toLocalDate();
    }

    public static boolean isNightShift(Shift shift) {
        return "22-6".equals(shift.getShiftType());
    }

    public static boolean isDayShift(Shift shift) {
        String type = shift.getShiftType();
        return "6-14".equals(type) || "14-22".equals(type);
    }
}
