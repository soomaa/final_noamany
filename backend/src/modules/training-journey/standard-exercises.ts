import definitions from './standard-exercise-profiles.json';
// Curated defaults for existing standard movements, not name-based fuzzy inference.
// Regional targets are editable by the coach; variants can change recruitment.
// References: https://www.nasm.org/workout-exercise-guidance
// https://www.nasm.org/resource-center/exercise-library/barbell-deadlift
// https://www.acefitness.org/resources/everyone/exercise-library/equipment/
const normalize = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();
export function standardExercise(name: string) {
  const profile = definitions.find(row => row.names.some(alias => normalize(alias) === normalize(name)));
  return profile ? {kind: profile.kind, primary: [...profile.primary], secondary: [...profile.secondary]} : {kind: 'strength', primary: [], secondary: []};
}
