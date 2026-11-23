export const CURRENT_SAVE_VERSION = 1 as const;

export interface GameSaveV1 {
  version: typeof CURRENT_SAVE_VERSION;
  currencies: {
    coins: number;
    fragments: number;
  };
  progression: {
    bestDistanceMeters: number;
    unlockedWorldIds: string[];
    unlockedStoryChapterIds: string[];
  };
  settings: {
    musicVolume: number;
    effectsVolume: number;
    quality: "low" | "medium" | "high" | "auto";
    reducedMotion: boolean;
  };
}

export function createDefaultSave(): GameSaveV1 {
  return {
    version: CURRENT_SAVE_VERSION,
    currencies: { coins: 0, fragments: 0 },
    progression: {
      bestDistanceMeters: 0,
      unlockedWorldIds: ["forest-frontier"],
      unlockedStoryChapterIds: [],
    },
    settings: {
      musicVolume: 0.8,
      effectsVolume: 0.9,
      quality: "auto",
      reducedMotion: false,
    },
  };
}
