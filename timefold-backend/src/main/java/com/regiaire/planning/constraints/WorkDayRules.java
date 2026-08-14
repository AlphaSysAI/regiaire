package com.regiaire.planning.constraints;

import java.time.LocalDate;
import java.util.Collection;
import java.util.HashSet;
import java.util.Set;

/** Règles de jours travaillés / repos. */
public final class WorkDayRules {

    public static final int MAX_CONSECUTIVE_WORK_DAYS = 6;
    public static final int IDEAL_MAX_CONSECUTIVE_WORK_DAYS = 5;
    public static final int IDEAL_WORK_DAYS_PER_WEEK = 5;

    private WorkDayRules() {
    }

    /** True si ajouter {@code candidate} créerait plus de {@code maxConsecutive} jours d'affilée. */
    public static boolean wouldExceedConsecutive(
            Collection<LocalDate> workedDates,
            LocalDate candidate,
            int maxConsecutive) {
        if (workedDates != null && workedDates.contains(candidate)) {
            return false;
        }
        Set<LocalDate> dates = new HashSet<>();
        if (workedDates != null) {
            dates.addAll(workedDates);
        }
        dates.add(candidate);
        return longestConsecutiveRun(dates) > maxConsecutive;
    }

    public static int longestConsecutiveRun(Collection<LocalDate> dates) {
        if (dates == null || dates.isEmpty()) return 0;
        Set<LocalDate> set = dates instanceof Set ? (Set<LocalDate>) dates : new HashSet<>(dates);
        int max = 1;
        for (LocalDate date : set) {
            if (set.contains(date.minusDays(1))) continue;
            int run = 1;
            LocalDate cursor = date.plusDays(1);
            while (set.contains(cursor)) {
                run++;
                cursor = cursor.plusDays(1);
            }
            if (run > max) max = run;
        }
        return max;
    }

    /** Longueur de la série en cours se terminant la veille de {@code candidate}. */
    public static int currentStreakEndingBefore(Collection<LocalDate> workedDates, LocalDate candidate) {
        if (workedDates == null || workedDates.isEmpty()) return 0;
        int streak = 0;
        LocalDate cursor = candidate.minusDays(1);
        while (workedDates.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }
}
