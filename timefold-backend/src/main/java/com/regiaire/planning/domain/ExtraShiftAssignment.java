package com.regiaire.planning.domain;

import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.lookup.PlanningId;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;

/** Poste supplémentaire optionnel (2e personne sur matin/aprem). */
@PlanningEntity
public class ExtraShiftAssignment {
    @PlanningId
    private String id;
    private Shift shift;

    @PlanningVariable(nullable = true)
    private Employee employee;

    public ExtraShiftAssignment() {
    }

    public ExtraShiftAssignment(String id, Shift shift) {
        this.id = id;
        this.shift = shift;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public Shift getShift() { return shift; }
    public void setShift(Shift shift) { this.shift = shift; }
    public Employee getEmployee() { return employee; }
    public void setEmployee(Employee employee) { this.employee = employee; }

    public int getCountedMinutes() {
        if (shift == null) return 0;
        return ShiftAssignment.DAY_SHIFT_COUNTED_MINUTES;
    }

    public double getCountedHours() {
        return getCountedMinutes() / 60.0;
    }
}
