package com.regiaire.planning.constraints;

import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import ai.timefold.solver.core.api.score.stream.Constraint;
import ai.timefold.solver.core.api.score.stream.ConstraintFactory;
import ai.timefold.solver.core.api.score.stream.ConstraintProvider;
import ai.timefold.solver.core.api.score.stream.ConstraintCollectors;
import com.regiaire.planning.domain.Employee;
import com.regiaire.planning.domain.ShiftAssignment;

public class PlanningConstraintProvider implements ConstraintProvider {

    @Override
    public Constraint[] defineConstraints(ConstraintFactory constraintFactory) {
        return new Constraint[] {
            // Hard constraints
            everyShiftMustHaveMinimumEmployees(constraintFactory),
            everyShiftMustHaveMaximumEmployees(constraintFactory),
            everyEmployeeMustRespectContractHours(constraintFactory),
            everyEmployeeMustWorkMinimumDays(constraintFactory),
            
            // Soft constraints
            idealEmployeesPerShift(constraintFactory),
            preferredShifts(constraintFactory),
            balancedWorkload(constraintFactory)
        };
    }

    private Constraint everyShiftMustHaveMinimumEmployees(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> assignment.getEmployee() != null)
            .groupBy(ShiftAssignment::getShift, ConstraintCollectors.count())
            .filter((shift, count) -> {
                // Pour les shifts matin/après-midi, forcer minimum 2 employés
                // Pour la nuit, minimum 1
                int required = shift.getShiftType().equals("22-6") ? 1 : 2;
                return count < required;
            })
            .penalize(HardSoftScore.ONE_HARD,
                (shift, count) -> {
                    int required = shift.getShiftType().equals("22-6") ? 1 : 2;
                    return (int) (required - count);
                })
            .asConstraint("Minimum employees per shift");
    }

    private Constraint everyShiftMustHaveMaximumEmployees(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> assignment.getEmployee() != null)
            .groupBy(ShiftAssignment::getShift, ConstraintCollectors.count())
            .filter((shift, count) -> {
                // Pour les shifts matin/après-midi, maximum 2 employés
                // Pour la nuit, maximum 1
                int maxAllowed = shift.getShiftType().equals("22-6") ? 1 : 2;
                return count > maxAllowed;
            })
            .penalize(HardSoftScore.ONE_HARD,
                (shift, count) -> {
                    int maxAllowed = shift.getShiftType().equals("22-6") ? 1 : 2;
                    return (int) (count - maxAllowed);
                })
            .asConstraint("Maximum employees per shift");
    }

    private Constraint everyEmployeeMustRespectContractHours(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> assignment.getEmployee() != null)
            .groupBy(ShiftAssignment::getEmployee,
                ConstraintCollectors.sum(ShiftAssignment::getHours))
            .filter((employee, totalHours) -> {
                int expected = employee.getContractHoursPerMonth();
                // Tolérance réduite à 2 heures pour forcer le respect des heures contractuelles
                return Math.abs(totalHours - expected) > 2;
            })
            .penalize(HardSoftScore.ONE_HARD,
                (employee, totalHours) -> {
                    int expected = employee.getContractHoursPerMonth();
                    return (int) Math.abs(totalHours - expected) * 10; // Pénalité plus forte
                })
            .asConstraint("Contract hours");
    }

    private Constraint everyEmployeeMustWorkMinimumDays(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> assignment.getEmployee() != null)
            .groupBy(ShiftAssignment::getEmployee,
                ConstraintCollectors.countDistinct(assignment -> assignment.getShift().getDate()))
            .filter((employee, distinctDays) -> distinctDays < 4)
            .penalize(HardSoftScore.ONE_HARD,
                (employee, distinctDays) -> (int) (4 - distinctDays))
            .asConstraint("Minimum 4 days per week");
    }

    private Constraint idealEmployeesPerShift(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> assignment.getEmployee() != null)
            .groupBy(ShiftAssignment::getShift, ConstraintCollectors.count())
            .filter((shift, count) -> {
                // Pour les shifts matin/après-midi, idéal 2 employés
                // Pour la nuit, idéal 1
                int ideal = shift.getShiftType().equals("22-6") ? 1 : 2;
                return count != ideal;
            })
            .penalize(HardSoftScore.ONE_SOFT,
                (shift, count) -> {
                    int ideal = shift.getShiftType().equals("22-6") ? 1 : 2;
                    return (int) Math.abs(count - ideal);
                })
            .asConstraint("Ideal employees per shift");
    }

    private Constraint preferredShifts(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> {
                if (assignment.getEmployee() == null) return false;
                Employee emp = assignment.getEmployee();
                String shiftType = assignment.getShift().getShiftType();
                return emp.getPreferredShifts() != null &&
                       !emp.getPreferredShifts().isEmpty() &&
                       !emp.getPreferredShifts().contains(shiftType);
            })
            .penalize(HardSoftScore.ONE_SOFT, assignment -> 1)
            .asConstraint("Preferred shifts");
    }

    private Constraint balancedWorkload(ConstraintFactory constraintFactory) {
        return constraintFactory.forEach(ShiftAssignment.class)
            .filter(assignment -> assignment.getEmployee() != null)
            .groupBy(ShiftAssignment::getEmployee,
                ConstraintCollectors.sum(ShiftAssignment::getHours))
            .penalize(HardSoftScore.ONE_SOFT,
                (employee, totalHours) -> {
                    int expected = employee.getContractHoursPerMonth();
                    return Math.abs(totalHours - expected);
                })
            .asConstraint("Balanced workload");
    }
}
