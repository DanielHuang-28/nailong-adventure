import * as THREE from "three";
import type { ObstacleKind } from "../levels/forest-course-01";

export type ForestRoadStyle = "forest-earth" | "creek-planks" | "station-stone" | "bridge-wood" | "mine-stone";
export type ForestLandmark = "treehouse" | "watermill" | "station" | "bridge" | "portal";

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function toonGradient(): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array([42, 112, 188, 255]), 4, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

function pathTexture(style: ForestRoadStyle): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable");

  const palettes: Record<ForestRoadStyle, [string, string, string]> = {
    "forest-earth": ["#7c5634", "#a47a4b", "#415d2d"],
    "creek-planks": ["#9c6738", "#c18a4f", "#3c6440"],
    "station-stone": ["#77786d", "#aaa88f", "#5a6f48"],
    "bridge-wood": ["#80502f", "#ad7240", "#36573c"],
    "mine-stone": ["#4d5050", "#7b7260", "#2f5c58"],
  };
  const [base, highlight, moss] = palettes[style];
  context.fillStyle = base;
  context.fillRect(0, 0, 256, 256);
  const random = seeded(style.length * 971);

  if (style === "creek-planks" || style === "bridge-wood") {
    for (let y = 0; y < 256; y += 32) {
      context.fillStyle = y % 64 === 0 ? base : highlight;
      context.fillRect(0, y, 256, 30);
      context.strokeStyle = "rgba(44,25,14,.55)";
      context.lineWidth = 3;
      context.strokeRect(-2, y, 260, 31);
      for (let knot = 0; knot < 3; knot += 1) {
        context.beginPath();
        context.ellipse(random() * 256, y + 8 + random() * 15, 7, 3, 0, 0, Math.PI * 2);
        context.stroke();
      }
    }
  } else if (style === "station-stone" || style === "mine-stone") {
    for (let y = -20; y < 276; y += 42) {
      const offset = Math.floor(y / 42) % 2 === 0 ? -28 : 0;
      for (let x = offset; x < 256; x += 58) {
        context.fillStyle = random() > 0.5 ? highlight : base;
        context.strokeStyle = "rgba(35,34,28,.45)";
        context.lineWidth = 3;
        context.beginPath();
        context.roundRect(x + 2, y + 2, 52, 36, 8);
        context.fill();
        context.stroke();
      }
    }
  } else {
    for (let speck = 0; speck < 240; speck += 1) {
      context.globalAlpha = 0.15 + random() * 0.2;
      context.fillStyle = random() > 0.7 ? moss : highlight;
      const radius = 1 + random() * 5;
      context.beginPath();
      context.arc(random() * 256, random() * 256, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 1.6);
  return texture;
}

function tube(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Mesh {
  const curve = new THREE.CatmullRomCurve3(points);
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 14, radius, 9, false), material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class ForestArtKit {
  private readonly gradient = toonGradient();
  private readonly bark = new THREE.MeshToonMaterial({ color: 0x87502a, gradientMap: this.gradient });
  private readonly barkDark = new THREE.MeshToonMaterial({ color: 0x4f3022, gradientMap: this.gradient });
  private readonly moss = new THREE.MeshToonMaterial({ color: 0x64a83e, gradientMap: this.gradient });
  private readonly leafMaterials = [
    new THREE.MeshToonMaterial({ color: 0x2f9651, gradientMap: this.gradient }),
    new THREE.MeshToonMaterial({ color: 0x64b64e, gradientMap: this.gradient }),
    new THREE.MeshToonMaterial({ color: 0x94ca49, gradientMap: this.gradient }),
    new THREE.MeshToonMaterial({ color: 0xc2d951, gradientMap: this.gradient }),
  ];
  private readonly stone = new THREE.MeshToonMaterial({ color: 0x7d8780, gradientMap: this.gradient });
  private readonly stoneDark = new THREE.MeshToonMaterial({ color: 0x45545b, gradientMap: this.gradient });
  private readonly metal = new THREE.MeshToonMaterial({ color: 0x405766, gradientMap: this.gradient });
  private readonly brass = new THREE.MeshToonMaterial({ color: 0xe7a92f, gradientMap: this.gradient });
  private readonly crystal = new THREE.MeshToonMaterial({
    color: 0x62e9ff,
    emissive: 0x087b9e,
    emissiveIntensity: 1.5,
    gradientMap: this.gradient,
  });
  private readonly water = new THREE.MeshPhysicalMaterial({
    color: 0x48c6db,
    roughness: 0.18,
    transmission: 0.12,
    transparent: true,
    opacity: 0.82,
  });
  private readonly roadMaterials = new Map<ForestRoadStyle, THREE.MeshToonMaterial>();

  constructor(maxAnisotropy: number) {
    for (const style of ["forest-earth", "creek-planks", "station-stone", "bridge-wood", "mine-stone"] as const) {
      const texture = pathTexture(style);
      texture.anisotropy = maxAnisotropy;
      this.roadMaterials.set(style, new THREE.MeshToonMaterial({ map: texture, gradientMap: this.gradient }));
    }
  }

  createSkyDome(): THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> {
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x55bfe1) },
        horizonColor: { value: new THREE.Color(0xc8eee0) },
        sunColor: { value: new THREE.Color(0xffe69c) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 sunColor;
        varying vec3 vWorldPosition;
        void main() {
          vec3 direction = normalize(vWorldPosition);
          float heightMix = smoothstep(-0.08, 0.7, direction.y);
          float sun = pow(max(dot(direction, normalize(vec3(-0.35, 0.62, -0.7))), 0.0), 72.0);
          vec3 color = mix(horizonColor, topColor, heightMix) + sunColor * sun * 0.65;
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(245, 40, 20), material);
    sky.renderOrder = -10;
    return sky;
  }

  createLanternPost(): THREE.Group {
    const group = new THREE.Group();
    const post = tube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.04, 1.9, 0),
      new THREE.Vector3(0.38, 2.55, 0),
      new THREE.Vector3(0.72, 2.55, 0),
    ], 0.1, this.metal);
    group.add(post);
    const lamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.2, 0.52, 8),
      new THREE.MeshToonMaterial({ color: 0xffdf68, emissive: 0xff8a16, emissiveIntensity: 1.8, gradientMap: this.gradient }),
    );
    lamp.position.set(0.72, 2.28, 0);
    group.add(lamp);
    return group;
  }

  createRoadsideDecor(seed: number): THREE.Group {
    const random = seeded(seed);
    const group = new THREE.Group();
    const brightLeaves = [0x43ad55, 0x79c54c, 0xa7d84e].map((color) => new THREE.MeshToonMaterial({ color, gradientMap: this.gradient }));
    const flowerColors = [0xff6d9d, 0xffc84a, 0x8b7cff, 0x5edee8];
    for (let bushIndex = 0; bushIndex < 4; bushIndex += 1) {
      const bush = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42 + random() * 0.28, 2), brightLeaves[bushIndex % brightLeaves.length]);
      bush.position.set((bushIndex - 1.5) * 0.55, 0.36 + random() * 0.12, (random() - 0.5) * 0.9);
      bush.scale.set(1.25, 0.8, 1);
      bush.castShadow = true;
      group.add(bush);
    }
    for (let mushroomIndex = 0; mushroomIndex < 3; mushroomIndex += 1) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.38, 9), new THREE.MeshToonMaterial({ color: 0xffefc5, gradientMap: this.gradient }));
      stem.position.set(-0.65 + mushroomIndex * 0.62, 0.2, 0.48 + (mushroomIndex % 2) * 0.18);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.23, 16, 9, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshToonMaterial({ color: flowerColors[(seed + mushroomIndex) % flowerColors.length], gradientMap: this.gradient }));
      cap.position.set(stem.position.x, 0.42, stem.position.z);
      cap.scale.y = 0.65;
      group.add(stem, cap);
    }
    if (seed % 3 === 0) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 10), this.barkDark);
      post.position.set(1.2, 0.9, -0.2);
      const sign = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.62, 0.14), new THREE.MeshToonMaterial({ color: 0xffd164, gradientMap: this.gradient }));
      sign.position.set(0.88, 1.55, -0.2);
      sign.rotation.z = -0.08;
      group.add(post, sign);
    }
    return group;
  }

  createBuntingGate(seed: number): THREE.Group {
    const group = new THREE.Group();
    for (const x of [-5.6, 5.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.2, 10), this.barkDark);
      post.position.set(x, 2.1, 0);
      post.castShadow = true;
      group.add(post);
    }
    const rope = tube([
      new THREE.Vector3(-5.6, 3.8, 0),
      new THREE.Vector3(0, 3.25, 0),
      new THREE.Vector3(5.6, 3.8, 0),
    ], 0.028, this.barkDark);
    group.add(rope);
    const flagColors = [0xff5f7e, 0xffcf46, 0x48c9e8, 0x7bcf5b, 0x9b7cf2];
    for (let flagIndex = 0; flagIndex < 9; flagIndex += 1) {
      const flag = new THREE.Mesh(
        new THREE.ConeGeometry(0.27, 0.55, 3),
        new THREE.MeshToonMaterial({ color: flagColors[(seed + flagIndex) % flagColors.length], side: THREE.DoubleSide, gradientMap: this.gradient }),
      );
      const x = -4.7 + flagIndex * 1.18;
      flag.position.set(x, 3.31 + Math.abs(x) * 0.08, 0);
      flag.rotation.z = Math.PI;
      group.add(flag);
    }
    return group;
  }

  createButterflySwarm(seed: number): THREE.Group {
    const random = seeded(seed);
    const group = new THREE.Group();
    const floaters: Array<{ object: THREE.Object3D; baseY: number; phase: number }> = [];
    const colors = [0xff70a8, 0x69dff3, 0xffd84f, 0xa789ff];
    for (let index = 0; index < 7; index += 1) {
      const butterfly = new THREE.Group();
      const wingMaterial = new THREE.MeshToonMaterial({ color: colors[(seed + index) % colors.length], side: THREE.DoubleSide, gradientMap: this.gradient });
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.CircleGeometry(0.16 + random() * 0.07, 8, 0, Math.PI), wingMaterial);
        wing.position.x = side * 0.12;
        wing.rotation.set(0, side * 0.45, side * Math.PI / 2);
        butterfly.add(wing);
      }
      const baseY = 1.2 + random() * 2.2;
      butterfly.position.set((random() - 0.5) * 3.4, baseY, (random() - 0.5) * 2.5);
      group.add(butterfly);
      floaters.push({ object: butterfly, baseY, phase: random() * Math.PI * 2 });
    }
    group.userData.floaters = floaters;
    return group;
  }

  createShellCoin(): THREE.Group {
    const group = new THREE.Group();
    group.name = "shell-coin";
    const faceMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffc928,
      emissive: 0x9b5100,
      emissiveIntensity: 0.36,
      metalness: 0.42,
      roughness: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
    });
    const rimMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xffe86a,
      emissive: 0xbd6900,
      emissiveIntensity: 0.45,
      metalness: 0.5,
      roughness: 0.12,
      clearcoat: 1,
    });
    const shellMaterial = new THREE.MeshPhysicalMaterial({
      color: 0xfff09a,
      emissive: 0xe09616,
      emissiveIntensity: 0.34,
      metalness: 0.28,
      roughness: 0.2,
      clearcoat: 1,
    });

    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.18, 40, 1, false), faceMaterial);
    disc.rotation.x = Math.PI / 2;
    disc.castShadow = true;
    group.add(disc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.065, 12, 40), rimMaterial);
    rim.position.z = 0.105;
    rim.castShadow = true;
    group.add(rim);

    const shellBase = new THREE.Mesh(new THREE.SphereGeometry(0.16, 20, 12), shellMaterial);
    shellBase.scale.set(1.45, 0.72, 0.28);
    shellBase.position.set(0, -0.12, 0.145);
    group.add(shellBase);
    for (let index = 0; index < 5; index += 1) {
      const angle = THREE.MathUtils.degToRad(-48 + index * 24);
      const rib = new THREE.Mesh(new THREE.CapsuleGeometry(0.034, 0.25, 5, 10), shellMaterial);
      rib.rotation.z = -angle;
      rib.position.set(Math.sin(angle) * 0.15, -0.08 + Math.cos(angle) * 0.15, 0.15);
      group.add(rib);
    }
    const shine = new THREE.Mesh(new THREE.CircleGeometry(0.055, 16), new THREE.MeshBasicMaterial({ color: 0xffffe8, transparent: true, opacity: 0.86 }));
    shine.position.set(-0.24, 0.25, 0.16);
    group.add(shine);
    return group;
  }

  createRoadTile(style: ForestRoadStyle, length: number, index: number): THREE.Group {
    const tile = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(9.7, style === "bridge-wood" ? 0.42 : 0.3, length - 0.08), this.roadMaterials.get(style));
    deck.receiveShadow = true;
    tile.add(deck);

    const random = seeded(index * 719 + 31);
    for (const side of [-1, 1]) {
      const edge = new THREE.Group();
      edge.position.x = side * 5.08;
      for (let item = 0; item < 3; item += 1) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 + random() * 0.18, 1), item % 3 === 0 ? this.moss : this.stone);
        rock.position.set((random() - 0.5) * 0.22, 0.2, -length / 2 + 0.8 + item * (length - 1.6) / 2);
        rock.scale.set(1.25, 0.65 + random() * 0.35, 1);
        rock.rotation.set(random(), random() * Math.PI, random() * 0.3);
        rock.castShadow = true;
        edge.add(rock);
      }
      tile.add(edge);
    }

    if (style === "station-stone") {
      for (const z of [-1.35, 1.35]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(10.4, 0.08, 0.1), this.metal);
        rail.position.set(0, 0.22, z);
        tile.add(rail);
      }
    }
    if (style === "bridge-wood") {
      for (const x of [-5, 5]) {
        const rope = tube([
          new THREE.Vector3(x, 1.2, -length / 2),
          new THREE.Vector3(x, 0.78, 0),
          new THREE.Vector3(x, 1.2, length / 2),
        ], 0.035, this.barkDark);
        tile.add(rope);
      }
    }
    return tile;
  }

  createWaterRibbon(width: number, length: number): THREE.Group {
    const group = new THREE.Group();
    const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, length, 8, 24), this.water);
    surface.rotation.x = -Math.PI / 2;
    surface.position.y = 0.02;
    surface.receiveShadow = true;
    group.add(surface);
    for (const side of [-1, 1]) {
      for (let rockIndex = 0; rockIndex < 12; rockIndex += 1) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.34 + (rockIndex % 3) * 0.08, 1), rockIndex % 4 === 0 ? this.moss : this.stone);
        rock.position.set(side * width * 0.48, 0.15, -length / 2 + 4 + rockIndex * (length - 8) / 11);
        rock.scale.set(1.4, 0.65, 1);
        rock.castShadow = true;
        group.add(rock);
      }
    }
    return group;
  }

  createOrganicTree(seed: number, scale = 1): THREE.Group {
    const random = seeded(seed);
    const tree = new THREE.Group();
    const height = (4.6 + random() * 2.1) * scale;
    const lean = (random() - 0.5) * 0.65 * scale;
    tree.add(tube([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(lean * 0.25, height * 0.34, 0.08),
      new THREE.Vector3(lean, height * 0.7, -0.14),
      new THREE.Vector3(lean * 1.15, height, 0),
    ], 0.34 * scale, this.bark));

    for (let branch = 0; branch < 3; branch += 1) {
      const angle = random() * Math.PI * 2;
      const y = height * (0.52 + branch * 0.13);
      const reach = (1.2 + random() * 0.8) * scale;
      tree.add(tube([
        new THREE.Vector3(lean * y / height, y, 0),
        new THREE.Vector3(Math.cos(angle) * reach * 0.55, y + 0.4 * scale, Math.sin(angle) * reach * 0.55),
        new THREE.Vector3(Math.cos(angle) * reach, y + 0.65 * scale, Math.sin(angle) * reach),
      ], 0.12 * scale, this.bark));
    }

    for (let crown = 0; crown < 7; crown += 1) {
      const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry((0.82 + random() * 0.48) * scale, 2), this.leafMaterials[(seed + crown) % this.leafMaterials.length]);
      const angle = random() * Math.PI * 2;
      const radius = random() * 1.35 * scale;
      foliage.position.set(lean + Math.cos(angle) * radius, height * (0.72 + random() * 0.25), Math.sin(angle) * radius);
      foliage.scale.set(1.2, 0.85 + random() * 0.3, 1);
      foliage.rotation.set(random(), random(), random());
      foliage.castShadow = true;
      tree.add(foliage);
    }
    return tree;
  }

  createLandmark(kind: ForestLandmark): THREE.Group {
    if (kind === "treehouse") return this.createTreehouse();
    if (kind === "watermill") return this.createWatermill();
    if (kind === "station") return this.createStation();
    if (kind === "bridge") return this.createBridgeGate();
    return this.createPortal();
  }

  createObstacle(kind: ObstacleKind, seed: number): THREE.Group {
    const group = new THREE.Group();
    if (kind === "fallen-log" || kind === "rolling-log") {
      const log = tube([
        new THREE.Vector3(-1.25, 0.65, 0),
        new THREE.Vector3(0, 0.74, 0.08),
        new THREE.Vector3(1.25, 0.62, -0.03),
      ], kind === "rolling-log" ? 0.56 : 0.43, this.bark);
      log.rotation.z = 0.03;
      group.add(log);
      for (const x of [-0.72, 0.55]) {
        const moss = new THREE.Mesh(new THREE.IcosahedronGeometry(0.23, 1), this.moss);
        moss.position.set(x, 0.98, 0);
        moss.scale.set(1.7, 0.45, 0.8);
        group.add(moss);
      }
    } else if (kind === "root-arch") {
      group.add(tube([
        new THREE.Vector3(-1.4, 0, 0),
        new THREE.Vector3(-0.85, 2.25, 0.08),
        new THREE.Vector3(0, 2.75, -0.08),
        new THREE.Vector3(0.85, 2.25, 0.08),
        new THREE.Vector3(1.4, 0, 0),
      ], 0.24, this.bark));
      for (let vine = -1; vine <= 1; vine += 1) {
        const strand = tube([
          new THREE.Vector3(vine * 0.48, 2.55, 0),
          new THREE.Vector3(vine * 0.45 + 0.08, 2.05, 0.05),
          new THREE.Vector3(vine * 0.5, 1.68, 0),
        ], 0.035, this.moss);
        group.add(strand);
      }
    } else if (kind === "mine-cart") {
      const cart = new THREE.Mesh(new THREE.BoxGeometry(2.15, 1.1, 1.45, 2, 1, 2), this.metal);
      cart.position.y = 0.85;
      cart.rotation.z = -0.04;
      cart.castShadow = true;
      group.add(cart);
      for (const x of [-0.72, 0.72]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 10, 20), this.brass);
        wheel.position.set(x, 0.36, 0.76);
        group.add(wheel);
      }
      for (let crystal = 0; crystal < 5; crystal += 1) {
        const shard = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.75, 6), this.crystal);
        shard.position.set(-0.7 + crystal * 0.35, 1.55, (crystal % 2 - 0.5) * 0.4);
        shard.rotation.z = (crystal - 2) * 0.12;
        group.add(shard);
      }
    } else {
      const random = seeded(seed);
      for (let rockIndex = 0; rockIndex < 5; rockIndex += 1) {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5 + random() * 0.3, 1), rockIndex === 0 ? this.moss : this.stone);
        rock.position.set((random() - 0.5) * 1.8, 0.45 + random() * 0.3, (random() - 0.5) * 0.5);
        rock.scale.set(1, 0.7 + random() * 0.6, 1);
        rock.castShadow = true;
        group.add(rock);
      }
    }
    return group;
  }

  private createTreehouse(): THREE.Group {
    const group = new THREE.Group();
    const tree = this.createOrganicTree(91, 1.75);
    group.add(tree);
    const platform = new THREE.Mesh(new THREE.CylinderGeometry(3.1, 3.4, 0.36, 18), this.barkDark);
    platform.position.y = 6.2;
    platform.castShadow = true;
    group.add(platform);
    const cabin = new THREE.Mesh(new THREE.CylinderGeometry(1.85, 2.05, 2.25, 10), this.bark);
    cabin.position.y = 7.5;
    cabin.castShadow = true;
    group.add(cabin);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.65, 1.45, 10), new THREE.MeshToonMaterial({ color: 0x318ca0, gradientMap: this.gradient }));
    roof.position.y = 9.15;
    group.add(roof);
    return group;
  }

  private createWatermill(): THREE.Group {
    const group = new THREE.Group();
    const house = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.6, 4.4), this.bark);
    house.position.y = 1.8;
    house.castShadow = true;
    group.add(house);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.2, 2.1, 4), new THREE.MeshToonMaterial({ color: 0x318b91, gradientMap: this.gradient }));
    roof.position.y = 4.5;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.35, 0.22, 12, 36), this.barkDark);
    wheel.add(rim);
    for (let spoke = 0; spoke < 12; spoke += 1) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.13, 4.45, 0.13), this.bark);
      beam.rotation.z = spoke * Math.PI / 12;
      wheel.add(beam);
    }
    wheel.position.set(-3.15, 2.25, 0);
    group.add(wheel);
    const cascade = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 5.4, 10, 10), this.water);
    cascade.position.set(-5.3, 3, -1.2);
    cascade.rotation.y = Math.PI / 2;
    group.add(cascade);
    group.userData.animatedWheel = wheel;
    return group;
  }

  private createStation(): THREE.Group {
    const group = new THREE.Group();
    const building = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.5, 4.8), new THREE.MeshToonMaterial({ color: 0xd97b3d, gradientMap: this.gradient }));
    building.position.y = 1.75;
    building.castShadow = true;
    group.add(building);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(5.1, 2.2, 4), new THREE.MeshToonMaterial({ color: 0x337f91, gradientMap: this.gradient }));
    roof.position.y = 4.55;
    roof.rotation.y = Math.PI / 4;
    group.add(roof);
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.15, 32), new THREE.MeshToonMaterial({ color: 0xffe8a2, emissive: 0x5b3a08, emissiveIntensity: 0.35, gradientMap: this.gradient }));
    clock.rotation.x = Math.PI / 2;
    clock.position.set(0, 4.35, 2.48);
    group.add(clock);
    const train = new THREE.Group();
    const boiler = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 3.1, 20), new THREE.MeshToonMaterial({ color: 0xdf493b, gradientMap: this.gradient }));
    boiler.rotation.z = Math.PI / 2;
    boiler.position.y = 1.15;
    train.add(boiler);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.48, 1.3, 16), this.metal);
    chimney.position.set(0.85, 2.05, 0);
    train.add(chimney);
    train.position.set(-9, 0, 3.6);
    group.add(train);
    group.userData.animatedTrain = train;
    return group;
  }

  private createBridgeGate(): THREE.Group {
    const group = new THREE.Group();
    for (const x of [-5.2, 5.2]) {
      const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.58, 5.8, 10), this.barkDark);
      tower.position.set(x, 2.9, 0);
      tower.castShadow = true;
      group.add(tower);
    }
    const arch = tube([
      new THREE.Vector3(-5.2, 5.2, 0),
      new THREE.Vector3(0, 7.2, 0),
      new THREE.Vector3(5.2, 5.2, 0),
    ], 0.24, this.barkDark);
    group.add(arch);
    return group;
  }

  private createPortal(): THREE.Group {
    const group = new THREE.Group();
    for (let rockIndex = 0; rockIndex < 13; rockIndex += 1) {
      const angle = Math.PI * (rockIndex / 12);
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9 + (rockIndex % 3) * 0.18, 1), rockIndex % 4 === 0 ? this.moss : this.stoneDark);
      rock.position.set(Math.cos(angle) * 4.7, Math.sin(angle) * 5.1, 0);
      rock.scale.set(1.25, 1.15, 1.4);
      rock.rotation.set(angle, rockIndex, angle * 0.3);
      rock.castShadow = true;
      group.add(rock);
    }
    const portal = new THREE.Mesh(new THREE.TorusGeometry(3.35, 0.34, 18, 64), this.crystal);
    portal.position.y = 0.1;
    group.add(portal);
    const glow = new THREE.PointLight(0x56eaff, 18, 24, 2);
    glow.position.set(0, 3, 1);
    group.add(glow);
    group.userData.animatedPortal = portal;
    return group;
  }
}

