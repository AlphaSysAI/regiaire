package com.regiaire.planning.service;

import ai.timefold.solver.core.api.solver.Solver;
import ai.timefold.solver.core.api.solver.SolverFactory;
import ai.timefold.solver.core.config.solver.SolverConfig;
import com.regiaire.planning.domain.Planning;
import org.springframework.stereotype.Service;

@Service
public class PlanningService {
    public Planning solve(Planning problem) {
        SolverFactory<Planning> solverFactory = SolverFactory.create(
            new SolverConfig()
                .withSolutionClass(Planning.class)
                .withEntityClasses(com.regiaire.planning.domain.ShiftAssignment.class)
                .withConstraintProviderClass(com.regiaire.planning.constraints.PlanningConstraintProvider.class)
                .withTerminationSpentLimit(java.time.Duration.ofSeconds(120))
        );

        Solver<Planning> solver = solverFactory.buildSolver();
        return solver.solve(problem);
    }
}
