/**
 * Sprig in 3D on the Grove tab (three.js): the model for the user's focus stage, made in
 * Blender by art/sprig/sprig3d.py and served from public/sprig/sprig-<stage>.glb.
 *
 * - It sways slowly from side to side, so the face always stays in view; dragging turns it.
 * - Kept light like the focus tree: at most 30 fps, capped pixel ratio, nothing drawn while the
 *   tab is hidden or Sprig is off screen, one still frame when motion is off.
 */
import { ACESFilmicToneMapping, Box3, DirectionalLight, Group, Mesh, PerspectiveCamera, PMREMGenerator, Scene, SRGBColorSpace, Texture, Vector3, WebGLRenderer } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface Sprig3D {
  destroy(): void;
}

const FRAME_MS = 1000 / 30;
const MAX_DPR = 1.75;
/** How far it sways each way (radians) and how long one sway takes (seconds). */
const SWAY = 0.6;
const SWAY_S = 9;

/** Resolves once the model is in place (or null when WebGL or the file isn't available). */
export async function createSprig3D(canvas: HTMLCanvasElement, src: string, motion: boolean): Promise<Sprig3D | null> {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return null;
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  // A soft room for the gold and crystal to reflect, plus a warm key light for shape.
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  const key = new DirectionalLight(0xfff1dc, 1.6);
  key.position.set(-3, 5, 6);
  scene.add(key);

  let gltf;
  try {
    gltf = await new GLTFLoader().loadAsync(src);
  } catch {
    pmrem.dispose();
    env.dispose();
    renderer.dispose();
    return null;
  }

  // Centre the model on its base, so it turns around its own trunk.
  const model = gltf.scene;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  model.position.set(-centre.x, -box.min.y, -centre.z);
  const pivot = new Group();
  pivot.add(model);
  scene.add(pivot);

  const camera = new PerspectiveCamera(30, 1, 0.1, 100);

  function resize(): void {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_DPR));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Fit the whole model (wide ones like the Grove by width), from slightly above.
    const half = (camera.fov * Math.PI) / 360;
    const reach = Math.max(size.y / 2, size.x / 2 / camera.aspect) * 1.04;
    const dist = reach / Math.tan(half) + size.z / 2;
    camera.position.set(0, size.y / 2 + dist * 0.1, dist);
    camera.lookAt(0, size.y / 2, 0);
    camera.updateProjectionMatrix();
  }

  let time = 0;
  let drag = 0;
  let dragFrom: number | null = null;
  const draw = () => {
    pivot.rotation.y = (motion ? Math.sin((time / SWAY_S) * Math.PI * 2) * SWAY : 0) + drag;
    renderer.render(scene, camera);
  };

  let onScreen = true;
  let raf = 0;
  let last = 0;
  let lastFrame = 0;
  let lost = false;
  const animating = () => motion && onScreen && document.visibilityState === 'visible' && !lost;

  function frame(now: number): void {
    raf = 0;
    if (!animating()) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS - 2) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    lastFrame = now;
    time += dt;
    // Let go, and it drifts back to facing you.
    if (dragFrom === null) drag *= Math.exp(-dt * 1.5);
    draw();
  }

  function start(): void {
    if (raf || !animating()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  // Drag sideways to turn Sprig round.
  const down = (e: PointerEvent) => {
    dragFrom = e.clientX;
    canvas.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    if (dragFrom === null) return;
    drag += ((e.clientX - dragFrom) / canvas.clientWidth) * Math.PI * 2;
    dragFrom = e.clientX;
    if (!animating()) draw();
  };
  const up = () => {
    dragFrom = null;
    // A full turn or more snaps to the nearest equivalent, so it doesn't unwind.
    drag = Math.atan2(Math.sin(drag), Math.cos(drag));
  };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);

  const sizer = new ResizeObserver(() => {
    resize();
    if (!animating()) draw();
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

  resize();
  draw();
  start();

  return {
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      sizer.disconnect();
      seen.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', up);
      model.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) {
          for (const v of Object.values(m)) if (v instanceof Texture) v.dispose();
          m.dispose();
        }
      });
      pmrem.dispose();
      env.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
