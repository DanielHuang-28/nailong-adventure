export type AssetId = string;
export type WorldId = string;

export interface WorldAssetManifest {
  environment: AssetId[];
  landmarks: AssetId[];
  obstacles: AssetId[];
  npcs: AssetId[];
  collectibles: AssetId[];
  music: AssetId[];
  ambience: AssetId[];
}

export interface RouteSegmentDefinition {
  id: string;
  lengthMeters: number;
  sceneAsset: AssetId;
  allowedNext: string[];
  obstacleSets: string[];
  eventIds: string[];
  minDifficulty: number;
  maxDifficulty: number;
}

export interface PursuitBeatDefinition {
  id: string;
  triggerMeters: number;
  durationSeconds: number;
  dialogueKey?: string;
  cameraPreset: string;
  exit: "resume" | "reward" | "portal";
}

export interface WorldVisualProfile {
  sky: string;
  fogColor: string;
  fogNear: number;
  fogFar: number;
  sunlightColor: string;
  sunlightIntensity: number;
  palette: string[];
}

export interface WorldPackage {
  schemaVersion: 1;
  id: WorldId;
  displayNameKey: string;
  descriptionKey: string;
  visual: WorldVisualProfile;
  assets: WorldAssetManifest;
  routeSegments: RouteSegmentDefinition[];
  pursuitBeats: PursuitBeatDefinition[];
  storyChapterIds: string[];
  spawnTableIds: string[];
}

export function validateWorldPackage(world: WorldPackage): string[] {
  const errors: string[] = [];
  const segmentIds = new Set(world.routeSegments.map((segment) => segment.id));

  if (world.schemaVersion !== 1) errors.push("Unsupported world schema version.");
  if (!world.id.trim()) errors.push("World id is required.");
  if (world.routeSegments.length === 0) errors.push("At least one route segment is required.");

  for (const segment of world.routeSegments) {
    if (segment.lengthMeters <= 0) {
      errors.push(`Route segment ${segment.id} must have positive length.`);
    }
    for (const nextId of segment.allowedNext) {
      if (!segmentIds.has(nextId)) {
        errors.push(`Route segment ${segment.id} references missing next segment ${nextId}.`);
      }
    }
  }

  return errors;
}

