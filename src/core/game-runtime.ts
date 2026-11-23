import * as THREE from "three";
import { FixedStepClock } from "./fixed-step-clock";
import { GameFlow } from "../gameplay/game-flow";
import { RunnerController, type RunnerSnapshot } from "../gameplay/runner-controller";
import {
  CharacterActor,
  DONGDONGYAO_DEVELOPMENT_ASSET,
  NAILONG_DEVELOPMENT_ASSET,
} from "../characters/character-actor";
import type { RunnerAction } from "../input/runner-action";
import { SwipeInput } from "../input/swipe-input";
import { forestLevel01 } from "../levels/forest-level-01";
import { evaluateLevel } from "../levels/level-definition";
import { forestCourse01, sectionAtDistance, type ForestSectionId, type ObstacleKind } from "../levels/forest-course-01";
import { ForestArtKit, type ForestLandmark } from "../worlds/forest-art-kit";
import { AudioDirector } from "../audio/audio-director";
import { assetUrl } from "../asset-url";

type Lane = -1 | 0 | 1;

interface LaneObject {
  object: THREE.Object3D;
  lane: Lane;
  consumed: boolean;
  atMeters: number;
}

interface ObstacleObject extends LaneObject {
  kind: ObstacleKind;
  response: "jump" | "slide" | "switch";
}

const PLAYER_Z = 1.2;
const LANE_WIDTH = 2.75;
const TRACK_TILE_LENGTH = 7.5;
const TRACK_TILE_COUNT = Math.ceil(forestLevel01.lengthMeters / TRACK_TILE_LENGTH) + 2;
const SECTION_ATMOSPHERE: Record<ForestSectionId, { sky: number; fog: number; exposure: number }> = {
  "misty-grove": { sky: 0x91d8e8, fog: 0xc2e3d2, exposure: 1.14 },
  "watermill-creek": { sky: 0x7ed8ee, fog: 0xaedfd5, exposure: 1.2 },
  "forest-station": { sky: 0x9bd9e1, fog: 0xd7dfbd, exposure: 1.22 },
  "gorge-bridge": { sky: 0x75cbe2, fog: 0xa8d4d0, exposure: 1.12 },
  "mine-portal": { sky: 0x315a64, fog: 0x47756f, exposure: 1.05 },
};

function courseCenterX(meters: number): number {
  return Math.sin(meters / 48) * 1.75 + Math.sin(meters / 21) * 0.42;
}

function courseHeight(meters: number): number {
  if (meters < 105) return 0;
  if (meters < 135) return THREE.MathUtils.smoothstep(meters, 105, 135) * 0.55;
  if (meters < 185) return 0.55 + Math.sin((meters - 135) / 50 * Math.PI) * 0.25;
  if (meters < 215) return (1 - THREE.MathUtils.smoothstep(meters, 185, 215)) * 0.55;
  if (meters < 325) return 0;
  if (meters < 375) return THREE.MathUtils.smoothstep(meters, 325, 375) * 1.25;
  if (meters < 405) return 1.25;
  if (meters < 430) return (1 - THREE.MathUtils.smoothstep(meters, 405, 430)) * 1.25;
  return THREE.MathUtils.smoothstep(meters, 430, 520) * 0.42;
}

export class GameRuntime {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(58, 1, 0.1, 320);
  private readonly clock = new FixedStepClock();
  private readonly flow = new GameFlow();
  private readonly runner = new RunnerController();
  private readonly player = new CharacterActor(NAILONG_DEVELOPMENT_ASSET);
  private readonly target = new CharacterActor(DONGDONGYAO_DEVELOPMENT_ASSET);
  private readonly swipeInput: SwipeInput;
  private readonly artKit: ForestArtKit;
  private readonly audio = new AudioDirector();
  private readonly movingTrack: THREE.Object3D[] = [];
  private readonly forestProps: THREE.Object3D[] = [];
  private readonly obstacles: ObstacleObject[] = [];
  private readonly collectibles: LaneObject[] = [];
  private playerShadow!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private targetShadow!: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
  private frameHandle = 0;
  private distanceMeters = 0;
  private coins = 0;
  private hits = 0;
  private chaseGapMeters = 86;
  private countdownTimer: number | null = null;
  private rewardTimer: number | null = null;
  private sectionEventTimer: number | null = null;
  private elapsedSeconds = 0;
  private currentSectionId: ForestSectionId = "misty-grove";
  private characterLoadState: "loading" | "ready" | "error" = "loading";

  constructor(
    canvas: HTMLCanvasElement,
    private readonly status: HTMLDivElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.artKit = new ForestArtKit(this.renderer.capabilities.getMaxAnisotropy());
    this.scene.background = new THREE.Color(0x86d5ee);
    this.scene.fog = new THREE.Fog(0xbfe5d5, 38, 215);
    this.camera.position.set(0, 5.8, 11.5);
    this.swipeInput = new SwipeInput(window, (action) => this.performAction(action));
    this.buildScene();
  }

  start(): void {
    this.showLobby();
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    this.status.addEventListener("click", this.onStatusClick);
    this.swipeInput.connect();
    this.resize();
    this.clock.reset(performance.now());
    this.frameHandle = requestAnimationFrame(this.render);
    if (new URLSearchParams(window.location.search).has("autoplay")) {
      window.setTimeout(() => this.beginCountdown(), 120);
    }
  }

