/**
 * Draws one scene into a full-screen <canvas> with WebGL 1.
 *
 * Kept deliberately light, because the page may stay open for hours next to a timer:
 * - renders at a reduced resolution (the scenes are soft, so it isn't visible)
 * - at most 30 frames per second, and none while the tab is hidden
 * - motion off / prefers-reduced-motion: draws a single still frame
 * - during a running focus session the scene slows down and fades back (calmer)
 */
import { fragmentSource, VERTEX } from './prelude';
import type { Palette, SceneDef } from './types';

const FRAME_MS = 1000 / 30;
const MAX_DPR = 1.5;
const RENDER_SCALE = 0.6;

export interface RunnerOptions {
  /** Current effective colour scheme. */
  dark: boolean;
  /** Page background colour as #rrggbb. */
  background: string;
  /** Animate at all (false: one still frame). */
  motion: boolean;
  /** A focus session is running: slow down and fade back. */
  focus: boolean;
}

export interface Runner {
  update(options: Partial<RunnerOptions>): void;
  bloom(): void;
  pointer(x: number, y: number): void;
  destroy(): void;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255];
}

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[scene] shader error:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/** Returns null if WebGL is unavailable or the scene fails to compile (caller falls back). */
export function createRunner(canvas: HTMLCanvasElement, def: SceneDef, initial: RunnerOptions): Runner | null {
  const gl = canvas.getContext('webgl', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    preserveDrawingBuffer: false,
  });
  if (!gl) return null;

  const vs = compile(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(def.shader));
  if (!vs || !fs) return null;
  const program = gl.createProgram()!;
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  gl.useProgram(program);

  // One triangle that covers the whole viewport.
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(program, 'a_pos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(program, name);
  const U = {
    res: u('u_res'),
    time: u('u_time'),
    pointer: u('u_pointer'),
    bloom: u('u_bloom'),
    veil: u('u_veil'),
    bg: u('u_bg'),
    dark: u('u_dark'),
    c: [u('u_c1'), u('u_c2'), u('u_c3'), u('u_c4')],
  };

  let opts = { ...initial };
  // Scene time starts somewhere random so each visit looks a little different.
  let sceneTime = Math.random() * 600;
  let speed = opts.focus ? 0.35 : 1;
  let veil = opts.focus ? 0.4 : 0.12;
  let bloomLevel = 0;
  const target = { x: 0, y: 0 };
  const ptr = { x: 0, y: 0 };
  let last = 0;
  let lastFrame = 0;
  let raf = 0;
  let lost = false;

  function applyColors(): void {
    const palette: Palette = opts.dark ? def.palettes.dark : def.palettes.light;
    palette.forEach((hex, i) => gl!.uniform3fv(U.c[i]!, hexToRgb(hex)));
    gl!.uniform3fv(U.bg, hexToRgb(opts.background));
    gl!.uniform1f(U.dark, opts.dark ? 1 : 0);
  }

  function resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR) * RENDER_SCALE;
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl!.viewport(0, 0, w, h);
    }
    gl!.uniform2f(U.res, w, h);
  }

  function draw(): void {
    if (lost) return;
    // Keep time small: float precision on mobile GPUs degrades with large values.
    gl!.uniform1f(U.time, sceneTime % 3600);
    gl!.uniform2f(U.pointer, ptr.x, ptr.y);
    gl!.uniform1f(U.bloom, bloomLevel);
    gl!.uniform1f(U.veil, veil);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
  }

  function animating(): boolean {
    return opts.motion && document.visibilityState === 'visible' && !lost;
  }

  function frame(now: number): void {
    raf = 0;
    if (!animating()) return;
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < FRAME_MS - 2) return;
    const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
    last = now;
    lastFrame = now;

    // Ease towards targets so every change is gentle.
    const k = 1 - Math.exp(-dt * 1.2);
    speed += ((opts.focus ? 0.35 : 1) - speed) * k;
    veil += ((opts.focus ? 0.4 : 0.12) - veil) * k;
    const kp = 1 - Math.exp(-dt * 2);
    ptr.x += (target.x - ptr.x) * kp;
    ptr.y += (target.y - ptr.y) * kp;
    bloomLevel = Math.max(0, bloomLevel - dt * 0.8);
    sceneTime += dt * speed;
    resize();
    draw();
  }

  function start(): void {
    if (raf || !animating()) return;
    last = 0;
    raf = requestAnimationFrame(frame);
  }

  function still(): void {
    if (lost) return;
    speed = opts.focus ? 0.35 : 1;
    veil = opts.focus ? 0.4 : 0.12;
    resize();
    draw();
  }

  const onResize = () => (animating() ? undefined : still());
  const onVisibility = () => (animating() ? start() : undefined);
  const onLost = (e: Event) => {
    e.preventDefault();
    lost = true;
  };
  const onRestored = () => {
    // Simplest robust recovery: let the owner rebuild us.
    canvas.dispatchEvent(new CustomEvent('scene:restore'));
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  applyColors();
  still();
  start();

  return {
    update(next) {
      opts = { ...opts, ...next };
      applyColors();
      if (animating()) start();
      else still();
    },
    bloom() {
      bloomLevel = 1;
      start();
    },
    pointer(x, y) {
      target.x = x;
      target.y = y;
    },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteBuffer(buffer);
    },
  };
}
