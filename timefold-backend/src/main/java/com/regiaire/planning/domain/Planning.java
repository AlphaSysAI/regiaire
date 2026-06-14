package com.regiaire.planning.domain;

import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import java.util.List;

@PlanningSolution
public class Planning {
    @ValueRangeProvider
    private List<Employee> employees;
    
    @PlanningEntityCollectionProperty
    private List<ShiftAssignment> shiftAssignments;
    
    @PlanningScore
    private HardSoftScore score;

    public Planning() {
    }

    public Planning(List<Employee> employees, List<ShiftAssignment> shiftAssignments) {
        this.employees = employees;
        this.shiftAssignments = shiftAssignments;
    }

    public List<Employee> getEmployees() { return employees; }
    public void setEmployees(List<Employee> employees) { this.employees = employees; }
    public List<ShiftAssignment> getShiftAssignments() { return shiftAssignments; }
    public void setShiftAssignments(List<ShiftAssignment> shiftAssignments) { this.shiftAssignments = shiftAssignments; }
    public HardSoftScore getScore() { return score; }
    public void setScore(HardSoftScore score) { this.score = score; }
}

