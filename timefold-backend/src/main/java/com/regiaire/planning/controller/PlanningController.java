package com.regiaire.planning.controller;

import com.regiaire.planning.constraints.ShiftTiming;
import com.regiaire.planning.constraints.WorkDayRules;
import com.regiaire.planning.domain.*;
import com.regiaire.planning.service.PlanningService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api/planning")
@CrossOrigin(origins = "*")
public class PlanningController {

    @Autowired
    private PlanningService planningService;

    @PostMapping("/solve")
    public ResponseEntity<PlanningResponse> solve(@RequestBody PlanningRequest request) {
        try {
            System.out.println("=== Timefold Planning Request ===");
            System.out.println("Employees: " + (request.getEmployees() != null ? request.getEmployees().size() : 0));
            if (request.getEmployees() != null) {
                for (var emp : request.getEmployees()) {
                    System.out.println("  - " + emp.getName() + " (" + emp.getContractHoursPerMonth() + "h/mois)");
                }
            }
            System.out.println("Period: " + request.getPeriod().getStart() + " to " + request.getPeriod().getEnd());
            
            Planning solution = convertToSolution(request);
            System.out.println("Total shifts created: " + solution.getShiftAssignments().size()
                + " required + " + solution.getExtraShiftAssignments().size() + " extra");
            System.out.println("Total employees: " + solution.getEmployees().size());
            
            Planning solvedSolution = planningService.solve(solution);
            
            System.out.println("=== Solution Score ===");
            System.out.println("Hard score: " + (solvedSolution.getScore() != null ? solvedSolution.getScore().hardScore() : "null"));
            System.out.println("Soft score: " + (solvedSolution.getScore() != null ? solvedSolution.getScore().softScore() : "null"));
            
            PlanningResponse response = convertToResponse(solvedSolution);
            System.out.println("Total assignments in response: " + (response.getAssignments() != null ? response.getAssignments().size() : 0));
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            e.printStackTrace();
            return ResponseEntity.internalServerError()
                .body(new PlanningResponse(null, "Erreur: " + e.getMessage()));
        }
    }

    private Planning convertToSolution(PlanningRequest request) {
        List<Employee> employees = new ArrayList<>();
        List<ShiftAssignment> assignments = new ArrayList<>();
        List<ExtraShiftAssignment> extraAssignments = new ArrayList<>();

        LocalDate startDate = LocalDate.parse(request.getPeriod().getStart());
        LocalDate endDate = LocalDate.parse(request.getPeriod().getEnd());
        long periodDays = ChronoUnit.DAYS.between(startDate, endDate) + 1;
        int monthDays = startDate.lengthOfMonth();

        // Convertir les employés (heures proratisées sur la période planifiée)
        for (var empData : request.getEmployees()) {
            Employee emp = new Employee(
                empData.getId(),
                empData.getName(),
                empData.getContractHoursPerWeek(),
                scaleContractHours(empData.getContractHoursPerMonth(), periodDays, monthDays)
            );
            emp.setPreferredShifts(empData.getPreferredShifts());
            emp.setMandatoryShift(empData.getMandatoryShift());
            emp.setProfilEquipe(com.regiaire.planning.domain.EmployeeProfile.resolve(
                empData.getProfilEquipe(), empData.getMandatoryShift()));
            employees.add(emp);
        }

        // Créer les shifts pour chaque jour
        LocalDate currentDate = startDate;

        while (!currentDate.isAfter(endDate)) {
            Shift matin = new Shift(
                "shift_matin_" + currentDate,
                currentDate,
                "6-14",
                LocalTime.of(6, 0),
                LocalTime.of(14, 0)
            );
            assignments.add(new ShiftAssignment("assign_matin_" + currentDate, matin));
            extraAssignments.add(new ExtraShiftAssignment("extra_matin_" + currentDate, matin));

            Shift apresmidi = new Shift(
                "shift_apresmidi_" + currentDate,
                currentDate,
                "14-22",
                LocalTime.of(14, 0),
                LocalTime.of(22, 0)
            );
            assignments.add(new ShiftAssignment("assign_apresmidi_" + currentDate, apresmidi));
            extraAssignments.add(new ExtraShiftAssignment("extra_apresmidi_" + currentDate, apresmidi));

            Shift nuit = new Shift(
                "shift_nuit_" + currentDate,
                currentDate,
                "22-6",
                LocalTime.of(22, 0),
                LocalTime.of(6, 0)
            );
            assignments.add(new ShiftAssignment("assign_nuit_" + currentDate, nuit));

            currentDate = currentDate.plusDays(1);
        }

        assignInitialShifts(employees, assignments);

        return new Planning(employees, assignments, extraAssignments);
    }

