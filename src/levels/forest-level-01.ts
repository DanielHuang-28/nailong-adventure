import type { LevelDefinition } from "./level-definition";

export const forestLevel01: LevelDefinition = {
  id: "forest-01-morning-pursuit",
  chapter: 1,
  level: 1,
  title: "晨雾初追",
  subtitle: "穿过森林木桥，别让洞洞幺逃进传送门",
  lengthMeters: 520,
  chaseStartsAtMeters: 330,
  speedMetersPerSecond: 20.5,
  objectives: [
    { id: "finish", label: "抵达传送门", target: 520 },
    { id: "coins", label: "收集 18 枚星贝", target: 18 },
    { id: "clean-run", label: "碰撞不超过 2 次", target: 2 },
  ],
};

