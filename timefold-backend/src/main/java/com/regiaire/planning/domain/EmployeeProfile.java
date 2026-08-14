package com.regiaire.planning.domain;

/** Profil de rotation pour la planification. */
public final class EmployeeProfile {

    /** Matin et après-midi uniquement — jamais de nuit. */
    public static final String JOUR = "jour";
    /** Travailleur de nuit strict — nuits uniquement, jamais matin ni aprem. */
    public static final String NUIT = "nuit";
    /** Travailleur de nuit avec aprem occasionnels — jamais matin, aprem jamais le lendemain d'une nuit. */
    public static final String NUIT_APREM = "nuit_aprem";

    private EmployeeProfile() {
    }

    public static String resolve(String profilEquipe, String mandatoryShift) {
        if (profilEquipe != null && !profilEquipe.isBlank()) {
            return profilEquipe;
        }
        if ("22-6".equals(mandatoryShift)) {
            return NUIT;
        }
        return JOUR;
    }

    public static boolean isNightTeam(String profil) {
        return NUIT.equals(profil) || NUIT_APREM.equals(profil);
    }

    public static boolean isDayWorker(String profil) {
        return JOUR.equals(profil);
    }
}
