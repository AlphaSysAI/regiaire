package com.optiroute.planning.service;

import ai.timefold.solver.core.api.solver.Solver;
import ai.timefold.solver.core.api.solver.SolverFactory;
import ai.timefold.solver.core.config.solver.SolverConfig;
import com.optiroute.planning.domain.Planning;
import org.springframework.stereotype.Service;

@Service
public class PlanningService {
    public Planning solve(Planning problem) {
        SolverFactory<Planning> solverFactory = SolverFactory.create(
            new SolverConfig()
                .withSolutionClass(Planning.class)
                .withEntityClasses(com.optiroute.planning.domain.ShiftAssignment.class)
                .withConstraintProviderClass(com.optiroute.planning.constraints.PlanningConstraintProvider.class)
                .withTerminationSpentLimit(java.time.Duration.ofSeconds(120))
        );

        Solver<Planning> solver = solverFactory.buildSolver();
        return solver.solve(problem);
    }
}
