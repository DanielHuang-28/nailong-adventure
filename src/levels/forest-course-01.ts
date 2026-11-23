import type { LevelDefinition } from "./level-definition";
import { forestLevel01 } from "./forest-level-01";

export type Lane = -1 | 0 | 1;
export type ForestSectionId = "misty-grove" | "watermill-creek" | "forest-station" | "gorge-bridge" | "mine-portal";
export type ObstacleKind = "fallen-log" | "root-arch" | "mine-cart" | "rock-cluster" | "rolling-log";

export interface ForestCourseSection {
  id: ForestSectionId;
  title: string;
  startMeters: number;
  endMeters: number;
  landmark: "treehouse" | "watermill" | "station" | "bridge" | "portal";
  road: "forest-earth" | "creek-planks" | "station-stone" | "bridge-wood" | "mine-stone";
  eventLabel: string;
}

export interface AuthoredObstacle {
  id: string;
  atMeters: number;
  lane: Lane;
  kind: ObstacleKind;
  response: "jump" | "slide" | "switch";
}

export interface CollectibleTrail {
  id: string;
  startMeters: number;
  count: number;
  spacingMeters: number;
  lanes: Lane[];
  height: "ground" | "jump-arc";
}

export interface ForestCourse {
  level: LevelDefinition;
  sections: ForestCourseSection[];
  obstacles: AuthoredObstacle[];
  collectibleTrails: CollectibleTrail[];
}

export const forestCourse01: ForestCourse = {
  level: forestLevel01,
  sections: [
    { id: "misty-grove", title: "晨雾林径", startMeters: 0, endMeters: 105, landmark: "treehouse", road: "forest-earth", eventLabel: "鹿群穿过林间" },
    { id: "watermill-creek", title: "溪谷水车", startMeters: 105, endMeters: 215, landmark: "watermill", road: "creek-planks", eventLabel: "水车溅起浪花" },
    { id: "forest-station", title: "森林车站", startMeters: 215, endMeters: 325, landmark: "station", road: "station-stone", eventLabel: "蒸汽火车进站" },
    { id: "gorge-bridge", title: "河谷悬桥", startMeters: 325, endMeters: 430, landmark: "bridge", road: "bridge-wood", eventLabel: "桥身开始晃动" },
    { id: "mine-portal", title: "矿洞传送门", startMeters: 430, endMeters: 520, landmark: "portal", road: "mine-stone", eventLabel: "传送门正在启动" },
  ],
  obstacles: [
    { id: "grove-log-01", atMeters: 52, lane: 0, kind: "fallen-log", response: "jump" },
    { id: "grove-roots-01", atMeters: 78, lane: -1, kind: "root-arch", response: "slide" },
    { id: "creek-rock-01", atMeters: 128, lane: 1, kind: "rock-cluster", response: "switch" },
    { id: "creek-log-01", atMeters: 158, lane: -1, kind: "fallen-log", response: "jump" },
    { id: "creek-roots-01", atMeters: 188, lane: 0, kind: "root-arch", response: "slide" },
    { id: "station-cart-01", atMeters: 238, lane: -1, kind: "mine-cart", response: "switch" },
    { id: "station-cart-02", atMeters: 272, lane: 1, kind: "mine-cart", response: "switch" },
    { id: "station-log-01", atMeters: 304, lane: 0, kind: "fallen-log", response: "jump" },
    { id: "bridge-roots-01", atMeters: 348, lane: 1, kind: "root-arch", response: "slide" },
    { id: "bridge-roll-01", atMeters: 382, lane: -1, kind: "rolling-log", response: "switch" },
    { id: "bridge-rock-01", atMeters: 414, lane: 0, kind: "rock-cluster", response: "switch" },
    { id: "mine-cart-01", atMeters: 452, lane: 1, kind: "mine-cart", response: "switch" },
    { id: "mine-log-01", atMeters: 478, lane: -1, kind: "fallen-log", response: "jump" },
    { id: "mine-roots-01", atMeters: 501, lane: 0, kind: "root-arch", response: "slide" },
  ],
  collectibleTrails: [
    { id: "grove-guide", startMeters: 18, count: 7, spacingMeters: 4.5, lanes: [0, 0, -1, -1, 0, 1, 1], height: "ground" },
    { id: "creek-arc", startMeters: 140, count: 7, spacingMeters: 3.8, lanes: [1, 0, -1, -1, 0, 1, 1], height: "jump-arc" },
    { id: "station-zigzag", startMeters: 225, count: 8, spacingMeters: 5, lanes: [0, -1, -1, 0, 1, 1, 0, -1], height: "ground" },
    { id: "bridge-center", startMeters: 334, count: 8, spacingMeters: 5.2, lanes: [0, 0, 1, 1, 0, -1, -1, 0], height: "ground" },
    { id: "portal-finale", startMeters: 442, count: 9, spacingMeters: 5.5, lanes: [-1, 0, 1, 1, 0, -1, 0, 1, 0], height: "jump-arc" },
  ],
};

export function sectionAtDistance(course: ForestCourse, distanceMeters: number): ForestCourseSection {
  return course.sections.find((section) => distanceMeters >= section.startMeters && distanceMeters < section.endMeters)
    ?? course.sections[course.sections.length - 1];
}

export function validateForestCourse(course: ForestCourse): string[] {
  const errors: string[] = [];
  if (course.sections[0]?.startMeters !== 0) errors.push("Course must begin at zero metres.");
  for (let index = 0; index < course.sections.length; index += 1) {
    const section = course.sections[index];
    const next = course.sections[index + 1];
    if (section.endMeters <= section.startMeters) errors.push(`${section.id} has an invalid distance range.`);
    if (next && section.endMeters !== next.startMeters) errors.push(`${section.id} does not connect to ${next.id}.`);
  }
  if (course.sections.at(-1)?.endMeters !== course.level.lengthMeters) errors.push("Course does not end at the level goal.");
  for (const obstacle of course.obstacles) {
    if (obstacle.atMeters <= 0 || obstacle.atMeters >= course.level.lengthMeters) errors.push(`${obstacle.id} is outside the course.`);
  }
  return errors;
}