    /**
     * Affectation gloutonne initiale : respecte profils, repos 11 h et évite les doubles quarts/jour.
     * Donne au solveur une base réaliste (surtout sur un mois complet).
     */
    private void assignInitialShifts(List<Employee> employees, List<ShiftAssignment> assignments) {
        Map<Employee, Integer> minutesWorked = new HashMap<>();
        Map<Employee, Shift> lastShift = new HashMap<>();
        Map<Employee, Set<LocalDate>> workedDates = new HashMap<>();

        List<ShiftAssignment> ordered = new ArrayList<>(assignments);
        ordered.sort(Comparator
            .comparing((ShiftAssignment a) -> a.getShift().getDate())
            .thenComparing(a -> shiftOrder(a.getShift().getShiftType())));

        for (ShiftAssignment assignment : ordered) {
            Shift shift = assignment.getShift();
            Employee chosen = null;
            int bestScore = Integer.MIN_VALUE;

            for (Employee candidate : employees) {
                if (!canAssignInitial(candidate, shift, lastShift, workedDates)) continue;
                int target = candidate.getContractHoursPerMonth() * 60;
                int worked = minutesWorked.getOrDefault(candidate, 0);
                int deficit = target - worked;
                int streak = WorkDayRules.currentStreakEndingBefore(
                    workedDates.get(candidate), shift.getDate());
                // Priorité : déficit d'heures, puis séries courtes (idéalement ≤ 5 jours)
                int score = deficit * 10 - streak * 100;
                if (streak >= WorkDayRules.IDEAL_MAX_CONSECUTIVE_WORK_DAYS) {
                    score -= 500;
                }
                if (score > bestScore) {
                    bestScore = score;
                    chosen = candidate;
                }
            }

            if (chosen == null) {
                for (Employee candidate : employees) {
                    if (!canAssignInitial(candidate, shift, lastShift, workedDates)) continue;
                    chosen = candidate;
                    break;
                }
            }

            if (chosen != null) {
                assignment.setEmployee(chosen);
                minutesWorked.merge(chosen, assignment.getCountedMinutes(), Integer::sum);
                lastShift.put(chosen, shift);
                workedDates.computeIfAbsent(chosen, e -> new HashSet<>()).add(shift.getDate());
            }
        }
    }

    private static int shiftOrder(String shiftType) {
        return switch (shiftType) {
            case "6-14" -> 0;
            case "14-22" -> 1;
            case "22-6" -> 2;
            default -> 3;
        };
    }

    private static boolean canAssignInitial(
            Employee employee,
            Shift shift,
            Map<Employee, Shift> lastShift,
            Map<Employee, Set<LocalDate>> workedDates) {
        if (employee.isDayWorker() && ShiftTiming.isNightShift(shift)) return false;
        if (employee.isNightTeam() && "6-14".equals(shift.getShiftType())) return false;
        if (EmployeeProfile.NUIT.equals(employee.resolvedProfil()) && "14-22".equals(shift.getShiftType())) {
            return false;
        }

        Set<LocalDate> dates = workedDates.get(employee);
        if (dates != null && dates.contains(shift.getDate())) return false;
        if (WorkDayRules.wouldExceedConsecutive(dates, shift.getDate(), WorkDayRules.MAX_CONSECUTIVE_WORK_DAYS)) {
            return false;
        }

        Shift previous = lastShift.get(employee);
        if (previous != null) {
            if (ShiftTiming.violatesMinimumRest(previous, shift)
                || ShiftTiming.violatesMinimumRest(shift, previous)) {
                return false;
            }
            if (ShiftTiming.isNightShift(previous) && "14-22".equals(shift.getShiftType())
                && ShiftTiming.nightRecoveryDay(previous).equals(shift.getDate())) {
                return false;
            }
        }
        return true;
    }

    /** Proratise les heures mensuelles sur la période réellement planifiée. */
    private static int scaleContractHours(int hoursPerMonth, long periodDays, int monthDays) {
        return (int) Math.round(hoursPerMonth * (double) periodDays / monthDays);
    }