  dispose(): void {
    cancelAnimationFrame(this.frameHandle);
    if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
    if (this.rewardTimer !== null) window.clearTimeout(this.rewardTimer);
    if (this.sectionEventTimer !== null) window.clearTimeout(this.sectionEventTimer);
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    this.status.removeEventListener("click", this.onStatusClick);
    this.swipeInput.disconnect();
    this.audio.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material instanceof THREE.SpriteMaterial) material.map?.dispose();
          material.dispose();
        });
      }
    });
    this.renderer.dispose();
  }

  private buildScene(): void {
    const hemisphere = new THREE.HemisphereLight(0xc9f2ff, 0x365a30, 2.2);
    this.scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffe4a3, 3.6);
    sun.position.set(-18, 28, 16);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -24;
    sun.shadow.camera.right = 24;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -8;
    this.scene.add(sun);

    this.scene.add(this.artKit.createSkyDome());

    this.createTerrain();
    this.createTrack();
    this.createForest();
    this.createObstacles();
    this.createCollectibles();
    this.createCharacters();
  }

  private createTerrain(): void {
    const groundMaterial = new THREE.MeshToonMaterial({ color: 0x59a845 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 640), groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.24, -270);
    ground.receiveShadow = true;
    this.scene.add(ground);

    const mountainMaterial = new THREE.MeshToonMaterial({ color: 0x719f86 });
    for (let i = 0; i < 13; i += 1) {
      const mountain = new THREE.Mesh(new THREE.DodecahedronGeometry(12 + (i % 4) * 2.6, 2), mountainMaterial);
      mountain.position.set(-58 + i * 9.5, 8 + (i % 3) * 2.4, -148 - (i % 4) * 14);
      mountain.scale.set(1.1, 1.8 + (i % 2) * 0.35, 0.9);
      mountain.rotation.set(i * 0.09, i * 0.63, i * 0.04);
      this.scene.add(mountain);
    }
  }

  private createTrack(): void {
    for (let i = 0; i < TRACK_TILE_COUNT; i += 1) {
      const atMeters = i * TRACK_TILE_LENGTH;
      const section = sectionAtDistance(forestCourse01, Math.min(atMeters, forestLevel01.lengthMeters - 0.01));
      const tile = this.artKit.createRoadTile(section.road, TRACK_TILE_LENGTH, i);
      tile.position.z = 8 - atMeters;
      tile.userData.atMeters = atMeters;
      this.scene.add(tile);
      this.movingTrack.push(tile);
    }
  }

  private createForest(): void {
    for (let i = 0; i < 86; i += 1) {
      const tree = this.artKit.createOrganicTree(1200 + i * 37, 0.76 + (i % 5) * 0.075);
      const side = i % 2 === 0 ? -1 : 1;
      const atMeters = 4 + i * 6.15;
      tree.position.set(side * (7.1 + (i % 5) * 1.45), 0, PLAYER_Z - atMeters);
      tree.rotation.y = i * 0.71;
      tree.userData.atMeters = atMeters;
      tree.userData.baseX = tree.position.x;
      tree.userData.baseY = 0;
      this.scene.add(tree);
      this.forestProps.push(tree);
    }

    const flowerMaterials = [0xff6da6, 0x9477f1, 0xffd94f].map((color) => new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: 0.1 }));
    for (let i = 0; i < 70; i += 1) {
      const cluster = new THREE.Group();
      for (let bloom = 0; bloom < 4; bloom += 1) {
        const flower = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13 + (bloom % 2) * 0.04, 1), flowerMaterials[(i + bloom) % flowerMaterials.length]);
        flower.position.set((bloom - 1.5) * 0.24, 0.22 + (bloom % 2) * 0.18, (bloom % 2 - 0.5) * 0.22);
        flower.castShadow = true;
        cluster.add(flower);
      }
      const side = i % 2 === 0 ? -1 : 1;
      const atMeters = 7 + i * 7.4;
      cluster.position.set(side * (5.8 + (i % 3) * 0.55), 0.08, PLAYER_Z - atMeters);
      cluster.userData.atMeters = atMeters;
      cluster.userData.baseX = cluster.position.x;
      cluster.userData.baseY = 0.08;
      this.scene.add(cluster);
      this.forestProps.push(cluster);
    }

    for (let i = 0; i < 11; i += 1) {
      const heroTree = this.artKit.createOrganicTree(8000 + i * 101, 1.35 + (i % 3) * 0.12);
      const side = i % 2 === 0 ? -1 : 1;
      const atMeters = 34 + i * 47;
      heroTree.position.set(side * (10.4 + (i % 2) * 1.4), 0, PLAYER_Z - atMeters);
      heroTree.rotation.y = i * 0.48;
      heroTree.userData.atMeters = atMeters;
      heroTree.userData.baseX = heroTree.position.x;
      heroTree.userData.baseY = 0;
      this.scene.add(heroTree);
      this.forestProps.push(heroTree);
    }

    for (let i = 0; i < 18; i += 1) {
      const lantern = this.artKit.createLanternPost();
      const side = i % 2 === 0 ? -1 : 1;
      const atMeters = 26 + i * 29;
      lantern.position.set(side * 6.25, 0, PLAYER_Z - atMeters);
      lantern.rotation.y = side < 0 ? 0 : Math.PI;
      lantern.userData.atMeters = atMeters;
      lantern.userData.baseX = lantern.position.x;
      lantern.userData.baseY = 0;
      this.scene.add(lantern);
      this.forestProps.push(lantern);
    }

    for (let i = 0; i < 58; i += 1) {
      const decor = this.artKit.createRoadsideDecor(5000 + i * 23);
      const side = i % 2 === 0 ? -1 : 1;
      const atMeters = 12 + i * 8.8;
      decor.position.set(side * (6.2 + (i % 3) * 0.72), 0, PLAYER_Z - atMeters);
      decor.rotation.y = side < 0 ? 0.18 : Math.PI - 0.18;
      decor.userData.atMeters = atMeters;
      decor.userData.baseX = decor.position.x;
      decor.userData.baseY = 0;
      this.scene.add(decor);
      this.forestProps.push(decor);
    }

    for (const [index, atMeters] of [112, 224, 333, 438].entries()) {
      const bunting = this.artKit.createBuntingGate(index * 17);
      bunting.position.set(0, 0, PLAYER_Z - atMeters);
      bunting.userData.atMeters = atMeters;
      bunting.userData.baseX = 0;
      bunting.userData.baseY = 0;
      this.scene.add(bunting);
      this.forestProps.push(bunting);
    }

    for (const [index, atMeters] of [55, 145, 247, 368, 462].entries()) {
      const butterflies = this.artKit.createButterflySwarm(7000 + index * 41);
      const side = index % 2 === 0 ? -1 : 1;
      butterflies.position.set(side * 6.4, 0, PLAYER_Z - atMeters);
      butterflies.userData.atMeters = atMeters;
      butterflies.userData.baseX = butterflies.position.x;
      butterflies.userData.baseY = 0;
      this.scene.add(butterflies);
      this.forestProps.push(butterflies);
    }

    const landmarks: Array<{ kind: ForestLandmark; atMeters: number; x: number; scale: number }> = [
      { kind: "treehouse", atMeters: 92, x: -12.4, scale: 1.2 },
      { kind: "watermill", atMeters: 172, x: 12.6, scale: 1.25 },
      { kind: "station", atMeters: 276, x: -13.8, scale: 1.18 },
      { kind: "bridge", atMeters: 350, x: 0, scale: 1.12 },
      { kind: "portal", atMeters: 514, x: 0, scale: 1.28 },
    ];

    const waters = [
      { object: this.artKit.createWaterRibbon(8.5, 108), atMeters: 162, x: 10.8, y: -0.25 },
      { object: this.artKit.createWaterRibbon(28, 106), atMeters: 378, x: 0, y: -1.45 },
    ];
    for (const water of waters) {
      water.object.position.set(water.x, water.y, PLAYER_Z - water.atMeters);
      water.object.userData.atMeters = water.atMeters;
      water.object.userData.baseX = water.x;
      water.object.userData.baseY = water.y;
      this.scene.add(water.object);
      this.forestProps.push(water.object);
    }

    for (const landmark of landmarks) {
      const object = this.artKit.createLandmark(landmark.kind);
      object.position.set(landmark.x, 0, PLAYER_Z - landmark.atMeters);
      object.scale.setScalar(landmark.scale);
      object.rotation.y = landmark.x === 0 ? 0 : landmark.x > 0 ? -0.18 : 0.18;
      object.userData.atMeters = landmark.atMeters;
      object.userData.baseX = landmark.x;
      object.userData.baseY = 0;
      object.userData.landmark = landmark.kind;
      this.scene.add(object);
      this.forestProps.push(object);
    }
  }

  private createObstacles(): void {
    for (let index = 0; index < forestCourse01.obstacles.length; index += 1) {
      const authored = forestCourse01.obstacles[index];
      const object = this.artKit.createObstacle(authored.kind, 300 + index * 19);
      object.position.set(authored.lane * LANE_WIDTH, 0, PLAYER_Z - authored.atMeters);
      object.userData.atMeters = authored.atMeters;
      this.scene.add(object);
      this.obstacles.push({
        object,
        lane: authored.lane,
        consumed: false,
        atMeters: authored.atMeters,
        kind: authored.kind,
        response: authored.response,
      });
    }
  }

  private createCollectibles(): void {
    for (const trail of forestCourse01.collectibleTrails) {
      for (let index = 0; index < trail.count; index += 1) {
        const lane = trail.lanes[index % trail.lanes.length];
        const atMeters = trail.startMeters + index * trail.spacingMeters;
        const coin = this.artKit.createShellCoin();
        const arcProgress = trail.count <= 1 ? 0 : index / (trail.count - 1);
        const height = trail.height === "jump-arc" ? 1.45 + Math.sin(arcProgress * Math.PI) * 1.8 : 1.45;
        coin.position.set(lane * LANE_WIDTH, height, PLAYER_Z - atMeters);
        coin.userData.atMeters = atMeters;
        coin.userData.baseY = height;
        this.scene.add(coin);
        this.collectibles.push({ object: coin, lane, consumed: false, atMeters });
      }
    }
  }

  private createCharacters(): void {
    this.player.root.position.set(0, 0.2, PLAYER_Z);
    this.target.root.position.set(0, 0.2, -18.5);
    this.scene.add(this.player.root, this.target.root);

    this.playerShadow = this.createCharacterShadow(1.05, 0.32);
    this.playerShadow.position.set(0, 0.24, PLAYER_Z);
    this.scene.add(this.playerShadow);

    this.targetShadow = this.createCharacterShadow(0.82, 0.24);
    this.targetShadow.position.set(0, 0.23, -18.5);
    this.scene.add(this.targetShadow);

    void Promise.all([this.player.load(), this.target.load()])
      .then(() => {
        this.characterLoadState = "ready";
        this.updateAssetStatus();
      })
      .catch((error: unknown) => {
        this.characterLoadState = "error";
        this.updateAssetStatus();
        console.error("Character GLB loading failed", error);
      });
  }

  private createCharacterShadow(radius: number, opacity: number): THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial> {
    const material = new THREE.MeshBasicMaterial({
      color: 0x122016,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(radius, 24), material);
    shadow.rotation.x = -Math.PI / 2;
    return shadow;
  }

  private showLobby(): void {
    document.body.dataset.phase = "lobby";
    this.status.innerHTML = `
      <section class="adventure-lobby">
        <div class="lobby-sparkles" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
        <button class="audio-toggle" type="button" data-action="audio" aria-label="关闭声音"><svg viewBox="0 0 32 32"><path d="M7 13h5l6-5v16l-6-5H7v-6Z"/><path d="M22 12c2 2 2 6 0 8M25 9c4 4 4 10 0 14"/><path class="mute-line" d="m8 7 17 18"/></svg><span>声音</span></button>
        <article class="lobby-panel">
          <div class="lobby-ribbon"><span>CHAPTER ${forestLevel01.chapter}</span> 第一章 · 第一关</div>
          <div class="lobby-logo"><i>NL</i><span><small>NAILONG ADVENTURE</small><strong>奶龙历险记</strong></span></div>
          <div class="lobby-title"><span>FOREST MORNING</span><h1>晨雾<em>初追</em></h1></div>
          <p class="lobby-story">${forestLevel01.subtitle}</p>
          <div class="mission-cards">
            <div><i><svg viewBox="0 0 32 32"><path d="M7 24c6-1 6-15 18-16-1 12-8 17-18 16Z"/><path d="M9 22c5-5 8-7 14-11"/></svg></i><span><small>通关目标</small>抵达传送门</span></div>
            <div><i><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="10"/><path d="m16 10 2 4 5 .7-3.5 3.4.8 4.9-4.3-2.3-4.3 2.3.8-4.9L9 14.7l5-.7 2-4Z"/></svg></i><span><small>收集挑战</small>18 枚星贝</span></div>
            <div><i><svg viewBox="0 0 32 32"><path d="M8 22c3-8 5-12 8-12s5 4 8 12"/><path d="M11 22h10M16 10V6"/></svg></i><span><small>完美挑战</small>碰撞不超过 2 次</span></div>
          </div>
          <button class="cartoon-start" type="button" data-action="start">
            <span><small>READY?</small>开始追逐</span>
            <b><svg viewBox="0 0 32 32"><path d="m12 8 9 8-9 8"/></svg></b>
          </button>
          <div class="lobby-controls">
            <span><kbd>←</kbd><kbd>→</kbd> 换道</span><i></i>
            <span><kbd>↑</kbd> 跳跃</span><i></i><span><kbd>↓</kbd> 下滑</span>
          </div>
        </article>
        <div class="lobby-cast" aria-hidden="true">
          <div class="hero-burst"></div>
          <img class="lobby-nailong" src="${assetUrl("assets/characters/nailong-runner-card-v1.png")}" alt="" />
          <div class="target-bubble"><span>今日追逐目标</span><img src="${assetUrl("assets/characters/dongdongyao-runner-card-v1.png")}" alt="" /><strong>洞洞幺</strong><small>距离 86 m</small></div>
          <div class="speech-bubble">等等我！</div>
        </div>
        <div class="preview-note" data-asset-status></div>
      </section>
    `;
    this.updateAssetStatus();
    this.updateAudioButtons();
  }

  private updateAssetStatus(): void {
    const assetStatus = this.status.querySelector<HTMLElement>("[data-asset-status]");
    if (!assetStatus) return;
    assetStatus.textContent = this.characterLoadState === "ready"
      ? "开发版 3D 角色已加载 · 正式骨骼模型可直接替换 GLB"
      : this.characterLoadState === "error"
        ? "3D 角色加载失败 · 请检查本地资源"
        : "正在加载开发版 3D 角色…";
  }

  private updateAudioButtons(): void {
    const muted = this.audio.isMuted();
    this.status.querySelectorAll<HTMLButtonElement>(".audio-toggle").forEach((button) => {
      button.classList.toggle("is-muted", muted);
      button.setAttribute("aria-label", muted ? "开启声音" : "关闭声音");
      const label = button.querySelector("span");
      if (label) label.textContent = muted ? "已静音" : "声音";
    });
  }

  private beginCountdown(): void {
    if (!this.flow.beginCountdown()) return;
    this.runner.reset();
    this.distanceMeters = 0;
    this.coins = 0;
    this.hits = 0;
    this.chaseGapMeters = 86;
    this.currentSectionId = "misty-grove";
    this.resetCourseObjects();
    this.player.play("idle", true);
    this.target.play("idle", true);
    document.body.dataset.phase = "countdown";
    let count = 3;
    this.renderRunningUi(String(count));
    this.audio.play("countdown");
    this.countdownTimer = window.setInterval(() => {
      count -= 1;
      const countdown = this.status.querySelector<HTMLElement>("[data-countdown]");
      if (count > 0) {
        if (countdown) countdown.textContent = String(count);
        this.audio.play("countdown");
        return;
      }
      if (this.countdownTimer !== null) window.clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      this.flow.beginRun();
      document.body.dataset.phase = "running";
      this.player.play("running", true);
      this.target.play("running", true);
      if (countdown) countdown.textContent = "GO!";
      this.audio.play("start");
      window.setTimeout(() => countdown?.remove(), 650);
    }, 620);
  }

  private renderRunningUi(countdown: string): void {
    this.status.innerHTML = `
      <div class="hud-top">
        <div class="player-chip"><div class="avatar"><img src="${assetUrl("assets/characters/nailong-runner-card-v1.png")}" alt="" /></div><div><small>奶龙</small><strong>碰撞 <b data-hits>0</b> 次</strong></div><div class="hearts"><i></i><i></i><i></i></div></div>
        <div class="chase-panel"><div class="target-mini"><img src="${assetUrl("assets/characters/dongdongyao-runner-card-v1.png")}" alt="" /></div><span>追逐距离</span><strong><b data-gap>86</b> m</strong><div class="gap-track"><i data-gap-bar></i></div></div>
        <div class="score-panel"><span><svg viewBox="0 0 32 32"><circle cx="16" cy="16" r="11"/><path d="m16 9 2 5 5 .6-3.8 3.5 1 5-4.2-2.5-4.2 2.5 1-5L9 14.6l5-.6 2-5Z"/></svg>星贝 <b data-coins>0</b> / 18</span><strong><b data-distance>0</b> / ${forestLevel01.lengthMeters} m</strong></div>
      </div>
      <button class="audio-toggle audio-toggle--hud" type="button" data-action="audio" aria-label="关闭声音"><svg viewBox="0 0 32 32"><path d="M7 13h5l6-5v16l-6-5H7v-6Z"/><path d="M22 12c2 2 2 6 0 8M25 9c4 4 4 10 0 14"/><path class="mute-line" d="m8 7 17 18"/></svg></button>
      <div class="chapter-badge"><span>1 - 1</span><div><small>${forestLevel01.title}</small><strong data-section-title>晨雾林径</strong></div><i><b data-level-progress></b></i></div>
      <div class="lane-guide" aria-hidden="true"><i></i><i class="active"></i><i></i></div>
      <div class="countdown" data-countdown>${countdown}</div>
      <div class="touch-controls">
        <button type="button" data-action="left" aria-label="向左换道">←</button>
        <button type="button" data-action="jump" aria-label="跳跃">↑</button>
        <button type="button" data-action="slide" aria-label="滑行">↓</button>
        <button type="button" data-action="right" aria-label="向右换道">→</button>
      </div>
      <div class="swipe-hint">滑动屏幕换道、跳跃、下滑</div>
      <div class="motion-label" data-motion>奔跑中</div>
    `;
    this.updateAudioButtons();
  }

  private resetCourseObjects(): void {
    const centerX = courseCenterX(0);
    const centerY = courseHeight(0);
    for (const tile of this.movingTrack) {
      const atMeters = Number(tile.userData.atMeters);
      tile.position.set(courseCenterX(atMeters) - centerX, courseHeight(atMeters) - centerY, 8 - atMeters);
    }
    for (const prop of this.forestProps) {
      const atMeters = Number(prop.userData.atMeters);
      prop.position.set(
        Number(prop.userData.baseX) + courseCenterX(atMeters) - centerX,
        Number(prop.userData.baseY) + courseHeight(atMeters) - centerY,
        PLAYER_Z - atMeters,
      );
      prop.visible = true;
    }
    for (const obstacle of this.obstacles) {
      obstacle.object.position.set(
        obstacle.lane * LANE_WIDTH + courseCenterX(obstacle.atMeters) - centerX,
        courseHeight(obstacle.atMeters) - centerY,
        PLAYER_Z - obstacle.atMeters,
      );
      obstacle.object.rotation.set(0, 0, 0);
      obstacle.object.visible = true;
      obstacle.consumed = false;
    }
    for (const collectible of this.collectibles) {
      collectible.object.position.x = collectible.lane * LANE_WIDTH + courseCenterX(collectible.atMeters) - centerX;
      collectible.object.position.y = Number(collectible.object.userData.baseY) + courseHeight(collectible.atMeters) - centerY;
      collectible.object.position.z = PLAYER_Z - collectible.atMeters;
      collectible.object.visible = true;
      collectible.consumed = false;
    }
  }

  private readonly onStatusClick = (event: MouseEvent): void => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (action === "audio") {
      void this.audio.toggleMuted().then(() => this.updateAudioButtons());
      return;
    }
    if (action === "start") {
      void this.audio.unlock().then(() => this.audio.play("start"));
      this.beginCountdown();
    }
    if (action === "lobby") {
      this.audio.play("button");
      this.flow.returnToLobby();
      this.showLobby();
    }
    if (action === "left") this.performAction("left");
    if (action === "right") this.performAction("right");
    if (action === "jump") this.performAction("jump");
    if (action === "slide") this.performAction("slide");
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const key = event.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " ", "a", "d", "w", "s"].includes(key)) event.preventDefault();
    if (key === "arrowleft" || key === "a") this.performAction("left");
    if (key === "arrowright" || key === "d") this.performAction("right");
    if (key === "arrowup" || key === "w" || key === " ") this.performAction("jump");
    if (key === "arrowdown" || key === "s") this.performAction("slide");
  };

  private performAction(action: RunnerAction): void {
    const active = this.flow.currentPhase() === "running" || this.flow.currentPhase() === "chase";
    if (!active) return;
    let accepted = false;
    if (action === "left") accepted = this.runner.moveLane(-1);
    if (action === "right") accepted = this.runner.moveLane(1);
    if (action === "jump") accepted = this.runner.jump();
    if (action === "slide") accepted = this.runner.slide();
    if (accepted) this.audio.play(action);
  }

  private readonly resize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(width, height, false);
  };

  private update(stepSeconds: number): void {
    const active = this.flow.currentPhase() === "running" || this.flow.currentPhase() === "chase";
    this.runner.update(stepSeconds);
    const snapshot = this.runner.snapshot();
    this.player.play(snapshot.motion);
    this.target.play(this.flow.currentPhase() === "chase" ? "look_back" : this.flow.currentPhase() === "reward" ? "portal_escape" : active ? "running" : "idle");
    this.player.update(stepSeconds, this.elapsedSeconds);
    this.target.update(stepSeconds, this.elapsedSeconds);

    const speed = active ? forestLevel01.speedMetersPerSecond : 0;
    this.moveWorld(speed * stepSeconds, active);
    if (!active) return;

    this.distanceMeters += speed * stepSeconds;
    const chaseProgress = THREE.MathUtils.clamp(
      (this.distanceMeters - forestLevel01.chaseStartsAtMeters) /
        (forestLevel01.lengthMeters - forestLevel01.chaseStartsAtMeters),
      0,
      1,
    );
    this.chaseGapMeters = 86 - chaseProgress * 73;
    if (this.distanceMeters >= forestLevel01.chaseStartsAtMeters && this.flow.currentPhase() === "running") {
      this.flow.beginChase();
      document.body.dataset.phase = "chase";
    }
    if (this.distanceMeters >= forestLevel01.lengthMeters && this.flow.currentPhase() === "chase") {
      this.beginReward();
    }
  }

  private beginReward(): void {
    if (!this.flow.beginReward()) return;
    document.body.dataset.phase = "reward";
    this.audio.play("portal");
    this.target.play("portal_escape", true);
    this.status.insertAdjacentHTML("beforeend", `
      <div class="story-beat" data-story-beat>
        <small>追逐节点</small>
        <strong>洞洞幺启动了传送门！</strong>
        <span>已完成 ${forestLevel01.title}</span>
      </div>
    `);
    this.rewardTimer = window.setTimeout(() => this.finishLevel(), 1500);
  }

  private finishLevel(): void {
    this.rewardTimer = null;
    const result = evaluateLevel(forestLevel01, this.distanceMeters, this.coins, this.hits);
    if (!this.flow.endRun({
      distanceMeters: Math.floor(this.distanceMeters),
      coins: this.coins,
      fragments: 1,
      stars: result.stars,
      reason: "completed",
    })) return;

    document.body.dataset.phase = "result";
    this.audio.play("reward");
    this.player.play("celebrate", true);
    this.showResult(result.stars, result.completedObjectiveIds);
  }

  private showResult(stars: 1 | 2 | 3, completedObjectiveIds: string[]): void {
    const starText = `${"★".repeat(stars)}${"☆".repeat(3 - stars)}`;
    this.status.innerHTML = `
      <button class="audio-toggle audio-toggle--result" type="button" data-action="audio" aria-label="关闭声音"><svg viewBox="0 0 32 32"><path d="M7 13h5l6-5v16l-6-5H7v-6Z"/><path d="M22 12c2 2 2 6 0 8M25 9c4 4 4 10 0 14"/><path class="mute-line" d="m8 7 17 18"/></svg></button>
      <section class="result-card">
        <div class="hero-kicker"><span></span> 关卡完成</div>
        <div class="result-stars" aria-label="获得 ${stars} 星">${starText}</div>
        <h2>${forestLevel01.title}</h2>
        <div class="result-score"><span><b>${Math.floor(this.distanceMeters)}</b> 米</span><span><b>${this.coins}</b> 星贝</span><span><b>${this.hits}</b> 碰撞</span></div>
        <div class="result-objectives">
          ${forestLevel01.objectives.map((objective) => `
            <div class="${completedObjectiveIds.includes(objective.id) ? "complete" : ""}">
              <i>${completedObjectiveIds.includes(objective.id) ? "✓" : "·"}</i><span>${objective.label}</span>
            </div>
          `).join("")}
        </div>
        <div class="result-actions">
          <button class="start-button" type="button" data-action="start"><span>再玩一次</span><b>↻</b></button>
          <button class="secondary-button" type="button" data-action="lobby">返回关卡</button>
        </div>
      </section>
    `;
    this.updateAudioButtons();
  }

  private moveWorld(deltaZ: number, active: boolean): void {
    const currentCenterX = courseCenterX(this.distanceMeters);
    const currentHeight = courseHeight(this.distanceMeters);
    for (const tile of this.movingTrack) {
      const atMeters = Number(tile.userData.atMeters);
      const relativeMeters = atMeters - this.distanceMeters;
      tile.position.set(
        courseCenterX(atMeters) - currentCenterX,
        courseHeight(atMeters) - currentHeight,
        8 - relativeMeters,
      );
      tile.visible = relativeMeters > -16 && relativeMeters < 185;
    }
    for (const prop of this.forestProps) {
      const atMeters = Number(prop.userData.atMeters);
      const relativeMeters = atMeters - this.distanceMeters;
      prop.position.set(
        Number(prop.userData.baseX) + courseCenterX(atMeters) - currentCenterX,
        Number(prop.userData.baseY) + courseHeight(atMeters) - currentHeight,
        PLAYER_Z - relativeMeters,
      );
      prop.visible = relativeMeters > -28 && relativeMeters < 190;
      const wheel = prop.userData.animatedWheel as THREE.Object3D | undefined;
      const train = prop.userData.animatedTrain as THREE.Object3D | undefined;
      const portal = prop.userData.animatedPortal as THREE.Object3D | undefined;
      if (wheel) wheel.rotation.z -= deltaZ * 0.07;
      if (train) {
        const crossing = THREE.MathUtils.clamp((this.distanceMeters - 222) / 72, 0, 1);
        train.position.x = -3 + crossing * 21;
      }
      if (portal) portal.rotation.z += deltaZ * 0.025;
      const floaters = prop.userData.floaters as Array<{ object: THREE.Object3D; baseY: number; phase: number }> | undefined;
      if (floaters) {
        for (const floater of floaters) {
          floater.object.position.y = floater.baseY + Math.sin(this.elapsedSeconds * 2.4 + floater.phase) * 0.24;
          floater.object.rotation.y = Math.sin(this.elapsedSeconds * 1.3 + floater.phase) * 0.55;
        }
      }
    }

    const snapshot = this.runner.snapshot();
    for (const obstacle of this.obstacles) {
      const relativeMeters = obstacle.atMeters - this.distanceMeters;
      obstacle.object.position.set(
        obstacle.lane * LANE_WIDTH + courseCenterX(obstacle.atMeters) - currentCenterX,
        courseHeight(obstacle.atMeters) - currentHeight,
        PLAYER_Z - relativeMeters,
      );
      if (obstacle.kind === "rolling-log") {
        obstacle.object.position.x += Math.sin(this.elapsedSeconds * 1.65) * LANE_WIDTH * 0.9;
        obstacle.object.rotation.z -= deltaZ * 0.25;
      }
      obstacle.object.visible = relativeMeters > -8 && relativeMeters < 145;
      if (relativeMeters < -8) obstacle.consumed = true;
      const intersectsRunner = Math.abs(obstacle.object.position.z - PLAYER_Z) < 1.15
        && Math.abs(snapshot.x - obstacle.object.position.x) < 1.05;
      const avoided = obstacle.response === "jump"
        ? snapshot.y >= 0.78
        : obstacle.response === "slide"
          ? snapshot.motion === "sliding"
          : false;
      if (active && !obstacle.consumed && intersectsRunner && !avoided) {
        obstacle.consumed = true;
        if (this.runner.hit()) {
          this.hits += 1;
          this.audio.play("hit");
          document.body.classList.add("is-hit");
          window.setTimeout(() => document.body.classList.remove("is-hit"), 260);
        }
      }
    }

    for (const collectible of this.collectibles) {
      const relativeMeters = collectible.atMeters - this.distanceMeters;
      collectible.object.position.set(
        collectible.lane * LANE_WIDTH + courseCenterX(collectible.atMeters) - currentCenterX,
        Number(collectible.object.userData.baseY) + courseHeight(collectible.atMeters) - currentHeight,
        PLAYER_Z - relativeMeters,
      );
      collectible.object.rotation.y += 0.055;
      if (relativeMeters < -7) {
        collectible.object.visible = false;
        collectible.consumed = true;
      } else if (!collectible.consumed) {
        collectible.object.visible = relativeMeters < 145;
      }
      if (
        active &&
        !collectible.consumed &&
        Math.abs(collectible.object.position.z - PLAYER_Z) < 1.3 &&
        Math.abs(snapshot.x - collectible.object.position.x) < 1.05 &&
        Math.abs(1.7 + snapshot.y - collectible.object.position.y) < 1.7
      ) {
        collectible.consumed = true;
        collectible.object.visible = false;
        this.coins += 1;
        this.audio.play("coin");
      }
    }
  }

  private updateView(snapshot: RunnerSnapshot): void {
    const jumpY = snapshot.y;
    this.player.root.position.set(snapshot.x, 0.2 + jumpY, PLAYER_Z);
    this.playerShadow.position.x = snapshot.x;
    this.playerShadow.material.opacity = Math.max(0.08, 0.32 - jumpY * 0.09);
    this.playerShadow.scale.setScalar(Math.max(0.62, 1 - jumpY * 0.1));

    const chaseProgress = THREE.MathUtils.clamp(
      (this.distanceMeters - forestLevel01.chaseStartsAtMeters) /
        (forestLevel01.lengthMeters - forestLevel01.chaseStartsAtMeters),
      0,
      1,
    );
    const targetZ = THREE.MathUtils.lerp(-19.5, -10.8, chaseProgress);
    const visualTargetMeters = this.distanceMeters + THREE.MathUtils.lerp(34, 18, chaseProgress);
    const pathAheadX = courseCenterX(visualTargetMeters) - courseCenterX(this.distanceMeters);
    const pathAheadY = courseHeight(visualTargetMeters) - courseHeight(this.distanceMeters);
    const targetX = pathAheadX + Math.sin(this.elapsedSeconds * 0.72) * 1.25;
    this.target.root.position.set(targetX, 0.2 + pathAheadY, targetZ);
    this.targetShadow.position.set(targetX, 0.23 + pathAheadY, targetZ);
    this.target.root.rotation.y = this.flow.currentPhase() === "chase"
      ? Math.sin(this.elapsedSeconds * 1.8) * 0.14
      : 0;

    this.camera.position.x += (snapshot.x * 0.18 - this.camera.position.x) * 0.08;
    this.camera.position.y += (5.8 + jumpY * 0.08 - this.camera.position.y) * 0.08;
    const lookAheadX = courseCenterX(this.distanceMeters + 42) - courseCenterX(this.distanceMeters);
    const lookAheadY = courseHeight(this.distanceMeters + 42) - courseHeight(this.distanceMeters);
    this.camera.lookAt(snapshot.x * 0.12 + lookAheadX * 0.72, 1.55 + lookAheadY * 0.5, -17);
    const targetFov = this.flow.currentPhase() === "chase" ? 63 : snapshot.motion === "jumping" ? 60 : 58;
    this.camera.fov += (targetFov - this.camera.fov) * 0.06;
    this.camera.updateProjectionMatrix();
    document.body.dataset.motion = snapshot.motion;
    this.updateSectionPresentation();

    const laneDots = this.status.querySelectorAll<HTMLElement>(".lane-guide i");
    laneDots.forEach((dot, index) => dot.classList.toggle("active", index === snapshot.lane + 1));
    const distance = this.status.querySelector<HTMLElement>("[data-distance]");
    const coins = this.status.querySelector<HTMLElement>("[data-coins]");
    const hits = this.status.querySelector<HTMLElement>("[data-hits]");
    const gap = this.status.querySelector<HTMLElement>("[data-gap]");
    const gapBar = this.status.querySelector<HTMLElement>("[data-gap-bar]");
    const levelProgress = this.status.querySelector<HTMLElement>("[data-level-progress]");
    const motion = this.status.querySelector<HTMLElement>("[data-motion]");
    if (distance) distance.textContent = Math.floor(this.distanceMeters).toString();
    if (coins) coins.textContent = this.coins.toString();
    if (hits) hits.textContent = this.hits.toString();
    if (gap) gap.textContent = Math.ceil(this.chaseGapMeters).toString();
    if (gapBar) gapBar.style.width = `${Math.max(16, 100 - this.chaseGapMeters)}%`;
    if (levelProgress) levelProgress.style.width = `${Math.min(100, this.distanceMeters / forestLevel01.lengthMeters * 100)}%`;
    if (motion) motion.textContent = snapshot.motion === "jumping" ? "跃过障碍" : snapshot.motion === "sliding" ? "低姿滑行" : snapshot.motion === "hit" ? "受到撞击" : "追逐加速中";
  }

  private updateSectionPresentation(): void {
    const section = sectionAtDistance(forestCourse01, this.distanceMeters);
    const phase = this.flow.currentPhase();
    const active = phase === "running" || phase === "chase";
    if (active && section.id !== this.currentSectionId) {
      this.currentSectionId = section.id;
      this.announceSection(section.title, section.eventLabel);
    }

    document.body.dataset.section = section.id;
    const title = this.status.querySelector<HTMLElement>("[data-section-title]");
    if (title) title.textContent = section.title;
    const atmosphere = SECTION_ATMOSPHERE[section.id];
    if (this.scene.background instanceof THREE.Color) this.scene.background.lerp(new THREE.Color(atmosphere.sky), 0.025);
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.lerp(new THREE.Color(atmosphere.fog), 0.025);
    this.renderer.toneMappingExposure += (atmosphere.exposure - this.renderer.toneMappingExposure) * 0.025;
  }

  private announceSection(title: string, eventLabel: string): void {
    this.status.querySelector("[data-route-event]")?.remove();
    this.audio.play("section");
    if (this.sectionEventTimer !== null) window.clearTimeout(this.sectionEventTimer);
    this.status.insertAdjacentHTML("beforeend", `
      <div class="route-event" data-route-event>
        <small>进入新区域</small><strong>${title}</strong><span>${eventLabel}</span>
      </div>
    `);
    this.sectionEventTimer = window.setTimeout(() => {
      this.status.querySelector("[data-route-event]")?.remove();
      this.sectionEventTimer = null;
    }, 2600);
  }

  private readonly render = (timeMs: number): void => {
    this.elapsedSeconds = timeMs / 1000;
    this.clock.advance(timeMs, (stepSeconds) => this.update(stepSeconds));
    this.updateView(this.runner.snapshot());
    this.renderer.render(this.scene, this.camera);
    this.frameHandle = requestAnimationFrame(this.render);
  };
}
