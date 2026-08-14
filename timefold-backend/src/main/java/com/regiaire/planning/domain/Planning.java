package com.regiaire.planning.domain;

import ai.timefold.solver.core.api.domain.solution.ProblemFactCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningEntityCollectionProperty;
import ai.timefold.solver.core.api.domain.solution.PlanningScore;
import ai.timefold.solver.core.api.domain.solution.PlanningSolution;
import ai.timefold.solver.core.api.domain.valuerange.ValueRangeProvider;
import ai.timefold.solver.core.api.score.buildin.hardsoft.HardSoftScore;
import java.util.ArrayList;
import java.util.List;

@PlanningSolution
public class Planning {
    @ProblemFactCollectionProperty
    @ValueRangeProvider
    private List<Employee> employees;

    @PlanningEntityCollectionProperty
    private List<ShiftAssignment> shiftAssignments;

    @PlanningEntityCollectionProperty
    private List<ExtraShiftAssignment> extraShiftAssignments;

    @PlanningScore
    private HardSoftScore score;

    public Planning() {
        shiftAssignments = new ArrayList<>();
        extraShiftAssignments = new ArrayList<>();
    }

    public Planning(List<Employee> employees, List<ShiftAssignment> shiftAssignments,
                    List<ExtraShiftAssignment> extraShiftAssignments) {
        this.employees = employees;
        this.shiftAssignments = shiftAssignments;
        this.extraShiftAssignments = extraShiftAssignments;
    }

    public List<Employee> getEmployees() { return employees; }
    public void setEmployees(List<Employee> employees) { this.employees = employees; }
    public List<ShiftAssignment> getShiftAssignments() { return shiftAssignments; }
    public void setShiftAssignments(List<ShiftAssignment> shiftAssignments) { this.shiftAssignments = shiftAssignments; }
    public List<ExtraShiftAssignment> getExtraShiftAssignments() { return extraShiftAssignments; }
    public void setExtraShiftAssignments(List<ExtraShiftAssignment> extraShiftAssignments) { this.extraShiftAssignments = extraShiftAssignments; }
    public HardSoftScore getScore() { return score; }
    public void setScore(HardSoftScore score) { this.score = score; }
}

