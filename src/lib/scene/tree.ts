/**
 * The 3D tree that grows out of the timer dial on /timer (three.js).
 *
 * - Procedural: branches and leaves come from a seeded random walk, so there are no model
 *   files and each day gets its own tree shape.
 * - It grows with the focus session (`progress` 0..1). Breaks keep the full tree.
 * - Dark theme: leaves and fireflies glow (the --glow / --firefly tokens). Light theme: matte
 *   clay, no glow. Glow is only for live things: pausing dims it.
 * - Kept light like the ambient scenes: at most 30 fps, capped pixel ratio, nothing drawn while
 *   the tab is hidden or the tree is off screen, one still frame when motion is off.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
  WebGLRenderer,
} from 'three';

export type TreeMode = 'idle' | 'running' | 'paused' | 'break';

export interface TreeOptions {
  dark: boolean;
  /** --glow and --firefly as CSS colours. */
  glow: string;
  firefly: string;
  /** Animate at all (false: one still frame per change). */
  motion: boolean;
  /** Where the trunk's base sits, as a fraction of the canvas height from the bottom (just under the dial's edge). */
  base: number;
}

export interface TreeState {
  /** How far the focus session is, 0..1. */
  progress: number;
  mode: TreeMode;
}

export interface Tree {
  update(state: TreeState): void;
  setLook(options: Partial<TreeOptions>): void;
  destroy(): void;
}

const FRAME_MS = 1000 / 30;
const MAX_DPR = 1.75;
/** The smallest tree: a sprout, so an idle timer still shows something. */
const SPROUT = 0.05;
/** How bright the glow is in each mode. */
const GLOW: Record<TreeMode, number> = { idle: 0.4, running: 1, paused: 0.25, break: 0.6 };
/** Height of a fully grown tree with its leaves, in scene units. */
const TREE_HEIGHT = 3.4;

interface Segment {
  start: Vector3;
  dir: Vector3;
  len: number;
  rad: number;
  birth: number;
}
interface Leaf {
  pos: Vector3;
  birth: number;
  size: number;
}
interface Firefly {
  r: number;
  h: number;
  speed: number;
  phase: number;
  /** Shows once the session is this far along. */
  at: number;
}

