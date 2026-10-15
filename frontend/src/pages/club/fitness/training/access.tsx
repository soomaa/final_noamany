import { createContext, useContext } from "react";
import { usePermission } from "@/hooks/use-permission";
export const TrainingPortalContext = createContext(false);
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
export function useTrainingAccess() {
  const trainerPortal = useContext(TrainingPortalContext);
  const permission = usePermission();
  return {
    trainerPortal,
    base: trainerPortal ? "/trainer-portal/training" : "/club-training",
    can: (key: string) =>
      trainerPortal
        ? permission.can("trainer.portal:view") && coachActions.has(key)
        : permission.can(key),
  };
}
