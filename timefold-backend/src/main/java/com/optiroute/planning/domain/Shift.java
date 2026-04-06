package com.optiroute.planning.domain;

import ai.timefold.solver.core.api.domain.lookup.PlanningId;
import java.time.LocalDate;
import java.time.LocalTime;

public class Shift {
    @PlanningId
    private String id;
    private LocalDate date;
    private String shiftType;
    private LocalTime startTime;
    private LocalTime endTime;
    private int minEmployees;
    private int idealEmployees;
    private int maxEmployees;

    public Shift() {
    }

    public Shift(String id, LocalDate date, String shiftType, LocalTime startTime, LocalTime endTime) {
        this.id = id;
        this.date = date;
        this.shiftType = shiftType;
        this.startTime = startTime;
        this.endTime = endTime;
        // Pour les shifts matin et après-midi, minimum 1 mais idéal 2
        // Pour la nuit, strictement 1
        if (shiftType.equals("22-6")) {
            this.minEmployees = 1;
            this.idealEmployees = 1;
            this.maxEmployees = 1;
        } else {
            this.minEmployees = 1; // Minimum 1, mais on va forcer 2 via les contraintes
            this.idealEmployees = 2;
            this.maxEmployees = 2;
        }
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public LocalDate getDate() { return date; }
    public void setDate(LocalDate date) { this.date = date; }
    public String getShiftType() { return shiftType; }
    public void setShiftType(String shiftType) { this.shiftType = shiftType; }
    public LocalTime getStartTime() { return startTime; }
    public void setStartTime(LocalTime startTime) { this.startTime = startTime; }
    public LocalTime getEndTime() { return endTime; }
    public void setEndTime(LocalTime endTime) { this.endTime = endTime; }
    public int getMinEmployees() { return minEmployees; }
    public void setMinEmployees(int minEmployees) { this.minEmployees = minEmployees; }
    public int getIdealEmployees() { return idealEmployees; }
    public void setIdealEmployees(int idealEmployees) { this.idealEmployees = idealEmployees; }
    public int getMaxEmployees() { return maxEmployees; }
    public void setMaxEmployees(int maxEmployees) { this.maxEmployees = maxEmployees; }
}
