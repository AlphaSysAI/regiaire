package com.regiaire.planning.constraints;

import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;
import ai.timefold.solver.core.api.score.stream.ConstraintCollectors;
import ai.timefold.solver.core.api.score.stream.Joiners;
import ai.timefold.solver.core.api.score.stream.uni.UniConstraintStream;
import com.regiaire.planning.domain.Employee;
import com.regiaire.planning.domain.EmployeeProfile;
import com.regiaire.planning.domain.ExtraShiftAssignment;
import com.regiaire.planning.domain.Shift;
import com.regiaire.planning.domain.ShiftAssignment;

import java.time.DayOfWeek;
import java.time.temporal.TemporalAdjusters;
import java.util.function.Function;

public class PlanningConstraintProvider implements ConstraintProvider {

    private static final int CONTRACT_TOLERANCE_MINUTES = ShiftAssignment.DAY_SHIFT_COUNTED_MINUTES;

    @Override
    public Constraint[] defineConstraints(ConstraintFactory constraintFactory) {
        return new Constraint[] {
            everyRequiredShiftMustBeAssigned(constraintFactory),
            maximumTwoEmployeesPerShift(constraintFactory),
            everyEmployeeMustWork(constraintFactory),
            employeeMustMeetContractHours(constraintFactory),
            employeeMustNotExceedMaxShifts(constraintFactory),
            employeeMustNotWorkTwoShiftsSameDay(constraintFactory),
            noRequiredAndExtraSameDay(constraintFactory),
            minimumRestBetweenShifts(constraintFactory),
            minimumRestBetweenRequiredAndExtra(constraintFactory),
            maxSixConsecutiveWorkDays(constraintFactory),
            dayWorkersCannotWorkNight(constraintFactory),
            nightShiftsOnlyForNightTeam(constraintFactory),
            noMorningForNightTeam(constraintFactory),
            strictNightWorkerNoAfternoon(constraintFactory),
            noAfternoonOnNightRecoveryDay(constraintFactory),
            preferFiveDayWorkWeek(constraintFactory),
            preferMaxFiveConsecutiveWorkDays(constraintFactory),
            preferConsecutiveRestDays(constraintFactory),
            preferredShifts(constraintFactory),
            preferSecondEmployeeOnDayShifts(constraintFactory),
            extraShiftsLimitedPerEmployee(constraintFactory),
            nightShiftsAssignedToNightTeam(constraintFactory),
            balanceNightShiftsBetweenNightWorkers(constraintFactory),
        };
    }

