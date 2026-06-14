package com.regiaire.planning.domain;

import ai.timefold.solver.core.api.domain.entity.PlanningEntity;
import ai.timefold.solver.core.api.domain.lookup.PlanningId;
import ai.timefold.solver.core.api.domain.variable.PlanningVariable;
import java.time.LocalTime;

@PlanningEntity
public class ShiftAssignment {
    @PlanningId
    private String id;
    private Shift shift;
    
    @PlanningVariable
    private Employee employee;
    
    private int hours;

    public ShiftAssignment() {
    }

    public ShiftAssignment(String id, Shift shift) {
        this.id = id;
        this.shift = shift;
        this.hours = calculateHours();
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public Shift getShift() { return shift; }
    public void setShift(Shift shift) { 
        this.shift = shift;
        this.hours = calculateHours();
    }
    public Employee getEmployee() { return employee; }
    public void setEmployee(Employee employee) { this.employee = employee; }
    public int getHours() { 
        if (hours == 0 && shift != null) {
            return calculateHours();
        }
        return hours; 
    }
    public void setHours(int hours) { this.hours = hours; }
    
    private int calculateHours() {
        if (shift == null) return 0;
        if (shift.getShiftType().equals("22-6")) return 8;
        
        LocalTime start = shift.getStartTime();
        LocalTime end = shift.getEndTime();
        int startMinutes = start.getHour() * 60 + start.getMinute();
        int endMinutes = end.getHour() * 60 + end.getMinute();
        if (endMinutes < startMinutes) endMinutes += 24 * 60;
        return (endMinutes - startMinutes) / 60;
    }
}