function seeded(seed: number): () => number {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Branches grow level by level; leaves open just after the twig they sit on. */
function growTree(rand: () => number): { segments: Segment[]; leaves: Leaf[] } {
  const segments: Segment[] = [];
  const leaves: Leaf[] = [];
  const up = new Vector3(0, 1, 0);
  const branch = (start: Vector3, dir: Vector3, len: number, rad: number, depth: number, birth: number) => {
    segments.push({ start, dir, len, rad, birth });
    const end = start.clone().addScaledVector(dir, len);
    // Twigs get three leaves; the level above gets one early leaf, so the tree is green by mid-session.
    if (depth <= 1) {
      for (let k = 0; k < (depth === 0 ? 3 : 1); k++) {
        const jitter = new Vector3(rand() - 0.5, rand() * 0.4 - 0.1, rand() - 0.5).multiplyScalar(0.5);
        leaves.push({ pos: end.clone().add(jitter), birth: birth + 0.1 + rand() * 0.08, size: 0.8 + rand() * 0.6 });
      }
      if (depth === 0) return;
    }
    const children = depth === 4 ? 3 : 2;
    for (let i = 0; i < children; i++) {
      const axis = new Vector3(rand() - 0.5, 0, rand() - 0.5).normalize();
      const next = dir
        .clone()
        .applyAxisAngle(axis, 0.45 + rand() * 0.35)
        .lerp(up, 0.25)
        .normalize();
      branch(end, next, len * 0.74, rad * 0.64, depth - 1, birth + 0.13);
    }
  };
  branch(new Vector3(0, 0, 0), up.clone(), 0.95, 0.13, 4, 0);
  return { segments, leaves };
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (v: number) => 1 - Math.pow(1 - v, 3);

/** Returns null if WebGL can't start (the caller just leaves the plain dial). */
export function createTree(canvas: HTMLCanvasElement, initial: TreeOptions, seed: number): Tree | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);

  let opts = { ...initial };
  const rand = seeded(seed);
  const { segments, leaves } = growTree(rand);

  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 40);
  const pivot = new Group();
  scene.add(pivot);

  const glowColor = new Color();
  const fireflyColor = new Color();
  const bark = { dark: new MeshStandardMaterial({ color: 0x4a6d58, roughness: 0.9, emissive: 0x16382a, emissiveIntensity: 0.8 }), light: new MeshLambertMaterial({ color: 0xb08a68 }) };
  const leafMat = {
    dark: new MeshStandardMaterial({ color: 0x3fbf86, emissive: 0x8dffc8, emissiveIntensity: 0.55, roughness: 0.6, flatShading: true }),
    light: new MeshLambertMaterial({ color: 0x86b494, flatShading: true }),
  };

  const up = new Vector3(0, 1, 0);
  const segGeos = segments.map((s) => {
    const g = new CylinderGeometry(s.rad * 0.64, s.rad, 1, 7);
    g.translate(0, 0.5, 0); // grow from the base, not the middle
    return g;
  });
  const segMeshes = segments.map((s, i) => {
    const m = new Mesh(segGeos[i]);
    m.position.copy(s.start);
    m.quaternion.setFromUnitVectors(up, s.dir);
    pivot.add(m);
    return m;
  });
  const leafGeo = new IcosahedronGeometry(0.19, 0);
  const leafMeshes = leaves.map((l) => {
    const m = new Mesh(leafGeo);
    m.position.copy(l.pos);
    m.rotation.set(rand() * 3, rand() * 3, 0);
    pivot.add(m);
    return m;
  });

  const tex = glowTexture();
  const halos = leaves.map((l) => {
    const s = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    s.position.copy(l.pos);
    s.scale.setScalar(1.05 * l.size);
    pivot.add(s);
    return s;
  });
  const flies = Array.from({ length: 22 }, (_, i): [Sprite, Firefly] => {
    const s = new Sprite(new SpriteMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true }));
    s.scale.setScalar(0.22);
    pivot.add(s);
    return [s, { r: 0.9 + rand() * 1.3, h: 0.4 + rand() * 2.4, speed: 0.2 + rand() * 0.4, phase: rand() * 6.3, at: i / 22 }];
  });

  const hemi = new HemisphereLight(0xffffff, 0x223322, 0.35);
  const sun = new DirectionalLight(0xffffff, 0.25);
  sun.position.set(3, 5, 4);
  const core = new PointLight(0x8dffc8, 1.3, 6);
  core.position.set(0, 2, 0.5);
  scene.add(hemi, sun, core);

  function applyLook(): void {
    const dark = opts.dark;
    glowColor.set(opts.glow || '#8dffc8');
    fireflyColor.set(opts.firefly || '#ffd27a');
    segMeshes.forEach((m) => (m.material = dark ? bark.dark : bark.light));
    leafMeshes.forEach((m) => (m.material = dark ? leafMat.dark : leafMat.light));
    leafMat.dark.emissive.copy(glowColor);
    halos.forEach((h) => h.material.color.copy(glowColor));
    flies.forEach(([s]) => s.material.color.copy(fireflyColor));
    core.color.copy(glowColor);
    hemi.intensity = dark ? 0.35 : 1.05;
    sun.intensity = dark ? 0.25 : 0.8;
  }

  // Shown values ease towards the targets, so a restart or a pause never jumps.
  let target: TreeState = { progress: 0, mode: 'idle' };
  let shownProgress = SPROUT;
  let shownGlow = GLOW.idle;
  let time = rand() * 100;

  function draw(): void {
    const p = Math.max(SPROUT, shownProgress);
    const dark = opts.dark;
    segments.forEach((s, i) => {
      const g = Math.max(easeOut(clamp01((p - s.birth) / 0.2)), 0.001);
      segMeshes[i]!.visible = g > 0.001;
      segMeshes[i]!.scale.set(g, s.len * g, g);
    });
    leaves.forEach((l, i) => {
      const g = easeOut(clamp01((p - l.birth) / 0.16));
      leafMeshes[i]!.visible = g > 0;
      leafMeshes[i]!.scale.setScalar(Math.max(g * l.size, 0.001));
      const pulse = opts.motion ? 0.7 + 0.3 * Math.sin(time * 2 + i) : 0.85;
      halos[i]!.visible = dark && g > 0;
      halos[i]!.material.opacity = 0.6 * g * pulse * shownGlow;
    });
    leafMat.dark.emissiveIntensity = 0.55 * shownGlow;
    core.intensity = dark ? 1.3 * shownGlow * p : 0;
    for (const [s, f] of flies) {
      const on = dark && p > f.at;
      s.visible = on;
      if (!on) continue;
      const a = f.phase + time * f.speed;
      s.position.set(Math.cos(a) * f.r, f.h + Math.sin(time * 1.3 + f.phase) * 0.2, Math.sin(a) * f.r);
      s.material.opacity = (opts.motion ? 0.5 + 0.5 * Math.sin(time * 3 + f.phase * 4) : 0.7) * shownGlow;
    }
    pivot.rotation.y = opts.motion ? time * 0.12 : 0.5;
    renderer.render(scene, camera);
  }

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Frame the grown tree (about TREE_HEIGHT tall) in the space above opts.base.
    const base = Math.min(0.6, Math.max(0, opts.base || 0.35));
    const view = TREE_HEIGHT / ((1 - base) * 0.95);
    const centre = view / 2 - base * view;
    camera.position.set(0, centre + 0.5, view / 2 / Math.tan((camera.fov * Math.PI) / 360));
    camera.lookAt(0, centre, 0);
    camera.updateProjectionMatrix();
  }

  let onScreen = true;
  let raf = 0;
  let last = 0;
  let lastFrame = 0;
  let lost = false;
  const animating = () => opts.motion && onScreen && document.visibilityState === 'visible' && !lost;

  function settle(): void {
    shownProgress = Math.max(SPROUT, target.progress);
    shownGlow = GLOW[target.mode];
  }

  function frame(now: number): void {
    raf = 0;
    if (!animating()) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS - 2) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    lastFrame = now;
    const k = 1 - Math.exp(-dt * 2.5);
    shownProgress += (Math.max(SPROUT, target.progress) - shownProgress) * k;
    shownGlow += (GLOW[target.mode] - shownGlow) * k;
    time += dt * (target.mode === 'running' ? 1 : 0.6);
    draw();
  }

  function start(): void {
    if (raf || !animating()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function still(): void {
    if (lost) return;
    settle();
    resize();
    draw();
  }

  const sizer = new ResizeObserver(() => {
    resize();
    if (!animating()) still();
  });
  sizer.observe(canvas);
  const seen = new IntersectionObserver((entries) => {
    onScreen = entries.some((e) => e.isIntersecting);
    start();
  });
  seen.observe(canvas);
  const onVisibility = () => start();
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);

  applyLook();
  still();
  start();

  return {
    update(state) {
      target = { progress: clamp01(state.progress), mode: state.mode };
      if (animating()) start();
      else still();
    },
    setLook(next) {
      opts = { ...opts, ...next };
      applyLook();
      resize();
      if (animating()) start();
      else still();
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      segGeos.forEach((g) => g.dispose());
      leafGeo.dispose();
      tex.dispose();
      [bark.dark, bark.light, leafMat.dark, leafMat.light].forEach((m) => m.dispose());
      halos.forEach((h) => h.material.dispose());
      flies.forEach(([s]) => s.material.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