    private PlanningResponse convertToResponse(Planning solution) {
        List<AssignmentResponse> assignments = new ArrayList<>();
        Map<String, Integer> minutesByEmployee = new HashMap<>();
        Map<String, Set<LocalDate>> datesByEmployee = new HashMap<>();

        for (ShiftAssignment assignment : solution.getShiftAssignments()) {
            if (assignment.getEmployee() == null) continue;
            Employee emp = assignment.getEmployee();
            minutesByEmployee.merge(emp.getId(), assignment.getCountedMinutes(), Integer::sum);
            datesByEmployee.computeIfAbsent(emp.getId(), id -> new HashSet<>())
                .add(assignment.getShift().getDate());
            assignments.add(toAssignmentResponse(assignment.getShift(), emp, assignment.getCountedHours()));
        }

        int tolerance = ShiftAssignment.DAY_SHIFT_COUNTED_MINUTES;
        for (ExtraShiftAssignment extra : solution.getExtraShiftAssignments()) {
            if (extra.getEmployee() == null) continue;
            Employee emp = extra.getEmployee();
            int current = minutesByEmployee.getOrDefault(emp.getId(), 0);
            int target = emp.getContractHoursPerMonth() * 60;
            int extraMinutes = extra.getCountedMinutes();
            if (current + extraMinutes > target + tolerance) continue;
            Set<LocalDate> dates = datesByEmployee.getOrDefault(emp.getId(), Set.of());
            if (WorkDayRules.wouldExceedConsecutive(
                    dates, extra.getShift().getDate(), WorkDayRules.MAX_CONSECUTIVE_WORK_DAYS)) {
                continue;
            }
            minutesByEmployee.merge(emp.getId(), extraMinutes, Integer::sum);
            datesByEmployee.computeIfAbsent(emp.getId(), id -> new HashSet<>())
                .add(extra.getShift().getDate());
            assignments.add(toAssignmentResponse(extra.getShift(), emp, extra.getCountedHours()));
        }

        return new PlanningResponse(assignments, null);
    }

    private static AssignmentResponse toAssignmentResponse(Shift shift, Employee employee, double hours) {
        return new AssignmentResponse(
            shift.getDate().toString(),
            employee.getName(),
            shift.getShiftType(),
            hours,
            shift.getStartTime().toString(),
            shift.getEndTime().toString()
        );
    }

    // Classes internes pour les requêtes/réponses
    public static class PlanningRequest {
        private List<EmployeeData> employees;
        private PeriodData period;
        private String instructions;

        public List<EmployeeData> getEmployees() { return employees; }
        public void setEmployees(List<EmployeeData> employees) { this.employees = employees; }
        public PeriodData getPeriod() { return period; }
        public void setPeriod(PeriodData period) { this.period = period; }
        public String getInstructions() { return instructions; }
        public void setInstructions(String instructions) { this.instructions = instructions; }
    }

    public static class EmployeeData {
        private String id;
        private String name;
        private int contractHoursPerWeek;
        private int contractHoursPerMonth;
        private List<String> preferredShifts;
        private String mandatoryShift;
        private String profilEquipe;

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
    }

    public static class PeriodData {
        private String start;
        private String end;

        public String getStart() { return start; }
        public void setStart(String start) { this.start = start; }
        public String getEnd() { return end; }
        public void setEnd(String end) { this.end = end; }
    }

    public static class PlanningResponse {
        private List<AssignmentResponse> assignments;
        private String error;

        public PlanningResponse(List<AssignmentResponse> assignments, String error) {
            this.assignments = assignments;
            this.error = error;
        }

        public List<AssignmentResponse> getAssignments() { return assignments; }
        public void setAssignments(List<AssignmentResponse> assignments) { this.assignments = assignments; }
        public String getError() { return error; }
        public void setError(String error) { this.error = error; }
    }

    public static class AssignmentResponse {
        private String date;
        private String employeeName;
        private String shiftType;
        private double hours;
        private String startTime;
        private String endTime;

        public AssignmentResponse(String date, String employeeName, String shiftType, double hours, String startTime, String endTime) {
            this.date = date;
            this.employeeName = employeeName;
            this.shiftType = shiftType;
            this.hours = hours;
            this.startTime = startTime;
            this.endTime = endTime;
        }

        public String getDate() { return date; }
        public void setDate(String date) { this.date = date; }
        public String getEmployeeName() { return employeeName; }
        public void setEmployeeName(String employeeName) { this.employeeName = employeeName; }
        public String getShiftType() { return shiftType; }
        public void setShiftType(String shiftType) { this.shiftType = shiftType; }
        public double getHours() { return hours; }
        public void setHours(double hours) { this.hours = hours; }
        public String getStartTime() { return startTime; }
        public void setStartTime(String startTime) { this.startTime = startTime; }
        public String getEndTime() { return endTime; }
        public void setEndTime(String endTime) { this.endTime = endTime; }
    }
}
