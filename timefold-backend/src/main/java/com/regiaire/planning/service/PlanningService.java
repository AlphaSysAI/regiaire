package com.regiaire.planning.service;

import ai.timefold.solver.core.api.solver.Solver;
import ai.timefold.solver.core.api.solver.SolverFactory;
import ai.timefold.solver.core.config.solver.SolverConfig;
import ai.timefold.solver.core.config.solver.termination.TerminationConfig;
import com.regiaire.planning.domain.Planning;
import org.springframework.stereotype.Service;

@Service
public class PlanningService {
    private final SolverFactory<Planning> solverFactory;

    public PlanningService() {
        this.solverFactory = SolverFactory.create(
            new SolverConfig()
                .withSolutionClass(Planning.class)
                .withEntityClasses(
                    com.regiaire.planning.domain.ShiftAssignment.class,
                    com.regiaire.planning.domain.ExtraShiftAssignment.class)
                .withConstraintProviderClass(com.regiaire.planning.constraints.PlanningConstraintProvider.class)
                .withTerminationConfig(new TerminationConfig()
                    .withSpentLimit(java.time.Duration.ofSeconds(300))
                    .withUnimprovedSpentLimit(java.time.Duration.ofSeconds(120))
                    .withBestScoreFeasible(true))
        );
    }

    public Planning solve(Planning problem) {
        Solver<Planning> solver = solverFactory.buildSolver();
        return solver.solve(problem);
    }
}
