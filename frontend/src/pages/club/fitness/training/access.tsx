import { createContext, useContext } from "react";
import { usePermission } from "@/hooks/use-permission";
import { useAuth } from "@/store/auth";
export const TrainingPortalContext = createContext(false);

/** Noamany RBAC resource for the training space (sidebar: المدربين ← مساحة التدريب). */
export const TRAINING_SPACE_KEY = "club.fitness.training_space";

const coachActions = new Set([
  "club.fitness.strength:create",
  "club.fitness.strength:update",
  "club.fitness.programs:create",
  "club.fitness.programs:update",
  "club.fitness.progress:create",
  "club.fitness.progress:update",
  "club.fitness.assessments:create",
  "club.fitness.assessments:update",
]);

/**
 * The ported Gymora screens ask for the Gymora keys (programs/strength/progress/assessments).
 * Noamany has one resource for the whole space, so every one of them maps to the same action on
 * `club.fitness.training_space`. Equipment edits also accept the existing equipment page grant.
 */
function noamanyKeys(key: string): string[] {
  const [resource, action] = key.split(":");
  if (resource === "club.fitness.equipment") return [`${TRAINING_SPACE_KEY}:${action}`, key];
  if (/^club\.fitness\.(programs|strength|progress|assessments)$/.test(resource)) return [`${TRAINING_SPACE_KEY}:${action}`];
  return [key];
}

export function useTrainingAccess() {
  const trainerPortal = useContext(TrainingPortalContext);
  const permission = usePermission();
  const isTrainer = useAuth((s) => !!s.user?.is_trainer);
  return {
    trainerPortal,
    base: trainerPortal ? "/trainer-portal/training" : "/club-training",
    can: (key: string) =>
      trainerPortal
        ? isTrainer && coachActions.has(key)
        : noamanyKeys(key).some((k) => permission.can(k)),
  };
}
