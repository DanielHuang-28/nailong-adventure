import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { RunnerMotionState } from "../gameplay/runner-controller";
import { assetUrl } from "../asset-url";

export type CharacterMotion = RunnerMotionState | "idle" | "celebrate" | "look_back" | "portal_escape";

export interface CharacterAssetDefinition {
  id: "nailong" | "dongdongyao";
  url: string;
  targetHeightMeters: number;
}

const CLIP_ALIASES: Record<CharacterMotion, string[]> = {
  idle: ["idle"],
  running: ["run", "running"],
  jumping: ["jump_loop", "jump", "jump_start"],
  sliding: ["slide", "sliding"],
  hit: ["hit"],
  celebrate: ["celebrate"],
  look_back: ["look_back", "lookback"],
  portal_escape: ["portal_escape", "escape"],
};

function characterToonGradient(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([48, 118, 194, 255]), 4, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

export class CharacterActor {
  readonly root = new THREE.Group();
  private readonly motionRoot = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private activeAction: THREE.AnimationAction | null = null;
  private clips: THREE.AnimationClip[] = [];
  private motion: CharacterMotion = "idle";
  private loaded = false;

  constructor(private readonly definition: CharacterAssetDefinition) {
    this.root.name = `${definition.id}-actor`;
    this.motionRoot.name = `${definition.id}-motion`;
    this.root.add(this.motionRoot);
  }

  async load(): Promise<void> {
    const gltf = await new GLTFLoader().loadAsync(this.definition.url);
    const visual = gltf.scene;
    visual.name = `${this.definition.id}-visual`;
    const gradientMap = characterToonGradient();
    const materialCache = new Map<THREE.Material, THREE.Material>();
    const toToon = (source: THREE.Material): THREE.Material => {
      const cached = materialCache.get(source);
      if (cached) return cached;
      if (!(source instanceof THREE.MeshStandardMaterial)) return source;
      const toon = new THREE.MeshToonMaterial({
        name: `${source.name}-toon`,
        color: source.color,
        map: source.map,
        emissive: source.emissive,
        emissiveMap: source.emissiveMap,
        emissiveIntensity: source.emissiveIntensity,
        normalMap: source.normalMap,
        transparent: source.transparent,
        opacity: source.opacity,
        alphaTest: source.alphaTest,
        side: source.side,
        vertexColors: source.vertexColors,
        gradientMap,
      });
      materialCache.set(source, toon);
      return toon;
    };
    visual.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.material = Array.isArray(object.material)
        ? object.material.map(toToon)
        : toToon(object.material);
      object.castShadow = true;
      object.receiveShadow = true;
      object.frustumCulled = true;
    });
    for (const source of materialCache.keys()) source.dispose();

    const sourceBounds = new THREE.Box3().setFromObject(visual);
    const sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (sourceSize.y <= 0) throw new Error(`${this.definition.id} has invalid bounds`);
    visual.scale.setScalar(this.definition.targetHeightMeters / sourceSize.y);

    const normalizedBounds = new THREE.Box3().setFromObject(visual);
    const center = normalizedBounds.getCenter(new THREE.Vector3());
    visual.position.set(-center.x, -normalizedBounds.min.y, -center.z);
    this.motionRoot.add(visual);

    this.clips = gltf.animations;
    if (this.clips.length > 0) this.mixer = new THREE.AnimationMixer(visual);
    this.loaded = true;
    this.play("idle", true);
  }

  play(motion: CharacterMotion, immediate = false): void {
    if (this.motion === motion && !immediate) return;
    this.motion = motion;
    if (!this.mixer) return;

    const aliases = CLIP_ALIASES[motion];
    const clip = this.clips.find((candidate) => aliases.includes(candidate.name.toLowerCase()));
    if (!clip) return;

    const nextAction = this.mixer.clipAction(clip);
    nextAction.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (this.activeAction && this.activeAction !== nextAction) {
      this.activeAction.crossFadeTo(nextAction, immediate ? 0 : 0.16, true);
    }
    this.activeAction = nextAction;
  }

  update(deltaSeconds: number, elapsedSeconds: number): void {
    this.mixer?.update(deltaSeconds);
    if (!this.loaded || this.mixer) return;

    const runPhase = elapsedSeconds * (this.definition.id === "nailong" ? 10.5 : 12.5);
    const bob = Math.abs(Math.sin(runPhase)) * 0.075;
    const lean = Math.sin(runPhase) * 0.035;
    this.motionRoot.position.y = this.motion === "running" || this.motion === "look_back" ? bob : 0;
    this.motionRoot.rotation.z = this.motion === "running" ? lean : 0;
    this.motionRoot.rotation.x += ((this.motion === "sliding" ? -0.42 : 0) - this.motionRoot.rotation.x) * 0.22;
    const targetScaleY = this.motion === "sliding" ? 0.72 : 1;
    this.motionRoot.scale.y += (targetScaleY - this.motionRoot.scale.y) * 0.22;
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => material.dispose());
    });
  }
}

export const NAILONG_DEVELOPMENT_ASSET: CharacterAssetDefinition = {
  id: "nailong",
  url: assetUrl("assets/characters/models/nailong-development.glb"),
  targetHeightMeters: 3.15,
};

export const DONGDONGYAO_DEVELOPMENT_ASSET: CharacterAssetDefinition = {
  id: "dongdongyao",
  url: assetUrl("assets/characters/models/dongdongyao-development.glb"),
  targetHeightMeters: 2.55,
};

