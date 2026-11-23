export interface LevelObjective {
  id: "finish" | "coins" | "clean-run";
  label: string;
  target: number;
}

export interface LevelDefinition {
  id: string;
  chapter: number;
  level: number;
  title: string;
  subtitle: string;
  lengthMeters: number;
  chaseStartsAtMeters: number;
  speedMetersPerSecond: number;
  objectives: LevelObjective[];
}

export interface LevelResult {
  stars: 1 | 2 | 3;
  completedObjectiveIds: LevelObjective["id"][];
}

export function evaluateLevel(
  level: LevelDefinition,
  distanceMeters: number,
  coins: number,
  hits: number,
): LevelResult {
  const completedObjectiveIds: LevelObjective["id"][] = [];
  if (distanceMeters >= level.lengthMeters) completedObjectiveIds.push("finish");
  const coinGoal = level.objectives.find((objective) => objective.id === "coins")?.target ?? 0;
  if (coins >= coinGoal) completedObjectiveIds.push("coins");
  const hitLimit = level.objectives.find((objective) => objective.id === "clean-run")?.target ?? 0;
  if (hits <= hitLimit) completedObjectiveIds.push("clean-run");
  return {
    stars: Math.max(1, Math.min(3, completedObjectiveIds.length)) as 1 | 2 | 3,
    completedObjectiveIds,
  };
}

