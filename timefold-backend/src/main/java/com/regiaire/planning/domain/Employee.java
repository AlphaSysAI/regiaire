package com.regiaire.planning.domain;

import ai.timefold.solver.core.api.domain.lookup.PlanningId;
import java.util.List;

public class Employee {
    @PlanningId
    private String id;
    private String name;
    private int contractHoursPerWeek;
    private int contractHoursPerMonth;
    private List<String> preferredShifts;
    private String mandatoryShift;
    /** jour | nuit | nuit_aprem */
    private String profilEquipe;

    public Employee() {
    }

    public Employee(String id, String name, int contractHoursPerWeek, int contractHoursPerMonth) {
        this.id = id;
        this.name = name;
        this.contractHoursPerWeek = contractHoursPerWeek;
        this.contractHoursPerMonth = contractHoursPerMonth;
        this.profilEquipe = EmployeeProfile.JOUR;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public int getContractHoursPerWeek() { return contractHoursPerWeek; }
    public void setContractHoursPerWeek(int contractHoursPerWeek) { this.contractHoursPerWeek = contractHoursPerWeek; }
    public int getContractHoursPerMonth() { return contractHoursPerMonth; }
    public void setContractHoursPerMonth(int contractHoursPerMonth) { this.contractHoursPerMonth = contractHoursPerMonth; }
    public List<String> getPreferredShifts() { return preferredShifts; }
    public void setPreferredShifts(List<String> preferredShifts) { this.preferredShifts = preferredShifts; }
    public String getMandatoryShift() { return mandatoryShift; }
    public void setMandatoryShift(String mandatoryShift) { this.mandatoryShift = mandatoryShift; }
    public String getProfilEquipe() { return profilEquipe; }
    public void setProfilEquipe(String profilEquipe) { this.profilEquipe = profilEquipe; }

    public String resolvedProfil() {
        return EmployeeProfile.resolve(profilEquipe, mandatoryShift);
    }

    public boolean isNightTeam() {
        return EmployeeProfile.isNightTeam(resolvedProfil());
    }

    public boolean isDayWorker() {
        return EmployeeProfile.isDayWorker(resolvedProfil());
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Employee other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return id != null ? id.hashCode() : 0;
    }
}
