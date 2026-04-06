package com.optiroute.planning.controller;

import com.optiroute.planning.domain.*;
import com.optiroute.planning.service.PlanningService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;

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
            System.out.println("Total shifts created: " + solution.getShiftAssignments().size());
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

        // Convertir les employés
        for (var empData : request.getEmployees()) {
            Employee emp = new Employee(
                empData.getId(),
                empData.getName(),
                empData.getContractHoursPerWeek(),
                empData.getContractHoursPerMonth()
            );
            emp.setPreferredShifts(empData.getPreferredShifts());
            emp.setMandatoryShift(empData.getMandatoryShift());
            employees.add(emp);
        }

        // Créer les shifts pour chaque jour
        LocalDate startDate = LocalDate.parse(request.getPeriod().getStart());
        LocalDate endDate = LocalDate.parse(request.getPeriod().getEnd());
        LocalDate currentDate = startDate;
        int shiftIndex = 0;

        while (!currentDate.isAfter(endDate)) {
            // Matin - 2 assignments pour permettre 2 employés
            Shift matin = new Shift(
                "shift_" + shiftIndex++,
                currentDate,
                "6-14",
                LocalTime.of(6, 0),
                LocalTime.of(14, 0)
            );
            assignments.add(new ShiftAssignment("assign_matin1_" + currentDate, matin));
            assignments.add(new ShiftAssignment("assign_matin2_" + currentDate, matin));

            // Après-midi - 2 assignments pour permettre 2 employés
            Shift apresmidi = new Shift(
                "shift_" + shiftIndex++,
                currentDate,
                "14-22",
                LocalTime.of(14, 0),
                LocalTime.of(22, 0)
            );
            assignments.add(new ShiftAssignment("assign_apresmidi1_" + currentDate, apresmidi));
            assignments.add(new ShiftAssignment("assign_apresmidi2_" + currentDate, apresmidi));

            // Nuit - 1 seul assignment (toujours 1 employé)
            Shift nuit = new Shift(
                "shift_" + shiftIndex++,
                currentDate,
                "22-6",
                LocalTime.of(22, 0),
                LocalTime.of(6, 0)
            );
            assignments.add(new ShiftAssignment("assign_nuit_" + currentDate, nuit));

            currentDate = currentDate.plusDays(1);
        }

        return new Planning(employees, assignments);
    }

    private PlanningResponse convertToResponse(Planning solution) {
        List<AssignmentResponse> assignments = new ArrayList<>();
        
        for (ShiftAssignment assignment : solution.getShiftAssignments()) {
            if (assignment.getEmployee() != null) {
                assignments.add(new AssignmentResponse(
                    assignment.getShift().getDate().toString(),
                    assignment.getEmployee().getName(),
                    assignment.getShift().getShiftType(),
                    assignment.getHours(),
                    assignment.getShift().getStartTime().toString(),
                    assignment.getShift().getEndTime().toString()
                ));
            }
        }

        return new PlanningResponse(assignments, null);
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
        private int hours;
        private String startTime;
        private String endTime;

        public AssignmentResponse(String date, String employeeName, String shiftType, int hours, String startTime, String endTime) {
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
        public int getHours() { return hours; }
        public void setHours(int hours) { this.hours = hours; }
        public String getStartTime() { return startTime; }
        public void setStartTime(String startTime) { this.startTime = startTime; }
        public String getEndTime() { return endTime; }
        public void setEndTime(String endTime) { this.endTime = endTime; }
    }
}