    private Constraint everyRequiredShiftMustBeAssigned(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() == null)
            .penalize(HardSoftScore.ONE_HARD, a -> 1)
            .asConstraint("Required shift must be assigned");
    }

    /** Max 2 employés par quart (1 requis + 1 extra optionnel). */
    private Constraint maximumTwoEmployeesPerShift(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .join(ExtraShiftAssignment.class, Joiners.equal(ShiftAssignment::getShift, ExtraShiftAssignment::getShift))
            .filter((required, extra) -> extra.getEmployee() != null
                && required.getEmployee().equals(extra.getEmployee()))
            .penalize(HardSoftScore.ONE_HARD, (required, extra) -> 1)
            .asConstraint("Same employee twice on one shift");
    }

    private Constraint everyEmployeeMustWork(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(Employee.class)
            .ifNotExists(ShiftAssignment.class,
                Joiners.equal(Function.identity(), ShiftAssignment::getEmployee))
            .ifNotExists(ExtraShiftAssignment.class,
                Joiners.equal(Function.identity(), ExtraShiftAssignment::getEmployee))
            .penalize(HardSoftScore.ONE_HARD, employee -> 100)
            .asConstraint("Every employee must work");
    }

    /** Heures contractuelles obligatoires (± 7 h 30) sur les quarts requis. */
    private Constraint employeeMustMeetContractHours(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .groupBy(ShiftAssignment::getEmployee,
                ConstraintCollectors.sum(ShiftAssignment::getCountedMinutes))
            .filter((employee, totalMinutes) ->
                contractDeviationMinutes(employee, totalMinutes) > CONTRACT_TOLERANCE_MINUTES)
            .penalize(HardSoftScore.ONE_HARD,
                (employee, totalMinutes) -> contractDeviationMinutes(employee, totalMinutes) / 60)
            .asConstraint("Contract hours mandatory");
    }

    private static int contractDeviationMinutes(Employee employee, int totalMinutes) {
        int target = employee.getContractHoursPerMonth() * 60;
        return Math.abs(totalMinutes - target);
    }

    /** Limite le nombre de quarts principaux selon le contrat (7,5 h ou 8 h). */
    private Constraint employeeMustNotExceedMaxShifts(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .groupBy(ShiftAssignment::getEmployee, ConstraintCollectors.count())
            .filter((employee, count) -> count > maxAllowedShifts(employee))
            .penalize(HardSoftScore.ONE_HARD, (employee, count) -> count - maxAllowedShifts(employee))
            .asConstraint("Max shifts per employee");
    }

    private static int maxAllowedShifts(Employee employee) {
        int hours = employee.getContractHoursPerMonth();
        if (employee.isNightTeam()) {
            return (int) Math.ceil(hours / 8.0) + 1;
        }
        return (int) Math.ceil(hours / 7.5) + 1;
    }

    private Constraint employeeMustNotWorkTwoShiftsSameDay(ConstraintFactory constraintFactory) {
        return constraintFactory.forEachUniquePair(ShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee),
                Joiners.equal(a -> a.getShift().getDate()))
            .filter((a, b) -> a.getEmployee() != null)
            .penalize(HardSoftScore.ONE_HARD, (a, b) -> 1)
            .asConstraint("No double required shift same day");
    }

    private Constraint noRequiredAndExtraSameDay(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .join(ExtraShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee, ExtraShiftAssignment::getEmployee),
                Joiners.equal(a -> a.getShift().getDate(), e -> e.getShift().getDate()))
            .filter((required, extra) -> extra.getEmployee() != null)
            .penalize(HardSoftScore.ONE_HARD, (required, extra) -> 1)
            .asConstraint("No required and extra shift same day");
    }

    private Constraint minimumRestBetweenShifts(ConstraintFactory constraintFactory) {
        return constraintFactory.forEachUniquePair(ShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee))
            .filter((a, b) -> a.getEmployee() != null
                && violatesRestBetween(a.getShift(), b.getShift()))
            .penalize(HardSoftScore.ONE_HARD, (a, b) -> 1)
            .asConstraint("Minimum 11h rest between required shifts");
    }

    private Constraint minimumRestBetweenRequiredAndExtra(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .join(ExtraShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee, ExtraShiftAssignment::getEmployee))
            .filter((required, extra) -> extra.getEmployee() != null
                && violatesRestBetween(required.getShift(), extra.getShift()))
            .penalize(HardSoftScore.ONE_HARD, (required, extra) -> 1)
            .asConstraint("Minimum 11h rest between required and extra");
    }

    /** Dur : jamais plus de 6 jours travaillés d'affilée. */
    private Constraint maxSixConsecutiveWorkDays(ConstraintFactory constraintFactory) {
        return consecutiveWorkDaysFrom(constraintFactory, WorkDayRules.MAX_CONSECUTIVE_WORK_DAYS)
            .penalize(HardSoftScore.ONE_HARD, a -> 10)
            .asConstraint("Max 6 consecutive work days");
    }

    /** Soft : idéalement max 5 jours d'affilée. */
    private Constraint preferMaxFiveConsecutiveWorkDays(ConstraintFactory constraintFactory) {
        return consecutiveWorkDaysFrom(constraintFactory, WorkDayRules.IDEAL_MAX_CONSECUTIVE_WORK_DAYS)
            .penalize(HardSoftScore.ONE_SOFT, a -> 8)
            .asConstraint("Prefer max 5 consecutive work days");
    }

    /**
     * Détecte une série de {@code maxAllowed + 1} jours travaillés consécutifs
     * (présence d'un quart sur J, J+1, …, J+maxAllowed).
     */
    private UniConstraintStream<ShiftAssignment> consecutiveWorkDaysFrom(
            ConstraintFactory constraintFactory, int maxAllowed) {
        UniConstraintStream<ShiftAssignment> stream = constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null);
        for (int offset = 1; offset <= maxAllowed; offset++) {
            final int dayOffset = offset;
            stream = stream.ifExists(ShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee),
                Joiners.equal(
                    a -> a.getShift().getDate().plusDays(dayOffset),
                    b -> b.getShift().getDate()));
        }
        return stream;
    }

    /** Soft : idéalement ≤ 5 jours travaillés par semaine civile (lun–dim). */
    private Constraint preferFiveDayWorkWeek(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .groupBy(
                ShiftAssignment::getEmployee,
                a -> a.getShift().getDate().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)),
                ConstraintCollectors.count())
            .filter((employee, weekStart, workDays) -> workDays > WorkDayRules.IDEAL_WORK_DAYS_PER_WEEK)
            .penalize(HardSoftScore.ONE_SOFT,
                (employee, weekStart, workDays) -> (workDays - WorkDayRules.IDEAL_WORK_DAYS_PER_WEEK) * 12)
            .asConstraint("Prefer 5 work days and 2 rest days per week");
    }

    /** Soft : éviter les jours de repos isolés (travail / repos / travail). */
    private Constraint preferConsecutiveRestDays(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .join(ShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee),
                Joiners.equal(a -> a.getShift().getDate().plusDays(2), b -> b.getShift().getDate()))
            .ifNotExists(ShiftAssignment.class,
                Joiners.equal((a, b) -> a.getEmployee(), ShiftAssignment::getEmployee),
                Joiners.equal((a, b) -> a.getShift().getDate().plusDays(1), mid -> mid.getShift().getDate()))
            .penalize(HardSoftScore.ONE_SOFT, (a, b) -> 6)
            .asConstraint("Prefer consecutive rest days");
    }

    private Constraint dayWorkersCannotWorkNight(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null
                && a.getEmployee().isDayWorker()
                && ShiftTiming.isNightShift(a.getShift()))
            .penalize(HardSoftScore.ONE_HARD, a -> 1)
            .asConstraint("Day workers cannot work night");
    }

    private Constraint nightShiftsOnlyForNightTeam(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null
                && ShiftTiming.isNightShift(a.getShift())
                && !a.getEmployee().isNightTeam())
            .penalize(HardSoftScore.ONE_HARD, a -> 1)
            .asConstraint("Night shifts only for night team");
    }

    private Constraint noMorningForNightTeam(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null
                && a.getEmployee().isNightTeam()
                && "6-14".equals(a.getShift().getShiftType()))
            .penalize(HardSoftScore.ONE_HARD, a -> 1)
            .asConstraint("No morning for night team");
    }

    private Constraint strictNightWorkerNoAfternoon(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> {
                if (a.getEmployee() == null) return false;
                if (!EmployeeProfile.NUIT.equals(a.getEmployee().resolvedProfil())) return false;
                return "14-22".equals(a.getShift().getShiftType());
            })
            .penalize(HardSoftScore.ONE_HARD, a -> 1)
            .asConstraint("Strict night worker no afternoon");
    }

    private Constraint noAfternoonOnNightRecoveryDay(ConstraintFactory constraintFactory) {
        return constraintFactory.forEachUniquePair(ShiftAssignment.class,
                Joiners.equal(ShiftAssignment::getEmployee))
            .filter((a, b) -> {
                if (a.getEmployee() == null) return false;
                Shift night = a.getShift();
                Shift next = b.getShift();
                if (!ShiftTiming.isNightShift(night)) return false;
                if (!"14-22".equals(next.getShiftType())) return false;
                return ShiftTiming.nightRecoveryDay(night).equals(next.getDate());
            })
            .penalize(HardSoftScore.ONE_HARD, (a, b) -> 1)
            .asConstraint("No afternoon on night recovery day");
    }

    private static boolean violatesRestBetween(Shift first, Shift second) {
        return ShiftTiming.violatesMinimumRest(first, second)
            || ShiftTiming.violatesMinimumRest(second, first);
    }

    private Constraint preferredShifts(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> {
                if (a.getEmployee() == null) return false;
                Employee emp = a.getEmployee();
                String shiftType = a.getShift().getShiftType();
                return emp.getPreferredShifts() != null &&
                       !emp.getPreferredShifts().isEmpty() &&
                       !emp.getPreferredShifts().contains(shiftType);
            })
            .penalize(HardSoftScore.ONE_SOFT, a -> 1)
            .asConstraint("Preferred shifts");
    }

    private Constraint preferSecondEmployeeOnDayShifts(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ExtraShiftAssignment.class)
            .filter(a -> ShiftTiming.isDayShift(a.getShift()) && a.getEmployee() == null)
            .penalize(HardSoftScore.ONE_SOFT, a -> 1)
            .asConstraint("Prefer second employee on day shifts");
    }

    /** Répartir les quarts extra : plafond strict par employé. */
    private Constraint extraShiftsLimitedPerEmployee(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ExtraShiftAssignment.class)
            .filter(a -> a.getEmployee() != null)
            .groupBy(ExtraShiftAssignment::getEmployee, ConstraintCollectors.count())
            .filter((employee, count) -> count > 2)
            .penalize(HardSoftScore.ONE_HARD, (employee, count) -> count - 2)
            .asConstraint("Limit extra shifts per employee");
    }

    private Constraint nightShiftsAssignedToNightTeam(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null
                && ShiftTiming.isNightShift(a.getShift())
                && a.getEmployee().isNightTeam())
            .reward(HardSoftScore.ONE_SOFT, a -> 1)
            .asConstraint("Night shifts to night team");
    }

    private Constraint balanceNightShiftsBetweenNightWorkers(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(a -> a.getEmployee() != null
                && a.getEmployee().isNightTeam()
                && ShiftTiming.isNightShift(a.getShift()))
            .groupBy(ShiftAssignment::getEmployee, ConstraintCollectors.count())
            .penalize(HardSoftScore.ONE_SOFT, (employee, count) -> count * count)
            .asConstraint("Balance night shifts between night team");
    }
}
